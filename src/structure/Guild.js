const { default: mongoose } = require('mongoose');
const { GuildModel } = require('../models/GuildModel');
const { Reminder } = require('./Reminder');

class Guild {
	constructor(data) {
		this.guild = new GuildModel(data);
	}

	save() {
		return GuildModel.findOneAndUpdate({ _id: this.guild._id }, this.guild, { upsert: true });
	}

	delete() {
		return GuildModel.findOneAndDelete({ _id: this.guild._id });
	}

	async get() {
		return await GuildModel.findOne({ _id: this.guild._id });
	}

	async getId() {
		return this.guild.id;
	}

	async getPrefix() {
		return this.guild.prefix;
	}

	async setPrefix(prefix) {
		this.guild.prefix = prefix;
		return this.save();
	}

	async getCreatedAt() {
		return this.guild.createdAt;
	}

	async getUpdatedAt() {
		return this.guild.updatedAt;
	}

	async getReminders() {
		const reminders = await Promise.all(this.guild.reminders.map(async reminder => await Reminder.getReminderById(reminder)));
		return reminders;
	}

	async addReminder(reminder) {
		this.guild.reminders.push(await reminder.getId());
		return this.save();
	}

	async removeReminder(reminder) {
		const reminderId = await reminder.getId();
		this.guild.reminders = this.guild.reminders.filter(r => r.valueOf() !== reminderId.toString());
		return this.save();
	}

	async clearReminders() {
		this.guild.reminders = [];
		return this.save();
	}

	static async getGuildById(guildId) {
		const guildData = await GuildModel.findOne({ id: guildId });
		if (!guildData) {
			return null;
		}
		return new Guild(guildData);
	}
}

module.exports = { Guild };