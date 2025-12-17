/**
 * Discord Embed Utilities
 * Matches "The Machine Design System" colors from the UI
 */

import { EmbedBuilder } from "discord.js";

// === Color Palette (matching UI theme) ===
export const COLORS = {
	// Primary colors
	ACCENT: 0x0080ff, // Blue - primary accent
	ACCENT_HOVER: 0x3399ff,

	// Semantic colors
	SUCCESS: 0x22c55e, // Green
	WARNING: 0xfbbf24, // Yellow/Amber
	ERROR: 0xef4444, // Red
	INFO: 0x0080ff, // Blue (same as accent)

	// Status colors (for servers, pods, etc.)
	RUNNING: 0x22c55e, // Green
	STARTING: 0xfbbf24, // Yellow
	STOPPING: 0xf97316, // Orange
	STOPPED: 0xef4444, // Red
	UNKNOWN: 0x6b7280, // Gray

	// Special
	AGENT: 0x8b5cf6, // Purple - for AI/agent responses
	DISCORD_BLURPLE: 0x5865f2,
} as const;

// === Status Helpers ===
export function statusColor(status: string): number {
	const normalized = status.toLowerCase();
	switch (normalized) {
		case "running":
		case "ready":
		case "healthy":
		case "online":
		case "success":
			return COLORS.SUCCESS;
		case "starting":
		case "pending":
		case "progressing":
			return COLORS.WARNING;
		case "stopping":
		case "terminating":
			return COLORS.STOPPING;
		case "stopped":
		case "failed":
		case "error":
		case "unhealthy":
		case "offline":
			return COLORS.ERROR;
		default:
			return COLORS.UNKNOWN;
	}
}

export function statusEmoji(status: string): string {
	const normalized = status.toLowerCase();
	switch (normalized) {
		case "running":
		case "ready":
		case "healthy":
		case "online":
		case "success":
			return "🟢";
		case "starting":
		case "pending":
		case "progressing":
			return "🟡";
		case "stopping":
		case "terminating":
			return "🟠";
		case "stopped":
		case "failed":
		case "error":
		case "unhealthy":
		case "offline":
			return "🔴";
		default:
			return "⚪";
	}
}

// === Formatting Helpers ===
export function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function formatUptime(seconds: number): string {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);

	const parts = [];
	if (days > 0) parts.push(`${days}d`);
	if (hours > 0) parts.push(`${hours}h`);
	parts.push(`${minutes}m`);

	return parts.join(" ");
}

export function formatPercent(value: number): string {
	return `${Math.round(value)}%`;
}

export function progressBar(percent: number, length = 10): string {
	const filled = Math.round((percent / 100) * length);
	const empty = length - filled;
	return `${"█".repeat(filled)}${"░".repeat(empty)}`;
}

// === Embed Builders ===

/**
 * Create a standard embed with The Machine branding
 */
export function machineEmbed(title?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS.ACCENT).setTimestamp();

	if (title) {
		embed.setTitle(title);
	}

	return embed;
}

/**
 * Create an agent response embed
 */
export function agentEmbed(response: string, threadId?: string): EmbedBuilder {
	const embed = new EmbedBuilder()
		.setColor(COLORS.AGENT)
		.setAuthor({ name: "The Machine" })
		.setDescription(response.length > 4000 ? `${response.slice(0, 3997)}...` : response)
		.setTimestamp();

	if (threadId) {
		embed.setFooter({ text: `Thread: ${threadId}` });
	}

	return embed;
}

/**
 * Create a success embed
 */
export function successEmbed(title: string, description?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS.SUCCESS).setTitle(`✓ ${title}`).setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	return embed;
}

/**
 * Create an error embed
 */
export function errorEmbed(title: string, description?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS.ERROR).setTitle(`✗ ${title}`).setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	return embed;
}

/**
 * Create a warning embed
 */
export function warningEmbed(title: string, description?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS.WARNING).setTitle(`⚠ ${title}`).setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	return embed;
}

/**
 * Create an info embed
 */
export function infoEmbed(title: string, description?: string): EmbedBuilder {
	const embed = new EmbedBuilder().setColor(COLORS.INFO).setTitle(title).setTimestamp();

	if (description) {
		embed.setDescription(description);
	}

	return embed;
}
