const { default: mongoose } = require('mongoose');
const { ReminderModel } = require('../models/ReminderModel');

class Reminder {
	constructor(data) {
		this.reminder = new ReminderModel(data);
	}

	save() {
		return ReminderModel.findOneAndUpdate({ _id: this.reminder._id }, this.reminder, { upsert: true });
	}

	delete() {
		return ReminderModel.findOneAndDelete({ _id: this.reminder._id });
	}

	async get() {
		return await ReminderModel.findOne({ _id: this.reminder._id });
	}

	async getId() {
		return this.reminder._id;
	}

	async getName() {
		return this.reminder.name;
	}

	async setName(name) {
		this.reminder.name = name;
		return this.save();
	}

	async getMessage() {
		return this.reminder.message;
	}

	async setMessage(message) {
		this.reminder.message = message;
		return this.save();
	}

	async getCronTime() {
		return this.reminder.cronTime;
	}

	async setCronTime(cronTime) {
		this.reminder.cronTime = cronTime;
		return this.save();
	}

	async getChannel() {
		return this.reminder.channel;
	}

	async setChannel(channel) {
		this.reminder.channel = channel;
		return this.save();
	}

	async getGuild() {
		return this.reminder.guild;
	}

	async setGuild(guild) {
		this.reminder.guild = guild;
		return this.save();
	}

	async getAuthor() {
		return this.reminder.createdBy;
	}

	async getCreatedAt() {
		return this.reminder.createdAt;
	}

	async getUpdatedAt() {
		return this.reminder.updatedAt;
	}

	async getLastRun() {
		return this.reminder.lastRun;
	}

	async updateLastRun() {
		this.reminder.lastRun = Date.now();
		return this.save();
	}

	static async getReminderById(reminderId) {
		const reminderData = await ReminderModel.findOne({ _id: reminderId });
		if (!reminderData) {
			return null;
		}
		return new Reminder(reminderData);
	}
}

module.exports = { Reminder };