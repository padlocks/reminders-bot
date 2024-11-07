const { success } = require("../../utils/Console");
const Event = require("../../structure/Event");
const { Guild } = require('../../structure/Guild');

module.exports = new Event({
    event: 'interactionCreate',
    once: false,
    run: async (client, interaction) => {
        // If the current guild has no data in the database, create a new one
		const guild = await Guild.getGuildById(interaction.guildId);
		
		if (!guild) {
			await new Guild({ id: interaction.guildId, reminders: [] }).save();
		}
    }
}).toJSON();