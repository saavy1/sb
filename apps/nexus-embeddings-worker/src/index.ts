/**
 * Nexus Embeddings Worker - Standalone Embeddings Processing Service
 *
 * Generates embeddings for messages using OpenAI and stores them in Qdrant.
 * This enables semantic search across conversation history.
 */

import { startEmbeddingsWorker } from "@nexus-core/domains/agent";
import { config } from "@nexus-core/infra/config";
import { initializeQdrant } from "@nexus-core/infra/qdrant";
import { closeQueues } from "@nexus-core/infra/queue";
import logger from "logger";

const log = logger.child({ service: "nexus-embeddings-worker" });

// Validate required configuration
if (!config.VALKEY_URL) {
	log.error("VALKEY_URL is required");
	process.exit(1);
}

if (!config.OPENAI_API_KEY) {
	log.error("OPENAI_API_KEY is required for embeddings generation");
	process.exit(1);
}

if (!config.QDRANT_URL) {
	log.error("QDRANT_URL is required for storing embeddings");
	process.exit(1);
}

// Initialize Qdrant collections
try {
	await initializeQdrant();
	log.info("Qdrant initialized");
} catch (error) {
	log.error({ error }, "Failed to initialize Qdrant");
	process.exit(1);
}

// Start the worker (guaranteed non-null since we validated OPENAI_API_KEY above)
const embeddingsWorker = startEmbeddingsWorker()!;

log.info(
	{
		valkeyUrl: config.VALKEY_URL,
		qdrantUrl: config.QDRANT_URL,
		embeddingModel: config.EMBEDDING_MODEL,
	},
	"Embeddings worker started"
);

// Graceful shutdown
async function shutdown(signal: string) {
	log.info(`Received ${signal}, shutting down...`);

	await embeddingsWorker.close();
	await closeQueues();

	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
