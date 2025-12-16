import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import logger from "logger";
import { config } from "./config";
import { appEvents } from "./events";

const log = logger.child({ module: "queue" });

// Helper to get queue stats
async function getQueueStats(queue: Queue) {
	const [waiting, active, completed, failed, delayed] = await Promise.all([
		queue.getWaitingCount(),
		queue.getActiveCount(),
		queue.getCompletedCount(),
		queue.getFailedCount(),
		queue.getDelayedCount(),
	]);

	return {
		queue: queue.name,
		waiting,
		active,
		completed,
		failed,
		delayed,
	};
}

// Emit stats for all queues (exported for use in routes)
export async function emitAllQueueStats() {
	const [agentStats, systemStats, embeddingsStats] = await Promise.all([
		getQueueStats(agentWakeQueue),
		getQueueStats(systemEventQueue),
		getQueueStats(embeddingsQueue),
	]);
	appEvents.emit("queue:stats:updated", agentStats);
	appEvents.emit("queue:stats:updated", systemStats);
	appEvents.emit("queue:stats:updated", embeddingsStats);
}

// Shared Redis connection for all queues
export const redis = new IORedis(config.VALKEY_URL, {
	maxRetriesPerRequest: null, // Required for BullMQ
});

redis.on("connect", () => {
	log.info("Connected to Valkey");
});

redis.on("error", (err) => {
	log.error({ err }, "Valkey connection error");
});

// Queue names
export const QUEUES = {
	AGENT_WAKES: "agent-wakes",
	EVENTS_SYSTEM: "events-system",
	EMBEDDINGS: "embeddings",
} as const;

// Create queues
export const agentWakeQueue = new Queue(QUEUES.AGENT_WAKES, {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: 100, // Keep last 100 completed jobs
		removeOnFail: 1000, // Keep last 1000 failed jobs
	},
});

export const systemEventQueue = new Queue(QUEUES.EVENTS_SYSTEM, {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: 100,
		removeOnFail: 1000,
	},
});

export const embeddingsQueue = new Queue(QUEUES.EMBEDDINGS, {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: 500, // Keep more for embeddings (high volume)
		removeOnFail: 1000,
	},
});

// Helper to create workers (used by agent domain)
export function createWorker<T>(
	queueName: string,
	processor: (job: { id?: string; name: string; data: T }) => Promise<void>,
	options?: { concurrency?: number }
) {
	const worker = new Worker<T>(queueName, processor, {
		connection: redis,
		concurrency: options?.concurrency ?? 1,
	});

	worker.on("completed", async (job) => {
		log.debug({ jobId: job.id, queue: queueName }, "Job completed");
		appEvents.emit("queue:job:completed", {
			queue: queueName,
			jobId: job.id ?? "unknown",
		});
		// Emit updated stats for real-time UI
		await emitAllQueueStats();
	});

	worker.on("failed", async (job, err) => {
		log.error({ jobId: job?.id, queue: queueName, err }, "Job failed");
		appEvents.emit("queue:job:failed", {
			queue: queueName,
			jobId: job?.id ?? "unknown",
			reason: err.message,
		});
		// Emit updated stats for real-time UI
		await emitAllQueueStats();
	});

	return worker;
}

// Graceful shutdown
export async function closeQueues() {
	log.info("Closing queue connections...");
	await agentWakeQueue.close();
	await systemEventQueue.close();
	await embeddingsQueue.close();
	await redis.quit();
	log.info("Queue connections closed");
}
