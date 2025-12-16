import { QdrantClient } from "@qdrant/js-client-rest";
import logger from "@nexus/logger";
import { config } from "./config";

const log = logger.child({ module: "qdrant" });

// Qdrant client singleton
export const qdrant = new QdrantClient({
	url: config.QDRANT_URL,
});

// Collection name for message embeddings
export const EMBEDDINGS_COLLECTION = "message_embeddings";

// OpenAI text-embedding-3-small produces 1536-dimensional vectors
export const EMBEDDING_DIMENSION = 1536;

/**
 * Initialize Qdrant collections.
 * Creates the message embeddings collection if it doesn't exist.
 */
export async function initializeQdrant() {
	try {
		const collections = await qdrant.getCollections();
		const exists = collections.collections.some((c) => c.name === EMBEDDINGS_COLLECTION);

		if (!exists) {
			log.info({ collection: EMBEDDINGS_COLLECTION }, "Creating Qdrant collection");

			await qdrant.createCollection(EMBEDDINGS_COLLECTION, {
				vectors: {
					size: EMBEDDING_DIMENSION,
					distance: "Cosine",
				},
				// Optimize for filtering by threadId and timestamp
				optimizers_config: {
					indexing_threshold: 10000,
				},
			});

			// Create payload indexes for efficient filtering
			await qdrant.createPayloadIndex(EMBEDDINGS_COLLECTION, {
				field_name: "threadId",
				field_schema: "keyword",
			});

			await qdrant.createPayloadIndex(EMBEDDINGS_COLLECTION, {
				field_name: "role",
				field_schema: "keyword",
			});

			await qdrant.createPayloadIndex(EMBEDDINGS_COLLECTION, {
				field_name: "createdAt",
				field_schema: "datetime",
			});

			log.info({ collection: EMBEDDINGS_COLLECTION }, "Qdrant collection created");
		} else {
			log.info({ collection: EMBEDDINGS_COLLECTION }, "Qdrant collection already exists");
		}
	} catch (error) {
		log.error({ error }, "Failed to initialize Qdrant");
		throw error;
	}
}

/**
 * Health check for Qdrant connection.
 */
export async function checkQdrantHealth(): Promise<boolean> {
	try {
		await qdrant.getCollections();
		return true;
	} catch {
		return false;
	}
}
