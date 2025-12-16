/**
 * Minecraft Server Monitor
 *
 * Polls the Minecraft server at regular intervals and publishes
 * status updates to Valkey pub/sub. Tracks state to detect changes
 * like player joins/leaves and server online/offline transitions.
 */

import logger from "@nexus/logger";
import { appEvents, type MinecraftStatusPayloadType } from "../../infra/events";
import { CHANNELS, type MinecraftStatusPayload, publish } from "../../infra/pubsub";
import { queryServerStatus } from "./functions";

const log = logger.child({ module: "mc-monitor" });

// Polling interval (15 seconds)
const POLL_INTERVAL_MS = 15_000;

// Track last known state for diff detection
let lastStatus: MinecraftStatusPayload | null = null;
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Compare two status objects and detect changes.
 */
function detectChanges(
	prev: MinecraftStatusPayload | null,
	curr: MinecraftStatusPayload
): { playerJoined: string[]; playerLeft: string[]; statusChanged: boolean } {
	const playerJoined: string[] = [];
	const playerLeft: string[] = [];
	let statusChanged = false;

	// Detect online/offline transition
	if (prev === null || prev.online !== curr.online) {
		statusChanged = true;
	}

	// Detect player changes
	if (curr.online && curr.players) {
		const currPlayers = new Set(curr.players.list);
		const prevPlayers = new Set(prev?.players?.list ?? []);

		// Find joined players
		for (const player of currPlayers) {
			if (!prevPlayers.has(player)) {
				playerJoined.push(player);
			}
		}

		// Find left players
		for (const player of prevPlayers) {
			if (!currPlayers.has(player)) {
				playerLeft.push(player);
			}
		}
	} else if (prev?.online && prev.players && !curr.online) {
		// Server went offline - all players "left"
		playerLeft.push(...prev.players.list);
	}

	return { playerJoined, playerLeft, statusChanged };
}

/**
 * Poll the Minecraft server and publish status.
 */
async function pollAndPublish(): Promise<void> {
	try {
		const status = await queryServerStatus();
		const timestamp = new Date().toISOString();

		let payload: MinecraftStatusPayload;

		if (status) {
			payload = {
				online: true,
				version: status.version,
				players: {
					online: status.players.online,
					max: status.players.max,
					list: status.players.sample.map((p) => p.name),
				},
				motd: status.motd,
				latency: status.latency,
				timestamp,
			};
		} else {
			payload = {
				online: false,
				timestamp,
			};
		}

		// Detect changes
		const changes = detectChanges(lastStatus, payload);

		// Add change info to payload
		if (changes.playerJoined.length > 0) {
			payload.playerJoined = changes.playerJoined;
			log.info({ players: changes.playerJoined }, "Players joined");
		}
		if (changes.playerLeft.length > 0) {
			payload.playerLeft = changes.playerLeft;
			log.info({ players: changes.playerLeft }, "Players left");
		}
		if (changes.statusChanged) {
			payload.statusChanged = true;
			log.info({ online: payload.online }, "Server status changed");
		}

		// Publish to pub/sub (for external consumers)
		await publish(CHANNELS.MINECRAFT_STATUS, payload);

		// Emit to appEvents (for WebSocket clients)
		appEvents.emit("minecraft:status", payload as MinecraftStatusPayloadType);

		// Update last known state
		lastStatus = payload;

		log.debug(
			{
				online: payload.online,
				players: payload.players?.online ?? 0,
				hasChanges:
					changes.statusChanged || changes.playerJoined.length > 0 || changes.playerLeft.length > 0,
			},
			"MC status poll complete"
		);
	} catch (err) {
		log.error({ err }, "Failed to poll Minecraft server");

		// Publish offline status on error
		const payload: MinecraftStatusPayload = {
			online: false,
			timestamp: new Date().toISOString(),
		};

		if (lastStatus?.online) {
			payload.statusChanged = true;
			log.info("Server went offline (poll error)");
		}

		await publish(CHANNELS.MINECRAFT_STATUS, payload);
		appEvents.emit("minecraft:status", payload as MinecraftStatusPayloadType);
		lastStatus = payload;
	}
}

/**
 * Start the Minecraft monitor.
 * Polls at regular intervals and publishes status to pub/sub.
 */
export function startMinecraftMonitor(): void {
	if (pollInterval) {
		log.warn("Minecraft monitor already running");
		return;
	}

	log.info({ intervalMs: POLL_INTERVAL_MS }, "Starting Minecraft monitor");

	// Initial poll
	pollAndPublish();

	// Start polling interval
	pollInterval = setInterval(pollAndPublish, POLL_INTERVAL_MS);
}

/**
 * Stop the Minecraft monitor.
 */
export function stopMinecraftMonitor(): void {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
		log.info("Minecraft monitor stopped");
	}
}

/**
 * Get the last known status (for API requests).
 */
export function getLastMinecraftStatus(): MinecraftStatusPayload | null {
	return lastStatus;
}
