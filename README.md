# Reminders Discord Bot

This is a Discord bot for setting reminders, built using Discord.js 14, node-cron, and mongoose.

## Features

- Set reminders for specific times
- Recurring reminders using cron syntax
- Persistent storage of reminders using MongoDB

## Installation

1. Clone the repository:
    ```bash
    git clone https://github.com/yourusername/reminders-bot.git
    cd reminders-bot
    ```

2. Install dependencies:
    ```bash
    npm install
    ```

3. Set up your environment variables. Create a `.env` file in the root directory and add the following:
    ```
    DISCORD_TOKEN=your_discord_bot_token
    MONGODB_URI=your_mongodb_connection_string
    ```

## Usage

1. Start the bot:
    ```bash
    npm start
    ```

2. Invite the bot to your Discord server using the OAuth2 URL with the necessary permissions.

3. Use the bot commands to set and manage reminders.

## Commands

- `/reminder create <channel> <cron-time>`: Create a reminder.
- `/reminder delete`: For a select menu of reminders to delete.
- `/reminder list`: List out the reminders for the server.
- `/reminder edit`: Opens the creation modal to edit your reminder.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

## License

[**GPL-3.0**](./LICENSE), General Public License v3