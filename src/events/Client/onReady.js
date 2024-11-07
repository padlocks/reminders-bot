const { success } = require("../../utils/Console");
const Event = require("../../structure/Event");
const { ReminderModel } = require("../../models/ReminderModel");
const schedules = require('../../utils/Schedules');
const cron = require('node-cron'); 

module.exports = new Event({
    event: 'ready',
    once: true,
    run: (__client__, client) => {
        success('Logged in as ' + client.user.displayName + ', took ' + ((Date.now() - __client__.login_timestamp) / 1000) + "s.")

        // Set up the reminders
        let count = 0;
        ReminderModel.find({}).then(reminders => {
            reminders.forEach(reminder => {
                count++;
                const job = cron.schedule(reminder.cronTime, async () => {
                    const channel = await client.channels.fetch(reminder.channel);
                    if (!channel) return;

                    channel.send(reminder.message);
                });

                schedules.set(reminder._id.toString(), job);
            });
            success('Loaded ' + count + ' reminders.');
        });
    }
}).toJSON();