const { connect } = require('mongoose');
const { warn, error, info, success } = require("../../utils/Console");
const config = require('../../config');

module.exports = async () => {
	warn('Started connecting to MongoDB...');

	await connect(process.env.MONGODB_URI || config.handler.database.uri).then(() => {
		success('MongoDB is connected to the atlas!');
	});
};