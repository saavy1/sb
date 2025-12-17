/**
 * /apps command - Display application health status
 */

import logger from "@nexus/logger";
import {
	ChatInputCommandBuilder,
	type ChatInputCommandInteraction,
	EmbedBuilder,
	MessageFlags,
} from "discord.js";
import { client } from "../api";
import { COLORS, statusEmoji } from "../utils/embeds";

const log = logger.child({ module: "apps-command" });

export const appsCommand = new ChatInputCommandBuilder()
	.setName("apps")
	.setDescription("Display application health status");

export async function handleAppsCommand(interaction: ChatInputCommandInteraction) {
	try {
		const { data, error } = await client.api.apps.get();

		if (error || !data) {
			log.error({ error }, "Failed to fetch apps");
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ERROR)
						.setTitle("✗ Failed to fetch apps")
						.setDescription("Could not connect to the API"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		const apps = Array.isArray(data) ? data : [];

		if (apps.length === 0) {
			await interaction.reply({
				embeds: [
					new EmbedBuilder()
						.setColor(COLORS.ACCENT)
						.setTitle("Applications")
						.setDescription("No applications configured"),
				],
				flags: MessageFlags.Ephemeral,
			});
			return;
		}

		// Count by status (up/down/unknown)
		const up = apps.filter((a) => a.status === "up").length;
		const down = apps.filter((a) => a.status === "down").length;
		const unknown = apps.filter((a) => a.status === "unknown").length;

		// Determine overall color
		let color: number = COLORS.SUCCESS;
		if (down > 0) color = COLORS.ERROR;
		else if (unknown > 0) color = COLORS.WARNING;

		const embed = new EmbedBuilder()
			.setColor(color)
			.setTitle("Applications")
			.setDescription(`**${up}** up • **${down}** down • **${unknown}** unknown`)
			.setTimestamp();

		// Build app list
		const appLines = apps.map((app) => {
			const emoji = statusEmoji(
				app.status === "up" ? "healthy" : app.status === "down" ? "error" : "unknown"
			);
			const url = app.url ? ` • [${new URL(app.url).hostname}](${app.url})` : "";
			return `${emoji} **${app.name}**${url}`;
		});

		embed.addFields({
			name: "Status",
			value: appLines.join("\n") || "No apps",
			inline: false,
		});

		await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
	} catch (err) {
		log.error({ err }, "Error in /apps command");
		await interaction.reply({
			embeds: [
				new EmbedBuilder()
					.setColor(COLORS.ERROR)
					.setTitle("✗ Error")
					.setDescription("An unexpected error occurred"),
			],
			flags: MessageFlags.Ephemeral,
		});
	}
}
