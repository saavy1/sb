import { Client, Events, GatewayIntentBits, REST, Routes } from "discord.js";
import { config } from "./config";
import { commands, handleCommand } from "./commands";

const client = new Client({
	intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
	console.log(`Bot ready as ${readyClient.user.tag}`);

	// Register commands globally
	const rest = new REST().setToken(config.DISCORD_TOKEN);
	try {
		console.log("Registering slash commands...");
		await rest.put(Routes.applicationCommands(config.DISCORD_CLIENT_ID), {
			body: commands.map((c) => c.toJSON()),
		});
		console.log("Slash commands registered.");
	} catch (error) {
		console.error("Failed to register commands:", error);
	}

	readyClient.user.setActivity("managing servers");
});

client.on(Events.InteractionCreate, async (interaction) => {
	if (!interaction.isChatInputCommand()) return;

	try {
		await handleCommand(interaction);
	} catch (error) {
		console.error("Command error:", error);
		const content = "An error occurred while executing this command.";
		if (interaction.deferred || interaction.replied) {
			await interaction.followUp({ content, flags: 64 });
		} else {
			await interaction.reply({ content, flags: 64 });
		}
	}
});

client.login(config.DISCORD_TOKEN);
