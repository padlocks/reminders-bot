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

	async getMessages() {
		return this.reminder.messages;
	}

	async setMessages(message) {
		const messages = await Reminder.parseLimit(message);
		this.reminder.messages = messages;
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

	static async parseLimit(message, limit = 2000) {
		// Split the message into substrings of 2000 characters and prefer to split at new lines
		const messages = [];
		let currentMessage = '';
		for (const line of message.split('\n')) {
			if (currentMessage.length + line.length > limit) {
				messages.push(currentMessage);
				currentMessage = '';
			}
			currentMessage += line + '\n';
		}
		if (currentMessage) {
			messages.push(currentMessage);
		}
		return messages;
	}
}

module.exports = { Reminder };