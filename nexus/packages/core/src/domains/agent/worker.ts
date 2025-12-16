import logger from "@nexus/logger";
import OpenAI from "openai";
import { config } from "../../infra/config";
import { EMBEDDINGS_COLLECTION, qdrant } from "../../infra/qdrant";
import { createWorker, QUEUES } from "../../infra/queue";
import { createThreadFromAlert, sendMessage, wakeThread } from "./functions";
import { agentRepository } from "./repository";
import type {
	AlertmanagerPayloadType,
	DiscordAskJobDataType,
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

/**
 * Start the Discord asks worker.
 * This processes /ask commands from Discord and replies with agent responses.
 */
export function startDiscordAsksWorker() {
	log.info("Starting Discord asks worker");

	const worker = createWorker<DiscordAskJobDataType>(
		QUEUES.DISCORD_ASKS,
		async (job) => {
			const { threadId, content, interactionToken, applicationId } = job.data;
			const startTime = Date.now();

			log.info(
				{ jobId: job.id, threadId, contentLength: content.length },
				"Processing Discord ask job"
			);

			try {
				// Run the agent loop
				const { response } = await sendMessage(threadId, content);

				// Truncate response if too long for Discord (max 2000 chars for content)
				const truncatedResponse =
					response.length > 1900 ? `${response.slice(0, 1897)}...` : response;

				// Edit the deferred reply via Discord REST API
				const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;

				const discordResponse = await fetch(webhookUrl, {
					method: "PATCH",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						content: truncatedResponse,
					}),
				});

				if (!discordResponse.ok) {
					const errorText = await discordResponse.text();
					log.error(
						{
							jobId: job.id,
							threadId,
							status: discordResponse.status,
							error: errorText,
						},
						"Failed to edit Discord reply"
					);
					throw new Error(`Discord API error: ${discordResponse.status} - ${errorText}`);
				}

				const durationMs = Date.now() - startTime;
				log.info(
					{
						jobId: job.id,
						threadId,
						responseLength: response.length,
						durationMs,
					},
					"Discord ask job completed"
				);
			} catch (err) {
				const durationMs = Date.now() - startTime;
				log.error({ err, jobId: job.id, threadId, durationMs }, "Discord ask job failed");

				// Try to notify the user of the error
				try {
					const webhookUrl = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}/messages/@original`;
					await fetch(webhookUrl, {
						method: "PATCH",
						headers: { "Content-Type": "application/json" },
						body: JSON.stringify({
							content: "Sorry, I encountered an error processing your request. Please try again.",
						}),
					});
				} catch {
					// Best effort - if this fails too, nothing we can do
				}

				throw err;
			}
		},
		{ concurrency: 3 } // Process multiple asks concurrently
	);

	return worker;
}
