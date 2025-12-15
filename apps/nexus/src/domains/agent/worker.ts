import logger from "logger";
import { createWorker, QUEUES } from "../../infra/queue";
import { wakeThread } from "./functions";
import { agentRepository } from "./repository";
import type { WakeJobDataType } from "./types";

const log = logger.child({ module: "agent-worker" });

/**
 * Start the agent wake worker.
 * This processes scheduled wakes from BullMQ.
 */
export function startAgentWorker() {
	log.info("Starting agent wake worker");

	const worker = createWorker<WakeJobDataType>(
		QUEUES.AGENT_WAKES,
		async (job) => {
			const { threadId, reason } = job.data;

			log.info({ jobId: job.id, threadId, reason }, "Processing wake job");

			try {
				const { thread, response } = await wakeThread(threadId, reason);

				log.info(
					{
						jobId: job.id,
						threadId,
						status: thread.status,
						responseLength: response.length,
					},
					"Wake job completed"
				);

				// TODO: Send response to appropriate channel based on thread source
				// - chat: no-op (user will see it when they open the thread)
				// - discord: send message to channel
				// - event: log or notify
			} catch (err) {
				log.error({ err, jobId: job.id, threadId }, "Wake job failed");

				// Mark thread as failed so it doesn't stay stuck in "sleeping"
				try {
					await agentRepository.update(threadId, { status: "failed" });
				} catch (updateErr) {
					log.error({ updateErr, threadId }, "Failed to mark thread as failed");
				}

				throw err; // Re-throw to trigger BullMQ retry/failure handling
			}
		},
		{ concurrency: 1 } // Process one wake at a time
	);

	return worker;
}
