import logger from "@nexus/logger";
import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { commands, handleCommand } from "./commands";
import { config } from "./config";

const log = logger.child({ module: "the-machine" });

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
	log.info({ tag: readyClient.user.tag }, "bot ready");

	// Register commands globally
	const rest = new REST().setToken(config.DISCORD_TOKEN);
	try {
		log.info("registering slash commands");
		await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
			body: commands.map((c) => c.toJSON()),
		});
		log.info({ commandCount: commands.length }, "slash commands registered");
	} catch (error) {
		log.error({ error }, "failed to register commands");
	}

	readyClient.user.setActivity("managing servers");
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	const commandName = interaction.commandName;
	log.info({ command: commandName, user: interaction.user.tag }, "command received");

	try {
		await handleCommand(interaction);
		log.info({ command: commandName }, "command completed");
	} catch (error) {
		log.error({ error, command: commandName }, "command error");
		const content = "An error occurred while executing this command.";
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({ content, flags: 64 });
		} else {
			await interaction.reply({ content, flags: 64 });
		}
	}
});

client.login(config.DISCORD_TOKEN);
