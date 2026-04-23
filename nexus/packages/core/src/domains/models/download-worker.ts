/**
 * BullMQ worker that processes model-weight downloads.
 *
 * Runs inside the agent-worker pod (which has /tank/models mounted as
 * hostPath). The API pod enqueues via `enqueueModelDownload(name)`; this
 * worker pulls the job, calls `downloadModelWeights`, and updates the model
 * row + emits status events.
 */

import logger from "@nexus/logger";
import { appEvents } from "../../infra/events";
import { createWorker, modelDownloadsQueue, QUEUES } from "../../infra/queue";
import { downloadModelWeights } from "./downloader";
import { modelRepository } from "./repository";

const log = logger.child({ module: "models.download-worker" });

export interface ModelDownloadJobData {
	name: string;
}

/**
 * Enqueue a download. Called from the API (create / manual re-download).
 * The worker in the agent-worker pod picks it up and drives the rest.
 */
export async function enqueueModelDownload(name: string): Promise<string> {
	const job = await modelDownloadsQueue.add(
		"download",
		{ name } satisfies ModelDownloadJobData,
		{
			// BullMQ 5.x rejects `:` in custom job IDs (it's their Redis key
			// separator). `model-<slug>` keeps the id idempotent per model so
			// re-clicks coalesce instead of creating parallel downloads.
			jobId: `model-${name}`,
			attempts: 1, // one shot; retries go through the UI (stays explicit)
		}
	);
	log.info({ name, jobId: job.id }, "enqueued model download");
	return job.id ?? "";
}

export function startModelDownloadWorker() {
	return createWorker<ModelDownloadJobData>(
		QUEUES.MODEL_DOWNLOADS,
		async (job) => {
			const { name } = job.data;
			log.info({ name }, "starting model download");

			const row = await modelRepository.findByName(name);
			if (!row) {
				log.warn({ name }, "model not found, skipping download");
				return;
			}

			try {
				await downloadModelWeights(row);
				await modelRepository.updateStatus(name, "downloaded", { lastError: null });
				appEvents.emit("model:status", { name, status: "downloaded", lastError: null });
				log.info({ name }, "download job finished");
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				log.error({ name, err }, "download job failed");
				await modelRepository.updateStatus(name, "error", { lastError: msg });
				appEvents.emit("model:status", { name, status: "error", lastError: msg });
				appEvents.emit("model:download-progress", { name, phase: "error", error: msg });
				throw err; // surface to BullMQ for observability
			}
		},
		{ concurrency: 1 }
	);
}
