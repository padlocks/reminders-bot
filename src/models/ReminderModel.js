const { model, Schema } = require('mongoose');

const ReminderSchema = new Schema({
	name: {
		type: String,
		required: true,
	},
	message: {
		type: String,
		required: true,
	},
	cronTime: {
		type: String,
		required: true,
	},
	channel: {
		type: String,
		required: true,
	},
	guild: {
		type: String,
		required: true,
	},
	createdBy: {
		type: String,
		required: true,
	},
}, { timestamps: true });


const ReminderModel = model('Reminder', ReminderSchema);
module.exports = { ReminderModel };