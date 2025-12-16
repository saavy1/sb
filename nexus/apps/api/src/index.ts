import {
	startAgentWorker,
	startEmbeddingsWorker,
	startSystemEventsWorker,
} from "@nexus/core/domains/agent";
import { config } from "@nexus/core/infra/config";
import { closePubSub, initPubSub } from "@nexus/core/infra/pubsub";
import { initializeQdrant } from "@nexus/core/infra/qdrant";
import { closeQueues, redis } from "@nexus/core/infra/queue";
import logger from "@nexus/logger";
import { app } from "./app";

// Initialize Qdrant collections (creates if not exists)
try {
	await initializeQdrant();
} catch (error) {
	logger.warn({ error }, "Qdrant initialization failed - embeddings will be unavailable");
}

// Initialize pub/sub (reuse redis connection from queue)
initPubSub(redis);

// Conditional startup based on MODE
let server: ReturnType<typeof app.listen> | null = null;
let agentWorker: Awaited<ReturnType<typeof startAgentWorker>> | null = null;
let systemEventsWorker: Awaited<ReturnType<typeof startSystemEventsWorker>> | null = null;
let embeddingsWorker: Awaited<ReturnType<typeof startEmbeddingsWorker>> | null = null;

// Start API server if MODE is "api" or "both"
if (config.MODE === "api" || config.MODE === "both") {
	server = app.listen(config.PORT);
	logger.info(
		{
			mode: config.MODE,
			hostname: server.server?.hostname,
			port: server.server?.port,
			openapi: `/openapi`,
		},
		"API server started"
	);
	logger.info(`API running at http://${server.server?.hostname}:${server.server?.port}`);
	logger.info(`OpenAPI docs at http://${server.server?.hostname}:${server.server?.port}/openapi`);
}

// Start workers if MODE is "worker" or "both"
// Note: MC monitor is now a separate service (nexus-mc-monitor)
if (config.MODE === "worker" || config.MODE === "both") {
	agentWorker = startAgentWorker();
	systemEventsWorker = startSystemEventsWorker();
	embeddingsWorker = startEmbeddingsWorker();
	const workersStarted = ["agent", "system-events"];
	if (embeddingsWorker) {
		workersStarted.push("embeddings");
	}
	logger.info({ mode: config.MODE, workers: workersStarted }, "Workers started");
}

logger.info({ mode: config.MODE }, "Nexus started");

// Graceful shutdown
async function shutdown(signal: string) {
	logger.info(`Received ${signal}, shutting down...`);
	if (agentWorker) {
		await agentWorker.close();
	}
	if (systemEventsWorker) {
		await systemEventsWorker.close();
	}
	if (embeddingsWorker) {
		await embeddingsWorker.close();
	}
	await closePubSub();
	await closeQueues();
	if (server) {
		server.stop();
	}
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
