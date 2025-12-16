import { createThread, type WakeJobDataType } from "@nexus/core/domains/agent";
import { appEvents } from "@nexus/core/infra/events";
import {
	agentWakeQueue,
	discordAsksQueue,
	embeddingsQueue,
	emitAllQueueStats,
	QUEUES,
	systemEventQueue,
} from "@nexus/core/infra/queue";
import type { Job, Queue } from "bullmq";
import { Elysia, t } from "elysia";

// Map queue names to queue instances
const queueMap: Record<string, Queue> = {
	[QUEUES.AGENT_WAKES]: agentWakeQueue,
	[QUEUES.EVENTS_SYSTEM]: systemEventQueue,
	[QUEUES.EMBEDDINGS]: embeddingsQueue,
	[QUEUES.DISCORD_ASKS]: discordAsksQueue,
};

const QueueStats = t.Object({
	name: t.String(),
	waiting: t.Number(),
	active: t.Number(),
	completed: t.Number(),
	failed: t.Number(),
	delayed: t.Number(),
	paused: t.Number(),
});

const JobInfo = t.Object({
	id: t.String(),
	name: t.String(),
	data: t.Any(),
	status: t.String(),
	attemptsMade: t.Number(),
	timestamp: t.Number(),
	delay: t.Optional(t.Number()),
	processedOn: t.Optional(t.Number()),
	finishedOn: t.Optional(t.Number()),
	failedReason: t.Optional(t.String()),
});

async function getQueueStats(queue: typeof agentWakeQueue) {
	const [waiting, active, completed, failed, delayed] = await Promise.all([
		queue.getWaitingCount(),
		queue.getActiveCount(),
		queue.getCompletedCount(),
		queue.getFailedCount(),
		queue.getDelayedCount(),
	]);

	return {
		name: queue.name,
		waiting,
		active,
		completed,
		failed,
		delayed,
		paused: 0, // BullMQ 5.x doesn't have getPausedCount, use isPaused() if needed
	};
}

async function getJobs(
	queue: typeof agentWakeQueue,
	status: "waiting" | "active" | "completed" | "failed" | "delayed",
	limit: number
) {
	let jobs: Job[];
	switch (status) {
		case "waiting":
			jobs = await queue.getWaiting(0, limit - 1);
			break;
		case "active":
			jobs = await queue.getActive(0, limit - 1);
			break;
		case "completed":
			jobs = await queue.getCompleted(0, limit - 1);
			break;
		case "failed":
			jobs = await queue.getFailed(0, limit - 1);
			break;
		case "delayed":
			jobs = await queue.getDelayed(0, limit - 1);
			break;
	}

	return jobs.map((job) => ({
		id: job.id ?? "unknown",
		name: job.name,
		data: job.data,
		status,
		attemptsMade: job.attemptsMade,
		timestamp: job.timestamp,
		delay: job.delay,
		processedOn: job.processedOn,
		finishedOn: job.finishedOn,
		failedReason: job.failedReason,
	}));
}

