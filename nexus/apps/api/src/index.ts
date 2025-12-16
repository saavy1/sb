import { config } from "@nexus/core/infra/config";
import { closePubSub, initPubSub } from "@nexus/core/infra/pubsub";
import { initializeQdrant } from "@nexus/core/infra/qdrant";
import { closeQueues, redis } from "@nexus/core/infra/queue";
import logger from "@nexus/logger";
import { app } from "./app";

// Global error handlers to prevent crashes
process.on("uncaughtException", (error) => {
	logger.error({ error, stack: error.stack }, "Uncaught exception");
});

process.on("unhandledRejection", (reason, _promise) => {
	// Try to get more context about what caused this
	const error = reason instanceof Error ? reason : new Error(String(reason));
	logger.error(
		{
			reason,
			stack: error.stack,
			name: error.name,
			message: error.message,
		},
		"Unhandled promise rejection"
	);
});

// Initialize Qdrant collections (creates if not exists)
try {
	await initializeQdrant();
} catch (error) {
	logger.warn({ error }, "Qdrant initialization failed - embeddings will be unavailable");
}

// Initialize pub/sub for real-time events
initPubSub(redis);

// Start API server
const server = app.listen(config.PORT);
logger.info(
	{
		hostname: server.server?.hostname,
		port: server.server?.port,
		openapi: `/openapi`,
	},
	"API server started"
);

// Graceful shutdown
async function shutdown(signal: string) {
	logger.info(`Received ${signal}, shutting down...`);
	await closePubSub();
	await closeQueues();
	server.stop();
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
