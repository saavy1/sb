import type { ChatInputCommandInteraction } from "discord.js";
import { appsCommand, handleAppsCommand } from "./apps";
import { askCommand, handleAskCommand } from "./ask";
import { handleHealthCommand, healthCommand } from "./health";
import { handleOpsCommand, opsCommand } from "./ops";
import { handleServerCommand, serverCommand } from "./server";
import { handleSystemCommand, systemCommand } from "./system";

export const commands = [
	askCommand,
	serverCommand,
	healthCommand,
	systemCommand,
	appsCommand,
	opsCommand,
];

export async function handleCommand(interaction: ChatInputCommandInteraction) {
	switch (interaction.commandName) {
		case "ask":
			return handleAskCommand(interaction);
		case "server":
			return handleServerCommand(interaction);
		case "health":
			return handleHealthCommand(interaction);
		case "system":
			return handleSystemCommand(interaction);
		case "apps":
			return handleAppsCommand(interaction);
		case "ops":
			return handleOpsCommand(interaction);
		default:
			await interaction.reply({
				content: "Unknown command",
				flags: 64, // Ephemeral
			});
	}
}
