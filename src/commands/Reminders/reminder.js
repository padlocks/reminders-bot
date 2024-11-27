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
			},
			{
				name: 'preview',
				description: 'Previews a reminder for your server.',
				type: 1, // 1 is the type for a subcommand
				options: []
			}
		]
	},
	options: {
		cooldown: 5000
	},
	permissions: ['ManageChannels'],
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
				.setMaxLength(4_000)
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
				const messages = await Reminder.parseLimit(reminderMessage);

				const confirm = new ButtonBuilder()
					.setCustomId('confirm-create-reminder')
					.setLabel('Confirm')
					.setStyle(ButtonStyle.Danger);

				const cancel = new ButtonBuilder()
					.setCustomId('cancel-create-reminder')
					.setLabel('Cancel')
					.setStyle(ButtonStyle.Secondary);

				const row = new ActionRowBuilder().addComponents(cancel, confirm);

				try {
					const parsedMessages = await Reminder.parseLimit(reminderMessage, 1990);
					const excerpt = parsedMessages.length > 0 ? parsedMessages[0] : null;
					await modalInteraction.reply({
						content: excerpt ? (excerpt + '...') : 'Invalid reminder message.',
						components: [row],
						ephemeral: true
					});


					const filter = i => i.customId === 'confirm-create-reminder' || i.customId === 'cancel-create-reminder';
					const collector = modalInteraction.channel.createMessageComponentCollector({ filter, time: 30000 });

					collector.on('collect', async i => {
						collector.stop();
						if (i.customId === 'confirm-create-reminder') {
							await i.update({ content: 'Reminder created successfully!', components: [] });

							const reminder = new Reminder({
								name: reminderName,
								messages: messages,
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
								
								await reminder.updateLastRun();

								for (const message of messages) {
									ch.send(message);
								}
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
				} catch (error) {
					// Ignore Unknown Interaction error
					if (error.code === 10062) return;
					if (error.code === 40060) return;
					console.error(error);
				}
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
			const reminderOptions = await Promise.all(reminders.map(async r => {
				const messages = await r.getMessages();

				if (messages.length === 0) {
					return {
						label: await r.getName(),
						description: 'No message provided.',
						value: (await r.getId()).toString()
					};
				}

				return {
					label: await r.getName(),
					description: messages[0].substring(0, 50), // Excerpt of the message
					value: (await r.getId()).toString()
				};
			}));

			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('select-reminder')
				.setPlaceholder('Select a reminder to delete')
				.addOptions(reminderOptions);

			// Create an action row and add the select menu to it
			const actionRow = new ActionRowBuilder().addComponents(selectMenu);

			// Send the select menu to the user
			try {
				await interaction.reply({
					content: 'Please select a reminder to delete:',
					components: [actionRow],
					ephemeral: true
				});

				// Create a collector to listen for the select menu
				const filter = i => i.customId === 'select-reminder' && i.user.id === interaction.user.id;
				const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

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
						const buttonCollector = interaction.channel.createMessageComponentCollector({ buttonFilter, time: 30000 });

						buttonCollector.on('collect', async btn => {
							try {
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
							} catch (error) {
								// Ignore
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
			} catch (error) {
				// Ignore Unknown Interaction error
				if (error.code === 10062) return;
				if (error.code === 40060) return;
				console.error(error);
			}
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
			fields = await Promise.all(reminders.map(async r => {
				const name = await r.getName();
				const messages = await r.getMessages();
				const cronTime = await r.getCronTime();

				if (messages.length === 0) {
					return {
						name: name + ' - ' + cronTime,
						value: 'No message provided.',
						inline: false
					};
				}

				let newMessages = await Reminder.parseLimit(messages[0], 1020);
				const message = newMessages[0] + '...';

				return {
					name: name + ' - ' + cronTime,
					value: message || 'No message provided.',
					inline: false
				};
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
		
			// Create a select menu with all reminders
			const reminderOptions = await Promise.all(reminders.map(async r => {
				const messages = await r.getMessages();

				if (messages.length === 0) {
					return {
						label: await r.getName(),
						description: 'No message provided.',
						value: (await r.getId()).toString()
					};
				}

				return {
					label: await r.getName(),
					description: messages[0].substring(0, 50), // Excerpt of the message
					value: (await r.getId()).toString()
				};
			}));
		
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
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });
		
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
					
					const reminderCron = new TextInputBuilder()
						.setCustomId('edit-reminder-cron-input')
						.setLabel('Cron Time')
						.setStyle(TextInputStyle.Short)
						.setPlaceholder(await reminder.getCronTime());

					const messages = await reminder.getMessages();
					const limitedMessages = await Reminder.parseLimit(messages[0], 100);
					const placeholder = limitedMessages.length > 0 ? limitedMessages[0] : 'No message provided.';
		
					const reminderMessage = new TextInputBuilder()
						.setCustomId('edit-reminder-message-input')
						.setLabel('Reminder Message')
						.setMaxLength(4_000)
						.setStyle(TextInputStyle.Paragraph)
						.setPlaceholder(placeholder);
		
					modal.addComponents(
						new ActionRowBuilder().addComponents(reminderName),
						new ActionRowBuilder().addComponents(reminderCron),
						new ActionRowBuilder().addComponents(reminderMessage)
					);
		
					await i.showModal(modal);
		
					const modalSubmitListener = async (modalInteraction) => {
						if (!modalInteraction.isModalSubmit() || modalInteraction.customId !== 'edit-reminder-modal') return;
		
						if (modalInteraction.replied) return;
		
						const reminderName = modalInteraction.fields.getTextInputValue('edit-reminder-name-input');
						const reminderCron = modalInteraction.fields.getTextInputValue('edit-reminder-cron-input');
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

						const parsedMessages = await Reminder.parseLimit(reminderMessage, 1990);
						const excerpt = parsedMessages.length > 0 ? parsedMessages[0] : null;
						await modalInteraction.update({
							content: excerpt ? (excerpt + '...') : 'Invalid reminder message.',
							components: [row],
							ephemeral: true
						});
		
						const filter = i => i.customId === 'confirm-edit-reminder' || i.customId === 'cancel-edit-reminder';
						const collector = modalInteraction.channel.createMessageComponentCollector({ filter, time: 30000 });
		
						collector.on('collect', async i => {
							collector.stop();
							if (i.customId === 'confirm-edit-reminder') {
								await i.update({ content: 'Reminder edited successfully!', components: [] });
								
								// If only each response could be blank, we could skip a field if it was not edited
								await reminder.setName(reminderName);
								await reminder.setCronTime(reminderCron);
								await reminder.setMessages(reminderMessage);

								// Reschedule the reminder
								const reminderId = (await reminder.getId()).toString();
								if (schedules.has(reminderId)) {
									const job = schedules.get(reminderId);
									job.stop();
									schedules.delete(reminderId);
								}

								const job = cron.schedule(await reminder.getCronTime(), async () => {
									const ch = await client.channels.fetch(await reminder.getChannel());
									const messages = await reminder.getMessages();
									await reminder.updateLastRun();

									for (const message of messages) {
										ch.send(message);
									}
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
		else if (subcommand === 'preview') {
			// Selection menu for reminders
			const guild = await Guild.getGuildById(interaction.guild.id);
			const reminders = await guild.getReminders();
		
			if (reminders.length === 0) {
				await interaction.reply({
					content: 'There are no reminders to preview.',
					ephemeral: true
				});
				return;
			}
		
			// Create a select menu with all reminders
			const reminderOptions = await Promise.all(reminders.map(async r => {
				const messages = await r.getMessages();

				if (messages.length === 0) {
					return {
						label: await r.getName(),
						description: 'No message provided.',
						value: (await r.getId()).toString()
					};
				}

				return {
					label: await r.getName(),
					description: messages[0].substring(0, 50), // Excerpt of the message
					value: (await r.getId()).toString()
				};
			}));
		
			const selectMenu = new StringSelectMenuBuilder()
				.setCustomId('select-reminder-preview')
				.setPlaceholder('Select a reminder to preview')
				.addOptions(reminderOptions);
		
			const actionRow = new ActionRowBuilder().addComponents(selectMenu);
		
			await interaction.reply({
				content: 'Please select a reminder to preview:',
				components: [actionRow],
				ephemeral: true
			});

			const filter = i => i.customId === 'select-reminder-preview' && i.user.id === interaction.user.id;
			const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000 });

			collector.on('collect', async i => {
				collector.stop();
				if (i.customId === 'select-reminder-preview') {
					const reminder = await Reminder.getReminderById(i.values[0]);
					const channelId = await reminder.getChannel();
					const channel = await client.channels.fetch(channelId);
					const messages = await reminder.getMessages();
					const name = await reminder.getName();

					for (const message of messages) {
						await channel.send(message);
					}

					await i.update({ content: `Previewed reminder: ${name}`, components: [] });
				}
			});
		}
	}
}).toJSON();