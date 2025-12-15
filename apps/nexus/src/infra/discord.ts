import logger from "logger";
import { getDiscordWebhookUrl } from "../domains/core/functions";

const log = logger.child({ module: "discord" });

export interface DiscordEmbed {
	title?: string;
	description?: string;
	color?: number;
	fields?: Array<{ name: string; value: string; inline?: boolean }>;
	footer?: { text: string };
	timestamp?: string;
}

export interface DiscordMessage {
	content?: string;
	embeds?: DiscordEmbed[];
	username?: string;
	avatar_url?: string;
}

// Discord embed colors
export const COLORS = {
	INFO: 0x5865f2, // Discord blurple
	SUCCESS: 0x57f287, // Green
	WARNING: 0xfee75c, // Yellow
	ERROR: 0xed4245, // Red
	AGENT: 0x9b59b6, // Purple (for agent messages)
} as const;

/**
 * Send a message to the configured Discord webhook
 */
export async function sendDiscordNotification(message: DiscordMessage): Promise<boolean> {
	const webhookUrl = await getDiscordWebhookUrl();

	if (!webhookUrl) {
		log.debug("Discord webhook URL not configured, skipping notification");
		return false;
	}

	try {
		const response = await fetch(webhookUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				username: message.username ?? "Superbloom",
				avatar_url: message.avatar_url,
				content: message.content,
				embeds: message.embeds,
			}),
		});

		if (!response.ok) {
			const text = await response.text();
			log.error({ status: response.status, body: text }, "Discord webhook request failed");
			return false;
		}

		log.debug("Discord notification sent successfully");
		return true;
	} catch (error) {
		log.error({ error }, "Failed to send Discord notification");
		return false;
	}
}

/**
 * Send a simple text notification
 */
export async function notify(text: string): Promise<boolean> {
	return sendDiscordNotification({ content: text });
}

/**
 * Send an agent wake notification
 */
export async function notifyAgentWake(params: {
	threadId: string;
	reason: string;
	response: string;
}): Promise<boolean> {
	const { threadId, reason, response } = params;

	// Truncate response if too long for Discord embed (max 4096 chars for description)
	const truncatedResponse = response.length > 2000 ? `${response.slice(0, 1997)}...` : response;

	return sendDiscordNotification({
		username: "The Machine",
		embeds: [
			{
				title: "Agent Wake",
				description: truncatedResponse,
				color: COLORS.AGENT,
				fields: [
					{ name: "Reason", value: reason, inline: true },
					{ name: "Thread", value: threadId, inline: true },
				],
				timestamp: new Date().toISOString(),
			},
		],
	});
}

/**
 * Send a server status notification
 */
export async function notifyServerStatus(params: {
	serverName: string;
	status: "started" | "stopped" | "error";
	message?: string;
}): Promise<boolean> {
	const { serverName, status, message } = params;

	const statusConfig = {
		started: { emoji: "▶️", color: COLORS.SUCCESS, verb: "Started" },
		stopped: { emoji: "⏹️", color: COLORS.WARNING, verb: "Stopped" },
		error: { emoji: "❌", color: COLORS.ERROR, verb: "Error" },
	};

	const config = statusConfig[status];

	return sendDiscordNotification({
		embeds: [
			{
				title: `${config.emoji} ${serverName} ${config.verb}`,
				description: message,
				color: config.color,
				timestamp: new Date().toISOString(),
			},
		],
	});
}

/**
 * Send a system alert notification
 */
export async function notifySystemAlert(params: {
	title: string;
	message: string;
	severity: "info" | "warning" | "error";
}): Promise<boolean> {
	const { title, message, severity } = params;

	const severityConfig = {
		info: { color: COLORS.INFO },
		warning: { color: COLORS.WARNING },
		error: { color: COLORS.ERROR },
	};

	return sendDiscordNotification({
		embeds: [
			{
				title,
				description: message,
				color: severityConfig[severity].color,
				timestamp: new Date().toISOString(),
			},
		],
	});
}
