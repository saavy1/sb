import type { ChatInputCommandInteraction } from "discord.js";
import { handleHealthCommand, healthCommand } from "./health";
import { handleServerCommand, serverCommand } from "./server";

export const commands = [serverCommand, healthCommand];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
	switch (interaction.commandName) {
		case "server":
			return handleServerCommand(interaction);
		case "health":
			return handleHealthCommand(interaction);
		default:
			await interaction.reply({
				content: "Unknown command",
				flags: 64, // Ephemeral
			});
	}
}
