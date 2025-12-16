/**
 * Nexus MC Monitor - Standalone Minecraft Server Status Monitor
 *
 * Polls the Minecraft server at regular intervals and publishes
 * status updates to Valkey pub/sub for other services to consume.
 */

import { startMinecraftMonitor, stopMinecraftMonitor } from "@nexus-core/domains/game-servers";
import { closePubSub, config, initPubSub } from "@nexus-core/infra";
import IORedis from "ioredis";
import logger from "logger";

const log = logger.child({ service: "nexus-mc-monitor" });

// Initialize Redis for pub/sub
const redis = new IORedis(config.VALKEY_URL);

redis.on("connect", () => {
	log.info("Connected to Valkey");
});

redis.on("error", (err) => {
	log.error({ err }, "Valkey connection error");
});

// Initialize pub/sub with the redis connection
initPubSub(redis);

// Start the monitor
startMinecraftMonitor();

log.info(
	{
		mcHost: config.MC_LOADBALANCER_HOST,
		mcPort: config.MC_DEFAULT_PORT,
		valkeyUrl: config.VALKEY_URL,
	},
	"MC Monitor started"
);

// Graceful shutdown
async function shutdown(signal: string) {
	log.info(`Received ${signal}, shutting down...`);
	stopMinecraftMonitor();
	await closePubSub();
	await redis.quit();
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
