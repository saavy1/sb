import logger from "logger";
import OpenAI from "openai";
import { config } from "../../infra/config";
import { EMBEDDINGS_COLLECTION, qdrant } from "../../infra/qdrant";
import { createWorker, QUEUES } from "../../infra/queue";
import { createThreadFromAlert, wakeThread } from "./functions";
import { agentRepository } from "./repository";
import type {
	AlertmanagerPayloadType,
	EmbeddingJobDataType,
	GrafanaAlertPayloadType,
	SystemEventJobType,
	WakeJobDataType,
} from "./types";

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
				// Agent uses send_notification tool when it needs to notify the user
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

/**
 * Start the system events worker.
 * This processes alerts from Grafana and Alertmanager webhooks.
 */
export function startSystemEventsWorker() {
	log.info("Starting system events worker");

	const worker = createWorker<SystemEventJobType>(
		QUEUES.EVENTS_SYSTEM,
		async (job) => {
			const { type, payload } = job.data;
			const startTime = Date.now();

			log.info(
				{ jobId: job.id, type, receivedAt: job.data.receivedAt },
				"Picked up system event from queue"
			);

			try {
				let threadsCreated = 0;

				if (type === "grafana-alert") {
					log.info({ jobId: job.id }, "Processing as Grafana alert");
					threadsCreated = await processGrafanaAlert(payload as GrafanaAlertPayloadType, job.id);
				} else if (type === "alertmanager-alert") {
					log.info({ jobId: job.id }, "Processing as Alertmanager alert");
					threadsCreated = await processAlertmanagerAlert(
						payload as AlertmanagerPayloadType,
						job.id
					);
				} else {
					log.warn({ jobId: job.id, type }, "Unknown system event type, skipping");
				}

				const durationMs = Date.now() - startTime;
				log.info(
					{ jobId: job.id, type, threadsCreated, durationMs },
					"System event processing complete"
				);
			} catch (err) {
				const durationMs = Date.now() - startTime;
				log.error({ err, jobId: job.id, type, durationMs }, "System event processing failed");
				throw err;
			}
		},
		{ concurrency: 3 } // Process multiple alerts concurrently
	);

	return worker;
}

async function processGrafanaAlert(
	payload: GrafanaAlertPayloadType,
	jobId?: string
): Promise<number> {
	const { status, alerts, title, message } = payload;

	// Only process firing alerts
	if (status !== "firing") {
		log.info({ jobId, status, alertCount: alerts?.length }, "Ignoring non-firing Grafana alert");
		return 0;
	}

	if (!alerts || alerts.length === 0) {
		log.warn({ jobId }, "Grafana alert payload has no alerts");
		return 0;
	}

	log.info({ jobId, alertCount: alerts.length }, "Processing Grafana alerts");
	let threadsCreated = 0;

	for (const alert of alerts) {
		const alertName = alert.labels?.alertname || title || "Unknown";
		const severity = alert.labels?.severity || "warning";
		const annotations = alert.annotations || {};
		const description =
			annotations.description || annotations.summary || message || `Alert: ${alertName}`;

		log.info(
			{ jobId, alertName, severity, fingerprint: alert.fingerprint },
			"Creating thread for alert"
		);

		const thread = await createThreadFromAlert({
			alertName,
			severity,
			description,
			labels: alert.labels || {},
			annotations: {
				...annotations,
				...(alert.dashboardURL && { dashboardURL: alert.dashboardURL }),
				...(alert.panelURL && { panelURL: alert.panelURL }),
				...(alert.silenceURL && { silenceURL: alert.silenceURL }),
				...(alert.valueString && { valueString: alert.valueString }),
			},
			startsAt: alert.startsAt,
			fingerprint: alert.fingerprint,
			generatorURL: alert.generatorURL,
		});

		threadsCreated++;
		log.info(
			{ jobId, threadId: thread.id, alertName, severity, threadStatus: thread.status },
			"Agent thread created, agent loop started"
		);
	}

	return threadsCreated;
}

async function processAlertmanagerAlert(
	payload: AlertmanagerPayloadType,
	jobId?: string
): Promise<number> {
	const { status, alerts } = payload;

	// Only process firing alerts
	if (status !== "firing") {
		log.info(
			{ jobId, status, alertCount: alerts?.length },
			"Ignoring non-firing Alertmanager alert"
		);
		return 0;
	}

	if (!alerts || alerts.length === 0) {
		log.warn({ jobId }, "Alertmanager payload has no alerts");
		return 0;
	}

	log.info({ jobId, alertCount: alerts.length }, "Processing Alertmanager alerts");
	let threadsCreated = 0;

	for (const alert of alerts) {
		const alertName = alert.labels?.alertname || "Unknown";
		const severity = alert.labels?.severity || "warning";
		const annotations = alert.annotations || {};
		const description = annotations.description || annotations.summary || `Alert: ${alertName}`;

		log.info(
			{ jobId, alertName, severity, fingerprint: alert.fingerprint },
			"Creating thread for alert"
		);

		const thread = await createThreadFromAlert({
			alertName,
			severity,
			description,
			labels: alert.labels || {},
			annotations,
			startsAt: alert.startsAt,
			fingerprint: alert.fingerprint,
			generatorURL: alert.generatorURL,
		});

		threadsCreated++;
		log.info(
			{ jobId, threadId: thread.id, alertName, severity, threadStatus: thread.status },
			"Agent thread created, agent loop started"
		);
	}

	return threadsCreated;
}

/**
 * Start the embeddings worker.
 * This generates embeddings for messages and stores them in Qdrant.
 */
export function startEmbeddingsWorker() {
	if (!config.OPENAI_API_KEY) {
		log.warn("OPENAI_API_KEY not configured, embeddings worker disabled");
		return null;
	}

	log.info("Starting embeddings worker");

	const openai = new OpenAI({
		apiKey: config.OPENAI_API_KEY,
	});

	const worker = createWorker<EmbeddingJobDataType>(
		QUEUES.EMBEDDINGS,
		async (job) => {
			const { threadId, messageId, role, content, createdAt } = job.data;
			const startTime = Date.now();

			log.info(
				{ jobId: job.id, threadId, messageId, role, contentLength: content.length },
				"Processing embedding job"
			);

			try {
				// Generate embedding via OpenAI
				const response = await openai.embeddings.create({
					model: config.EMBEDDING_MODEL,
					input: content,
				});

				const embedding = response.data[0].embedding;

				// Store in Qdrant (use full UUID for point ID since Qdrant requires UUID or uint)
				const pointId = crypto.randomUUID();
				await qdrant.upsert(EMBEDDINGS_COLLECTION, {
					wait: true,
					points: [
						{
							id: pointId,
							vector: embedding,
							payload: {
								threadId,
								messageId,
								role,
								content,
								createdAt,
							},
						},
					],
				});

				const durationMs = Date.now() - startTime;
				log.info(
					{
						jobId: job.id,
						threadId,
						messageId,
						durationMs,
						tokenUsage: response.usage?.total_tokens,
					},
					"Embedding stored in Qdrant"
				);
			} catch (err) {
				const durationMs = Date.now() - startTime;
				log.error({ err, jobId: job.id, threadId, messageId, durationMs }, "Embedding job failed");
				throw err;
			}
		},
		{ concurrency: 5 } // Process multiple embeddings concurrently
	);

	return worker;
}
