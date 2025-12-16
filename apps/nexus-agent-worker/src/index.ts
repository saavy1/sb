/**
 * Nexus Agent Worker - Standalone Agent Processing Service
 *
 * Processes agent wake jobs and system events (alerts) from BullMQ queues.
 * This worker handles:
 * - Agent wake jobs: Scheduled wakes for autonomous agent threads
 * - System events: Grafana and Alertmanager alerts that trigger agent responses
 */

import { startAgentWorker, startSystemEventsWorker } from "@nexus-core/domains/agent";
import { config } from "@nexus-core/infra/config";
import { closeQueues } from "@nexus-core/infra/queue";
import logger from "logger";

const log = logger.child({ service: "nexus-agent-worker" });

// Validate required configuration
if (!config.VALKEY_URL) {
	log.error("VALKEY_URL is required");
	process.exit(1);
}

if (!config.DATABASE_URL) {
	log.error("DATABASE_URL is required");
	process.exit(1);
}

if (!config.OPENROUTER_API_KEY) {
	log.warn("OPENROUTER_API_KEY not configured - agent responses will fail");
}

// Start the workers
const agentWorker = startAgentWorker();
const systemEventsWorker = startSystemEventsWorker();

log.info(
	{
		valkeyUrl: config.VALKEY_URL,
		workers: ["agent-wake", "system-events"],
	},
	"Agent worker started"
);

// Graceful shutdown
async function shutdown(signal: string) {
	log.info(`Received ${signal}, shutting down...`);

	await agentWorker.close();
	await systemEventsWorker.close();
	await closeQueues();

	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
