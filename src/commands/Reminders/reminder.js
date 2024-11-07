const { ChatInputCommandInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ButtonBuilder, ButtonStyle, ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder } = require("discord.js");
const DiscordBot = require("../../client/DiscordBot");
const ApplicationCommand = require("../../structure/ApplicationCommand");
const { Guild } = require("../../structure/Guild");
const { Reminder } = require("../../structure/Reminder");
const cron = require('node-cron');
const schedules = require("../../utils/Schedules");
const buttonPagination = require("../../utils/ButtonPagination");

module.exports = new ApplicationCommand({
	command: {
		name: 'reminder',
		description: 'Manage reminders for your server.',
		type: 1,
		options: [
			{
				name: 'create',
				description: 'Creates a reminder for your server.',
				type: 1, // 1 is the type for a subcommand
				options: [
					{
						name: 'channel',
						description: 'The channel to set the reminder in',
						type: 7, // 7 is the type for a channel
						required: true
					},
					{
						name: 'cron-time',
						description: 'A cron expression for the reminder. https://crontab.cronhub.io/ can help you generate one.',
						type: 3, // 3 is the type for a string
						required: true
					}
				]
			},
			{
				name: 'delete',
				description: 'Deletes a reminder from your server.',
				type: 1, // 1 is the type for a subcommand
				options: []
			},
			{
				name: 'list',
				description: 'Lists all reminders for your server.',
				type: 1, // 1 is the type for a subcommand
				options: []
			},
			{
				name: 'edit',
				description: 'Edits a reminder for your server.',
				type: 1, // 1 is the type for a subcommand
				options: []
			}
		]
	},
	options: {
		cooldown: 10000
	},
	/**
	 * 
	 * @param {DiscordBot} client 
	 * @param {ChatInputCommandInteraction} interaction 
	 */
	run: async (client, interaction) => {
		const subcommand = interaction.options.getSubcommand();

		if (subcommand === 'create') {
			const channel = interaction.options.getChannel('channel');
			const cronTime = interaction.options.getString('cron-time');

			// Validate the cron expression
			if (!cron.validate(cronTime)) {
				return interaction.reply({ content: 'Invalid cron expression.', ephemeral: true });
			}

			// Create and display the modal
			const modal = new ModalBuilder()
				.setCustomId('create-reminder-modal')
				.setTitle('Create Reminder');

			const reminderName = new TextInputBuilder()
				.setCustomId('reminder-name-input')
				.setLabel('Name of Reminder')
				.setStyle(TextInputStyle.Short);

			const reminderMessage = new TextInputBuilder()
				.setCustomId('reminder-message-input')
				.setLabel('Reminder Message')
				.setMaxLength(2_000)
				.setStyle(TextInputStyle.Paragraph);

			modal.addComponents(
				new ActionRowBuilder().addComponents(reminderName),
				new ActionRowBuilder().addComponents(reminderMessage)
			);

			await interaction.showModal(modal);

			// Temporary listener for modal submission
			const modalSubmitListener = async (modalInteraction) => {
				if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== 'create-reminder-modal') return;

				// Clean up listener immediately after handling modal submission
				client.removeListener('interactionCreate', modalSubmitListener);

				const reminderName = modalInteraction.fields.getTextInputValue('reminder-name-input');
				const reminderMessage = modalInteraction.fields.getTextInputValue('reminder-message-input');

				const confirm = new ButtonBuilder()
					.setCustomId('confirm-create-reminder')
					.setLabel('Confirm')
					.setStyle(ButtonStyle.Danger);

				const cancel = new ButtonBuilder()
					.setCustomId('cancel-create-reminder')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Secondary);

				const row = new ActionRowBuilder().addComponents(cancel, confirm);

				await modalInteraction.reply({
					content: `Reminder Preview:\n**Name:** ${reminderName}\n**Message:**\n${reminderMessage}\n\nIs this correct?`,
					components: [row],
					ephemeral: true
				});

				const filter = i => i.customId === 'confirm-create-reminder' || i.customId === 'cancel-create-reminder';
				const collector = modalInteraction.channel.createMessageComponentCollector({ filter, time: 15000 });

				collector.on('collect', async i => {
					collector.stop();
					if (i.customId === 'confirm-create-reminder') {
						await i.update({ content: 'Reminder created successfully!', components: [] });

						const reminder = new Reminder({
							name: reminderName,
							message: reminderMessage,
							guild: interaction.guild.id,
							createdBy: interaction.user.id,
							channel: channel.id,
							cronTime: cronTime
						});
						await reminder.save();

						const guild = await Guild.getGuildById(interaction.guild.id);
						await guild.addReminder(reminder);

						// Schedule the reminder using node-cron
						const job = cron.schedule(cronTime, async () => {
							const ch = await client.channels.fetch(channel.id);
							ch.send(reminderMessage);
						});

						schedules.set((await reminder.getId()).toString(), job);

					} else if (i.customId === 'cancel-create-reminder') {
						await i.update({ content: 'Reminder creation cancelled.', components: [] });
					}
				});

				collector.on('end', collected => {
					if (collected.size === 0) {
						modalInteraction.editReply({ content: 'No response received. Reminder creation timed out.', components: [] });
					}
				});
			};

			// Register the listener
			client.on('interactionCreate', modalSubmitListener);
		}
		else if (subcommand === 'delete') {
			const guild = await Guild.getGuildById(interaction.guild.id);

			// Get all reminders
			const reminders = await guild.getReminders();

			if (reminders.length === 0) {
				await interaction.reply({
					content: 'There are no reminders to delete.',
					ephemeral: true
				});
				return;
			}

			// Create a select menu with all reminders
			const reminderOptions = await Promise.all(reminders.map(async reminder => ({
				label: await reminder.getName(),
				description: (await reminder.getMessage()).substring(0, 50), // Excerpt of the message
				value: (await reminder.getId()).toString()
			})));

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('select-reminder')
				.setPlaceholder('Select a reminder to delete')
				.addOptions(reminderOptions);

			// Create an action row and add the select menu to it
			const actionRow = new ActionRowBuilder().addComponents(selectMenu);

			// Send the select menu to the user
			await interaction.reply({
				content: 'Please select a reminder to delete:',
				components: [actionRow],
				ephemeral: true
			});

			// Create a collector to listen for the select menu
			const filter = i => i.customId === 'select-reminder' && i.user.id === interaction.user.id;
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });

			collector.on('collect', async i => {
				if (i.customId === 'select-reminder') {
					const r = await Reminder.getReminderById(i.values[0]);

					// Create confirm and cancel buttons
					const confirmButton = new ButtonBuilder()
						.setCustomId('confirm-delete')
						.setLabel('Confirm')
						.setStyle(ButtonStyle.Danger);

					const cancelButton = new ButtonBuilder()
						.setCustomId('cancel-delete')
						.setLabel('Cancel')
						.setStyle(ButtonStyle.Secondary);

					const buttonRow = new ActionRowBuilder().addComponents(cancelButton, confirmButton);

					await i.update({
						content: `Are you sure you want to delete the reminder: "${await r.getName()}"?`,
						components: [buttonRow]
					});

					const buttonFilter = btn => ['confirm-delete', 'cancel-delete'].includes(btn.customId) && btn.user.id === interaction.user.id;
					const buttonCollector = interaction.channel.createMessageComponentCollector({ buttonFilter, time: 15000 });

					buttonCollector.on('collect', async btn => {
						if (btn.customId === 'confirm-delete') {
							// Unschedule the reminder
							const reminderId = (await r.getId()).toString();
							if (schedules.has(reminderId)) {
								const job = schedules.get(reminderId);
								job.stop();
								schedules.delete(reminderId);
							}

							await guild.removeReminder(r);
							await r.delete();
							
							await btn.update({ content: 'Reminder deleted.', components: [] });
						} else if (btn.customId === 'cancel-delete') {
							await btn.update({ content: 'Reminder deletion canceled.', components: [] });
						}
					});

					buttonCollector.on('end', collected => {
						if (collected.size === 0) {
							i.editReply({ content: 'No response received. Reminder deletion timed out.', components: [] });
						}
					});
				}
			});

			collector.on('end', collected => {
				if (collected.size === 0) {
					interaction.editReply({ content: 'No response received. Reminder selection timed out.', components: [] });
				}
			});
		}
		else if (subcommand === 'list') {
			const guild = await Guild.getGuildById(interaction.guild.id);
			const reminders = await guild.getReminders();

			if (reminders.length === 0) {
				await interaction.reply({
					content: 'There are no reminders to list.',
					ephemeral: true
				});
				return;
			}

			const embeds = [];
			let fields = [];
			fields = await Promise.all(reminders.map(async reminder => {
				const name = await reminder.getName();
				const message = await reminder.getMessage();
				const cronTime = await reminder.getCronTime();

				return {
					name: name + ' - ' + cronTime,
					value: message,
					inline: false
				}
			}));

			const chunkSize = 1;

			for (let i = 0; i < fields.length; i += chunkSize) {
				const chunk = fields.slice(i, i + chunkSize);

				embeds.push(new EmbedBuilder()
					.setFooter({ text: `Page ${Math.floor(i / chunkSize) + 1} / ${Math.ceil(fields.length / chunkSize)} ` })
					.setTitle('Reminder List')
					.setColor('Green')
					.addFields(chunk),
				);
			}
			
			await buttonPagination(interaction, embeds);
		}
		else if (subcommand === 'edit') {
			// Selection menu for reminders
			const guild = await Guild.getGuildById(interaction.guild.id);
			const reminders = await guild.getReminders();
		
			if (reminders.length === 0) {
				await interaction.reply({
					content: 'There are no reminders to edit.',
					ephemeral: true
				});
				return;
			}
		
			const reminderOptions = await Promise.all(reminders.map(async reminder => ({
				label: await reminder.getName(),
				description: (await reminder.getMessage()).substring(0, 50), // Excerpt of the message
				value: (await reminder.getId()).toString()
			})));
		
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('select-reminder-edit')
				.setPlaceholder('Select a reminder to edit')
				.addOptions(reminderOptions);
		
			const actionRow = new ActionRowBuilder().addComponents(selectMenu);
		
			await interaction.reply({
				content: 'Please select a reminder to edit:',
				components: [actionRow],
				ephemeral: true
			});
		
			const filter = i => i.customId === 'select-reminder-edit' && i.user.id === interaction.user.id;
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 15000 });
		
			collector.on('collect', async i => {
				if (i.customId === 'select-reminder-edit') {
					const reminder = await Reminder.getReminderById(i.values[0]);
		
					const modal = new ModalBuilder()
						.setCustomId('edit-reminder-modal')
						.setTitle('Edit Reminder');
		
					const reminderName = new TextInputBuilder()
						.setCustomId('edit-reminder-name-input')
						.setLabel('Name of Reminder')
						.setStyle(TextInputStyle.Short)
						.setPlaceholder(await reminder.getName());
		
					const reminderMessage = new TextInputBuilder()
						.setCustomId('edit-reminder-message-input')
						.setLabel('Reminder Message')
						.setMaxLength(2_000)
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder(await reminder.getMessage());
		
					modal.addComponents(
						new ActionRowBuilder().addComponents(reminderName),
						new ActionRowBuilder().addComponents(reminderMessage)
					);
		
					await i.showModal(modal);
		
					const modalSubmitListener = async (modalInteraction) => {
						if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== 'edit-reminder-modal') return;
		
						if (modalInteraction.replied) return;
		
						const reminderName = modalInteraction.fields.getTextInputValue('edit-reminder-name-input');
						const reminderMessage = modalInteraction.fields.getTextInputValue('edit-reminder-message-input');
		
						const confirm = new ButtonBuilder()
							.setCustomId('confirm-edit-reminder')
							.setLabel('Confirm')
							.setStyle(ButtonStyle.Danger);
		
						const cancel = new ButtonBuilder()
							.setCustomId('cancel-edit-reminder')
							.setLabel('Cancel')
							.setStyle(ButtonStyle.Secondary);
		
						const row = new ActionRowBuilder().addComponents(cancel, confirm);
		
						await modalInteraction.update({
							content: `Reminder Preview:\n**Name:** ${reminderName}\n**Message:**\n${reminderMessage}\n\nIs this correct?`,
							components: [row],
							ephemeral: true
						});
		
						const filter = i => i.customId === 'confirm-edit-reminder' || i.customId === 'cancel-edit-reminder';
						const collector = modalInteraction.channel.createMessageComponentCollector({ filter, time: 15000 });
		
						collector.on('collect', async i => {
							collector.stop();
							if (i.customId === 'confirm-edit-reminder') {
								await i.update({ content: 'Reminder edited successfully!', components: [] });
		
								await reminder.setName(reminderName);
								await reminder.setMessage(reminderMessage);

								// Reschedule the reminder
								const reminderId = (await reminder.getId()).toString();
								if (schedules.has(reminderId)) {
									const job = schedules.get(reminderId);
									job.stop();
									schedules.delete(reminderId);
								}

								const job = cron.schedule(await reminder.getCronTime(), async () => {
									const ch = await client.channels.fetch(await reminder.getChannel());
									ch.send(await reminder.getMessage());
								});

								schedules.set(reminderId, job);
		
							} else if (i.customId === 'cancel-edit-reminder') {
								await i.update({ content: 'Reminder edit cancelled.', components: [] });
							}
						});
		
						collector.on('end', collected => {
							if (collected.size === 0) {
								modalInteraction.editReply({ content: 'No response received. Reminder edit timed out.', components: [] });
							}
						});
					};
		
					// Register the listener for modal interaction
					client.on('interactionCreate', modalSubmitListener);
				}
			});
		
			collector.on('end', collected => {
				if (collected.size === 0) {
					interaction.editReply({ content: 'No response received. Reminder selection timed out.', components: [] });
				}
			});
		}
	}
}).toJSON();