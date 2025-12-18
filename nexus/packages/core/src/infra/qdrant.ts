import { QdrantClient } from "@qdrant/js-client-rest";
import logger from "@nexus/logger";
import type { QdrantCollectionInfoType, QdrantInfoType } from "../domains/system-info/types";
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

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

/**
 * Get Qdrant collection statistics for dashboard.
 */
export async function getQdrantInfo(): Promise<QdrantInfoType> {
	try {
		const collectionsResponse = await qdrant.getCollections();
		const collections: QdrantCollectionInfoType[] = [];
		let totalPoints = 0;
		let totalDiskSize = 0;

		for (const col of collectionsResponse.collections) {
			try {
				const info = await qdrant.getCollection(col.name);
				const diskSize = (info.points_count ?? 0) * EMBEDDING_DIMENSION * 4; // Rough estimate: 4 bytes per float32

				collections.push({
					name: col.name,
					pointsCount: info.points_count ?? 0,
					segmentsCount: info.segments_count ?? 0,
					status: info.status,
					diskSizeBytes: diskSize,
					diskSizeFormatted: formatBytes(diskSize),
				});

				totalPoints += info.points_count ?? 0;
				totalDiskSize += diskSize;
			} catch (err) {
				log.warn({ err, collection: col.name }, "Failed to get collection info");
			}
		}

		return {
			healthy: true,
			collections,
			totalPoints,
			totalDiskSize,
			totalDiskSizeFormatted: formatBytes(totalDiskSize),
		};
	} catch (error) {
		log.error({ error }, "Failed to get Qdrant info");
		return {
			healthy: false,
			collections: [],
			totalPoints: 0,
			totalDiskSize: 0,
			totalDiskSizeFormatted: "0 B",
		};
	}
}
