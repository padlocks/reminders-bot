const { REST, Routes } = require('discord.js');
const { info, error, success } = require('../../utils/Console');
const { readdirSync } = require('fs');
const DiscordBot = require('../DiscordBot');
const ApplicationCommand = require('../../structure/ApplicationCommand');
const MessageCommand = require('../../structure/MessageCommand');

class CommandsHandler {
    client;
    commandsRegistered = false; // Track if commands are already registered

    constructor(client) {
        this.client = client;
    }

    load = () => {
        // Clear collections to avoid duplication if reloading
        this.client.collection.application_commands.clear();
        this.client.collection.message_commands.clear();
        this.client.collection.message_commands_aliases.clear();
        this.client.rest_application_commands_array = [];

        for (const directory of readdirSync('./src/commands/')) {
            for (const file of readdirSync('./src/commands/' + directory).filter(f => f.endsWith('.js'))) {
                try {
                    const module = require('../../commands/' + directory + '/' + file);

                    if (!module) continue;

                    if (module.__type__ === 2) { // Message command
                        if (!module.command || !module.run) {
                            error('Unable to load the message command ' + file);
                            continue;
                        }

                        this.client.collection.message_commands.set(module.command.name, module);

                        if (module.command.aliases && Array.isArray(module.command.aliases)) {
                            module.command.aliases.forEach((alias) => {
                                this.client.collection.message_commands_aliases.set(alias, module.command.name);
                            });
                        }

                        info('Loaded new message command: ' + file);
                    } else if (module.__type__ === 1) { // Application command
                        if (!module.command || !module.run) {
                            error('Unable to load the application command ' + file);
                            continue;
                        }

                        this.client.collection.application_commands.set(module.command.name, module);
                        this.client.rest_application_commands_array.push(module.command);

                        info('Loaded new application command: ' + file);
                    } else {
                        error('Invalid command type ' + module.__type__ + ' from command file ' + file);
                    }
                } catch (e) {
                    error('Unable to load a command from the path: ' + 'src/commands/' + directory + '/' + file);
                    error(e);
                }
            }
        }

        success(`Successfully loaded ${this.client.collection.application_commands.size} application commands and ${this.client.collection.message_commands.size} message commands.`);
    }

    registerApplicationCommands = async (development, restOptions = null) => {
        if (this.commandsRegistered) {
            info("Commands are already registered, skipping re-registration.");
            return;
        }

        const rest = new REST(restOptions ? restOptions : { version: '10' }).setToken(this.client.token);

        try {
            if (development.enabled) {
                await rest.put(Routes.applicationGuildCommands(this.client.user.id, development.guildId), { body: this.client.rest_application_commands_array });
            } else {
                await rest.put(Routes.applicationCommands(this.client.user.id), { body: this.client.rest_application_commands_array });
            }
            this.commandsRegistered = true; // Set flag to prevent re-registration
            success("Application commands registered successfully.");
        } catch (err) {
            error("Failed to register application commands: ", err);
        }
    }
}

module.exports = CommandsHandler;
