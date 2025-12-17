/**
 * /system command - Display system health and statistics
 */

import logger from "@nexus/logger";
import { ChatInputCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { client } from "../api";
import {
	COLORS,
	formatBytes,
	formatPercent,
	machineEmbed,
	progressBar,
	errorEmbed,
} from "../utils/embeds";

const log = logger.child({ module: "system-command" });

export const systemCommand = new ChatInputCommandBuilder()
	.setName("system")
	.setDescription("Display system health and statistics");

export async function handleSystemCommand(interaction: ChatInputCommandInteraction) {
	try {
		const { data, error } = await client.api.systemInfo.overview.get();

		if (error || !data) {
			log.error({ error }, "Failed to fetch system info");
			await interaction.reply({
				embeds: [errorEmbed("Failed to fetch system info", "Could not connect to the API")],
			});
			return;
		}

		const { stats, drives, databases } = data;

		// Build the main embed
		const embed = machineEmbed("System Health")
			.setColor(COLORS.ACCENT)
			.setDescription("Real-time system statistics from Superbloom");

		// CPU stats
		const cpuUsage = stats.cpu.usage;
		const cpuColor = cpuUsage > 90 ? "🔴" : cpuUsage > 70 ? "🟡" : "🟢";
		embed.addFields({
			name: `${cpuColor} CPU`,
			value: [
				`\`${progressBar(cpuUsage)}\` ${formatPercent(cpuUsage)}`,
				`${stats.cpu.coreCount} cores @ ${stats.cpu.speed}MHz`,
			].join("\n"),
			inline: true,
		});

		// Memory stats
		const memUsage = stats.memory.usagePercent;
		const memColor = memUsage > 90 ? "🔴" : memUsage > 70 ? "🟡" : "🟢";
		embed.addFields({
			name: `${memColor} Memory`,
			value: [
				`\`${progressBar(memUsage)}\` ${formatPercent(memUsage)}`,
				`${stats.memory.used}/${stats.memory.total} GB`,
			].join("\n"),
			inline: true,
		});

		// GPU stats (if available)
		if (stats.gpu?.available) {
			const gpuUsage = stats.gpu.usage ?? 0;
			const gpuColor = gpuUsage > 90 ? "🔴" : gpuUsage > 70 ? "🟡" : "🟢";
			embed.addFields({
				name: `${gpuColor} GPU`,
				value: [
					`\`${progressBar(gpuUsage)}\` ${formatPercent(gpuUsage)}`,
					stats.gpu.name ?? "Unknown GPU",
					stats.gpu.temperature ? `${stats.gpu.temperature}°C` : "",
				]
					.filter(Boolean)
					.join("\n"),
				inline: true,
			});
		}

		// Network stats
		embed.addFields({
			name: "📡 Network",
			value: `↓ ${stats.network.totalRxSpeed} MB/s  ↑ ${stats.network.totalTxSpeed} MB/s`,
			inline: true,
		});

		// Disk I/O
		embed.addFields({
			name: "💾 Disk I/O",
			value: `↓ ${stats.disk.readSpeed} MB/s  ↑ ${stats.disk.writeSpeed} MB/s`,
			inline: true,
		});

		// Uptime
		embed.addFields({
			name: "⏱️ Uptime",
			value: stats.uptime.formatted,
			inline: true,
		});

		// Storage drives
		if (drives && drives.length > 0) {
			const driveLines = drives
				.filter((d) => d.mounted)
				.map((d) => {
					const usage = d.usagePercent ?? 0;
					const color = usage > 90 ? "🔴" : usage > 70 ? "🟡" : "🟢";
					return `${color} **${d.label}**: ${d.used}/${d.total}GB (${formatPercent(usage)})`;
				});

			if (driveLines.length > 0) {
				embed.addFields({
					name: "📁 Storage",
					value: driveLines.join("\n"),
					inline: false,
				});
			}
		}

		// Databases
		if (databases && databases.length > 0) {
			const totalSize = databases.reduce((sum, db) => sum + db.sizeBytes, 0);
			const totalRows = databases.reduce((sum, db) => sum + (db.rowCount ?? 0), 0);
			embed.addFields({
				name: "🗄️ Databases",
				value: `${databases.length} schemas • ${formatBytes(totalSize)} • ${totalRows.toLocaleString()} rows`,
				inline: false,
			});
		}

		await interaction.reply({ embeds: [embed] });
	} catch (err) {
		log.error({ err }, "Error in /system command");
		await interaction.reply({
			embeds: [errorEmbed("Error", "An unexpected error occurred")],
		});
	}
}
