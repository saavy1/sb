import logger from "@nexus/logger";
import { SpanStatusCode, trace } from "@opentelemetry/api";
import { Queue, Worker } from "bullmq";
import IORedis from "ioredis";
import { config } from "./config";
import { appEvents } from "./events";

const tracer = trace.getTracer("bullmq");

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
	const [agentStats, systemStats, discordStats] =
		await Promise.all([
			getQueueStats(agentWakeQueue),
			getQueueStats(systemEventQueue),
			getQueueStats(discordAsksQueue),
		]);
	appEvents.emit("queue:stats:updated", agentStats);
	appEvents.emit("queue:stats:updated", systemStats);
	appEvents.emit("queue:stats:updated", discordStats);
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
	DISCORD_ASKS: "discord-asks",
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

export const discordAsksQueue = new Queue(QUEUES.DISCORD_ASKS, {
	connection: redis,
	defaultJobOptions: {
		removeOnComplete: 100,
		removeOnFail: 1000,
	},
});

// Job type with BullMQ properties we care about
type JobWithMeta<T> = {
	id?: string;
	name: string;
	data: T;
	attemptsMade?: number;
	delay?: number;
	timestamp?: number;
};

// Helper to create workers (used by agent domain)
export function createWorker<T>(
	queueName: string,
	processor: (job: JobWithMeta<T>) => Promise<void>,
	options?: { concurrency?: number },
) {
	// Wrap processor with tracing
	const tracedProcessor = async (job: JobWithMeta<T>) => {
		return tracer.startActiveSpan(`job.${queueName}`, async (span) => {
			try {
				span.setAttribute("job.queue", queueName);
				span.setAttribute("job.id", job.id ?? "unknown");
				span.setAttribute("job.name", job.name);
				if (job.attemptsMade !== undefined) {
					span.setAttribute("job.attempt", job.attemptsMade + 1);
				}
				if (job.delay !== undefined && job.delay > 0) {
					span.setAttribute("job.delay_ms", job.delay);
				}
				if (job.timestamp !== undefined) {
					span.setAttribute("job.created_at", job.timestamp);
				}

				await processor(job);

				span.setStatus({ code: SpanStatusCode.OK });
			} catch (error) {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: error instanceof Error ? error.message : "Unknown error",
				});
				span.recordException(error as Error);
				throw error;
			} finally {
				span.end();
			}
		});
	};

	const worker = new Worker<T>(queueName, tracedProcessor, {
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
	await discordAsksQueue.close();
	await redis.quit();
	log.info("Queue connections closed");
}
