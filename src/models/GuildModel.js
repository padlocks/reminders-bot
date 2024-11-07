const { model, Schema } = require('mongoose');

const GuildSchema = new Schema({
	id: {
		type: String,
		required: true,
		unique: true,
	},
	prefix: {
		type: String,
		default: '?',
	},
	reminders: [{
		type: Schema.Types.ObjectId,
		ref: 'Reminder',
	}],
}, { timestamps: true });


const GuildModel = model('Guild', GuildSchema);
module.exports = { GuildModel };