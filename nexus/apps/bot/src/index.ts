// Initialize telemetry first, before other imports
import { initTelemetry, withSpan } from "@nexus/core/infra/telemetry";

initTelemetry("nexus-bot");

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

	await withSpan("discord", `command.${commandName}`, async (span) => {
		span.setAttribute("discord.command", commandName);
		span.setAttribute("discord.user_id", interaction.user.id);
		span.setAttribute("discord.user_tag", interaction.user.tag);
		span.setAttribute("discord.guild_id", interaction.guildId ?? "dm");
		span.setAttribute("discord.channel_id", interaction.channelId);

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
});

client.login(config.DISCORD_TOKEN);