export const debugRoutes = new Elysia({ prefix: "/debug" })
	// Queue overview
	.get(
		"/queues",
		async () => {
			const allQueues = Object.values(queueMap);
			const stats = await Promise.all(allQueues.map(getQueueStats));
			return { queues: stats };
		},
		{
			detail: { tags: ["Debug"], summary: "Get all queue stats" },
			response: { 200: t.Object({ queues: t.Array(QueueStats) }) },
		}
	)

	// Specific queue stats
	.get(
		"/queues/:name",
		async ({ params, set }) => {
			const queue = queueMap[params.name];
			if (!queue) {
				set.status = 404;
				return { error: `Queue ${params.name} not found` };
			}

			return getQueueStats(queue);
		},
		{
			detail: { tags: ["Debug"], summary: "Get queue stats by name" },
			params: t.Object({ name: t.String() }),
			response: { 200: QueueStats, 404: t.Object({ error: t.String() }) },
		}
	)

	// List jobs in a queue
	.get(
		"/queues/:name/jobs",
		async ({ params, query, set }) => {
			const queue = queueMap[params.name];
			if (!queue) {
				set.status = 404;
				return { error: `Queue ${params.name} not found` };
			}

			const status = (query.status ?? "delayed") as
				| "waiting"
				| "active"
				| "completed"
				| "failed"
				| "delayed";
			const limit = query.limit ? parseInt(query.limit, 10) : 20;

			const jobs = await getJobs(queue, status, limit);
			return { jobs };
		},
		{
			detail: { tags: ["Debug"], summary: "List jobs in a queue" },
			params: t.Object({ name: t.String() }),
			query: t.Object({
				status: t.Optional(
					t.Union([
						t.Literal("waiting"),
						t.Literal("active"),
						t.Literal("completed"),
						t.Literal("failed"),
						t.Literal("delayed"),
					])
				),
				limit: t.Optional(t.String()),
			}),
			response: { 200: t.Object({ jobs: t.Array(JobInfo) }), 404: t.Object({ error: t.String() }) },
		}
	)

	// Clean queue (remove old jobs)
	.post(
		"/queues/:name/clean",
		async ({ params, query, set }) => {
			const queue = queueMap[params.name];
			if (!queue) {
				set.status = 404;
				return { error: `Queue ${params.name} not found` };
			}

			const status = (query.status ?? "completed") as "completed" | "failed";
			const grace = query.grace ? parseInt(query.grace, 10) : 60000; // 1 minute default

			const removed = await queue.clean(grace, 1000, status);
			return { removed: removed.length, status };
		},
		{
			detail: { tags: ["Debug"], summary: "Clean old jobs from queue" },
			params: t.Object({ name: t.String() }),
			query: t.Object({
				status: t.Optional(t.Union([t.Literal("completed"), t.Literal("failed")])),
				grace: t.Optional(t.String()),
			}),
			response: {
				200: t.Object({ removed: t.Number(), status: t.String() }),
				404: t.Object({ error: t.String() }),
			},
		}
	)

	// Add a test job to a queue
	.post(
		"/queues/:name/test",
		async ({ params, body, set }) => {
			const queue = queueMap[params.name];
			if (!queue) {
				set.status = 404;
				return { error: `Queue ${params.name} not found` };
			}

			const delay = body.delay ? parseInt(body.delay, 10) * 1000 : 0; // Convert seconds to ms

			// For agent-wakes queue, create a proper test thread
			let jobData: unknown;
			let jobName: string;

			if (params.name === QUEUES.AGENT_WAKES) {
				const thread = await createThread("scheduled", `test-${Date.now()}`);
				jobData = {
					threadId: thread.id,
					reason: body.data?.reason ?? "Test wake from debug UI",
				} satisfies WakeJobDataType;
				jobName = "wake";
			} else {
				jobData = body.data ?? { test: true, timestamp: Date.now() };
				jobName = body.name ?? "test-job";
			}

			const job = await queue.add(jobName, jobData, { delay });

			// Emit event for real-time UI updates
			appEvents.emit("queue:job:added", {
				queue: params.name,
				jobId: job.id ?? "unknown",
				name: jobName,
				delay: delay > 0 ? delay : undefined,
			});

			// Emit updated stats for all queues
			await emitAllQueueStats();

			return {
				jobId: job.id,
				queue: params.name,
				name: jobName,
				delay: delay > 0 ? `${body.delay}s` : undefined,
			};
		},
		{
			detail: { tags: ["Debug"], summary: "Add a test job to a queue" },
			params: t.Object({ name: t.String() }),
			body: t.Object({
				name: t.Optional(t.String()),
				data: t.Optional(t.Any()),
				delay: t.Optional(t.String()), // Delay in seconds
			}),
			response: {
				200: t.Object({
					jobId: t.Optional(t.String()),
					queue: t.String(),
					name: t.String(),
					delay: t.Optional(t.String()),
				}),
				404: t.Object({ error: t.String() }),
			},
		}
	);
