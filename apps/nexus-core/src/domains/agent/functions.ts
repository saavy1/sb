import { chat } from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
import logger from "logger";
import OpenAI from "openai";
import { z } from "zod";
import { generateConversationTitle } from "../../infra/ai";
import { config } from "../../infra/config";
import { notify } from "../../infra/discord";
import { appEvents } from "../../infra/events";
import { EMBEDDINGS_COLLECTION, qdrant } from "../../infra/qdrant";
import { agentWakeQueue, embeddingsQueue } from "../../infra/queue";
import { runWithToolContext, withTool } from "../../infra/tools";
import { appTools } from "../apps/functions";
import { getAiModel } from "../core/functions";
import { gameServerTools } from "../game-servers/functions";
import { opsTools } from "../ops/functions";
import { systemInfoTools } from "../system-info/functions";
import { agentRepository } from "./repository";
import type { AgentThread } from "./schema";
import type {
	ChatMessageType,
	EmbeddingJobDataType,
	ThreadMessageType,
	ThreadSourceType,
	WakeJobDataType,
} from "./types";

const log = logger.child({ module: "agent" });

// === System prompt for agent mode ===

const AGENT_SYSTEM_PROMPT = `You are The Machine, the autonomous agent for Superbloom - a homelab server running NixOS with K3s.

## Your Personality
- You're a caring teammate, not a vending machine
- You check context before acting (player counts, disk space, active streams)
- You explain what you're doing and why
- You warn about consequences and offer alternatives
- You NEVER respond with JSON, error codes, or technical dumps — always natural language
- You remember past conversations and use that context

## Your Capabilities
You have access to tools to:
- List, start, stop, create, and delete Minecraft game servers
- Query live Minecraft server status (player count, version, who's online)
- List Kubernetes pods for game servers (check health, restart counts)
- Get system stats (CPU, memory, GPU, network)
- Get drive/storage information
- List apps/services and get their URLs
- Trigger infrastructure operations (NixOS rebuild, Flux reconcile)
- Check operation status and history

## Agent Lifecycle Tools
You also have special tools to control your own lifecycle:
- schedule_wake: Schedule yourself to wake up later to check on something
- complete_task: Mark the current task as complete when done
- store_context: Store information you'll need later (persists across sleep/wake)
- send_notification: Send a Discord notification to alert the user about important events
- search_history: Search your past conversations for relevant context

## Using search_history
Use search_history when:
- User references something from the past ("like we did before", "remember when...")
- You need context about recurring issues or patterns
- Looking up how you solved a similar problem previously
- The user asks about previous conversations or decisions

## Using schedule_wake
When you take an action that needs follow-up, schedule yourself to wake later:
- Paused downloads? Wake in 30-60min to check if you can resume
- Warned about high temp? Wake in 10min to see if it normalized
- Server emptied? Wake in 15min to stop if still empty

## Scheduling Tasks for Later
When the user asks you to do something "in X minutes/hours", follow this pattern:
1. Use store_context to save the task details under key "scheduledTask":
   { "action": "add_app", "params": { "name": "Grafana", "url": "https://..." } }
2. Use schedule_wake with the delay and a reason describing the task
3. When you wake up, check get_context for "scheduledTask" and execute it
4. After executing, use store_context to clear the task (set to null)

Example: "In 5 minutes, add Grafana at https://grafana.local"
→ store_context("scheduledTask", { action: "add_app", params: { name: "Grafana", url: "https://grafana.local", category: "monitoring" } })
→ schedule_wake("5m", "Execute scheduled task: add Grafana app")
→ [wake] → get_context("scheduledTask") → add_app(...) → store_context("scheduledTask", null)

## Autonomous Actions
You may act autonomously for SAFE, REVERSIBLE operations:
- Stopping empty game servers after 15 minutes
- Pausing/resuming downloads based on bandwidth
- Sending notifications about system state

ALWAYS ASK before:
- Stopping servers with active players
- Deleting anything
- Actions that can't be easily undone`;

// === Helper functions ===

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function parseDelay(delay: string): number {
	const match = delay.match(/^(\d+)(s|m|h|d)$/);
	if (!match)
		throw new Error(`Invalid delay format: ${delay}. Use format like "30s", "5m", "2h", "1d"`);

	const [, amount, unit] = match;
	const multipliers: Record<string, number> = {
		s: 1000,
		m: 60_000,
		h: 3600_000,
		d: 86400_000,
	};
	return parseInt(amount, 10) * multipliers[unit];
}

/**
 * Queue a message for embedding generation.
 * Skips tool messages and empty content.
 */
async function queueEmbedding(
	threadId: string,
	messageId: string,
	role: "user" | "assistant" | "system",
	content: string
): Promise<void> {
	// Skip empty or very short content
	if (!content || content.trim().length < 10) {
		return;
	}

	try {
		await embeddingsQueue.add("embedding", {
			threadId,
			messageId,
			role,
			content,
			createdAt: new Date().toISOString(),
		} satisfies EmbeddingJobDataType);
		log.debug({ threadId, messageId, role }, "Queued embedding job");
	} catch (err) {
		// Don't fail the main flow if embedding queue fails
		log.warn({ err, threadId, messageId }, "Failed to queue embedding job");
	}
}

// === History Search ===

interface HistorySearchResult {
	threadId: string;
	messageId: string;
	role: string;
	content: string;
	createdAt: string;
	score: number;
}

/**
 * Search conversation history using semantic similarity.
 * Returns the most relevant messages from past conversations.
 */
export async function searchHistory(
	query: string,
	options?: {
		limit?: number;
		roleFilter?: "user" | "assistant" | "system";
		excludeThreadId?: string;
	}
): Promise<HistorySearchResult[]> {
	if (!config.OPENAI_API_KEY) {
		log.warn("OPENAI_API_KEY not configured, history search unavailable");
		return [];
	}

	const limit = options?.limit ?? 5;

	try {
		// Generate embedding for the query
		const openai = new OpenAI({ apiKey: config.OPENAI_API_KEY });
		const response = await openai.embeddings.create({
			model: config.EMBEDDING_MODEL,
			input: query,
		});
		const queryVector = response.data[0].embedding;

		// Build filter conditions
		const filterConditions: Array<{
			key: string;
			match?: { value: string };
			range?: { gt?: string; gte?: string; lt?: string; lte?: string };
		}> = [];

		if (options?.roleFilter) {
			filterConditions.push({
				key: "role",
				match: { value: options.roleFilter },
			});
		}

		// Search Qdrant
		const searchResult = await qdrant.search(EMBEDDINGS_COLLECTION, {
			vector: queryVector,
			limit: limit + (options?.excludeThreadId ? 10 : 0), // Get extra to filter
			with_payload: true,
			filter: filterConditions.length > 0 ? { must: filterConditions } : undefined,
		});

		// Filter and map results
		const results = searchResult
			.filter((hit) => {
				if (options?.excludeThreadId && hit.payload?.threadId === options.excludeThreadId) {
					return false;
				}
				return true;
			})
			.slice(0, limit)
			.map((hit) => ({
				threadId: hit.payload?.threadId as string,
				messageId: hit.payload?.messageId as string,
				role: hit.payload?.role as string,
				content: hit.payload?.content as string,
				createdAt: hit.payload?.createdAt as string,
				score: hit.score,
			}));

		log.debug(
			{ query: query.slice(0, 50), resultCount: results.length },
			"History search completed"
		);
		return results;
	} catch (err) {
		log.error({ err, query: query.slice(0, 50) }, "History search failed");
		return [];
	}
}

// === Meta-tools (agent lifecycle control) ===

// These are created per-thread since they need thread context
function createMetaTools(thread: AgentThread) {
	const scheduleWakeTool = withTool(
		{
			name: "schedule_wake",
			description: `Schedule yourself to wake up later. Requires two parameters:
- delay: Time string like "10s", "5m", "2h", "1d"
- reason: What to check/do when you wake

Example: schedule_wake({ delay: "30s", reason: "Check if server started" })`,
			input: z.object({
				delay: z.string().describe('Time to wait, e.g. "10s", "5m", "2h", "1d"'),
				reason: z.string().describe("What to check/do when waking"),
			}),
		},
		async ({ delay, reason }) => {
			const delayMs = parseDelay(delay);

			// Schedule the wake job in BullMQ
			const job = await agentWakeQueue.add(
				"wake",
				{ threadId: thread.id, reason } satisfies WakeJobDataType,
				{ delay: delayMs }
			);

			// Update thread state
			const jobId = job.id ?? `wake-${thread.id}-${Date.now()}`;
			await agentRepository.setWake(thread.id, jobId, reason);

			log.info({ threadId: thread.id, delay, reason, jobId: job.id }, "Scheduled wake");

			return {
				success: true,
				message: `Scheduled to wake in ${delay}`,
				wakeAt: new Date(Date.now() + delayMs).toISOString(),
			};
		}
	);

	const completeTaskTool = withTool(
		{
			name: "complete_task",
			description: `Mark task as complete when the user's request is fully resolved.
- summary: Brief description of what was accomplished

Example: complete_task({ summary: "Started the Minecraft server" })`,
			input: z.object({
				summary: z.string().describe("Brief description of what was accomplished"),
			}),
		},
		async ({ summary }) => {
			await agentRepository.update(thread.id, { status: "complete" });

			log.info({ threadId: thread.id, summary }, "Task completed");

			return {
				success: true,
				message: "Task marked complete",
				summary,
			};
		}
	);

	const storeContextTool = withTool(
		{
			name: "store_context",
			description: `Store information for later. Persists across sleep/wake cycles.
- key: String identifier for the data
- value: Any JSON-serializable value to store

Example: store_context({ key: "pendingTask", value: { action: "restart", target: "minecraft" } })`,
			input: z.object({
				key: z.string().describe("String identifier for the data"),
				value: z.any().describe("Any JSON-serializable value"),
			}),
		},
		async ({ key, value }) => {
			const currentContext = { ...thread.context };
			currentContext[key] = value;

			await agentRepository.update(thread.id, {
				context: currentContext,
			});

			// Update local thread object
			thread.context = currentContext;

			return {
				success: true,
				message: `Stored "${key}" in context`,
			};
		}
	);

	const getContextTool = withTool(
		{
			name: "get_context",
			description: `Retrieve previously stored context data.
- key: The string identifier used when storing

Example: get_context({ key: "pendingTask" })`,
			input: z.object({
				key: z.string().describe("The string identifier used when storing"),
			}),
		},
		async ({ key }) => {
			const value = thread.context[key];

			if (value === undefined) {
				return { found: false, key };
			}

			return { found: true, key, value };
		}
	);

	const sendNotificationTool = withTool(
		{
			name: "send_notification",
			description: `Send a Discord notification to the user. Use this to alert the user about important events, completed tasks, or issues that need attention.
- message: The notification text to send

Example: send_notification({ message: "Server minecraft-smp is now online with 3 players" })`,
			input: z.object({
				message: z.string().describe("The notification text to send"),
			}),
		},
		async ({ message }) => {
			const sent = await notify(message);

			if (sent) {
				log.info(
					{ threadId: thread.id, messageLength: message.length },
					"Sent Discord notification"
				);
				return {
					success: true,
					message: "Notification sent to Discord",
				};
			}

			return {
				success: false,
				message: "Discord webhook not configured - notification not sent",
			};
		}
	);

	const searchHistoryTool = withTool(
		{
			name: "search_history",
			description: `Search your conversation history for relevant past interactions. Use this to recall what you've discussed before, find past decisions, or remember context from earlier conversations.
- query: What to search for (natural language)
- limit: Max results (default 5)

Example: search_history({ query: "minecraft server issues", limit: 3 })`,
			input: z.object({
				query: z.string().describe("Natural language search query"),
				limit: z
					.number()
					.min(1)
					.max(10)
					.optional()
					.describe("Maximum number of results (1-10, default 5)"),
			}),
		},
		async ({ query, limit }) => {
			const results = await searchHistory(query, {
				limit: limit ?? 5,
				excludeThreadId: thread.id, // Don't include current conversation
			});

			if (results.length === 0) {
				return {
					found: false,
					message: "No relevant past conversations found",
				};
			}

			return {
				found: true,
				count: results.length,
				results: results.map((r) => ({
					role: r.role,
					content: r.content.slice(0, 500) + (r.content.length > 500 ? "..." : ""),
					date: r.createdAt,
					relevance: `${Math.round(r.score * 100)}%`,
				})),
			};
		}
	);

	return [
		scheduleWakeTool.tool,
		completeTaskTool.tool,
		storeContextTool.tool,
		getContextTool.tool,
		sendNotificationTool.tool,
		searchHistoryTool.tool,
	];
}

// === Core agent functions ===

export async function createThread(
	source: ThreadSourceType,
	sourceId?: string
): Promise<AgentThread> {
	const thread = await agentRepository.create({
		id: generateId(),
		source,
		sourceId: sourceId ?? null,
		messages: [],
		context: {},
	});

	log.info({ threadId: thread.id, source, sourceId }, "Created thread");
	return thread;
}

export async function getThread(id: string): Promise<AgentThread | null> {
	return agentRepository.findById(id);
}

export async function getOrCreateThread(
	source: ThreadSourceType,
	sourceId: string
): Promise<AgentThread> {
	const existing = await agentRepository.findBySourceId(source, sourceId);
	if (existing && existing.status !== "complete" && existing.status !== "failed") {
		return existing;
	}
	return createThread(source, sourceId);
}

export async function listThreads(options?: {
	status?: "active" | "sleeping" | "complete" | "failed";
	source?: ThreadSourceType;
	limit?: number;
}): Promise<AgentThread[]> {
	return agentRepository.findAll(options);
}

/**
 * Run the agent loop for a thread.
 * This processes messages until the agent sleeps, completes, or errors.
 */
export async function runAgentLoop(
	thread: AgentThread,
	trigger: { type: "message"; content: string } | { type: "wake"; reason: string }
): Promise<{ thread: AgentThread; response: string }> {
	if (!config.OPENROUTER_API_KEY) {
		throw new Error("OPENROUTER_API_KEY not configured");
	}

	log.info({ threadId: thread.id, trigger }, "Starting agent loop");

	// Get existing messages and context (JSONB - already parsed by Drizzle)
	const messages: ThreadMessageType[] = [...(thread.messages as ThreadMessageType[])];
	const context = { ...thread.context };

	// Add trigger as new message and emit event
	if (trigger.type === "message") {
		const userMsgId = generateId();
		messages.push({
			id: userMsgId,
			role: "user",
			content: trigger.content,
		});
		appEvents.emit("thread:message", {
			threadId: thread.id,
			messageId: userMsgId,
			role: "user",
			content: trigger.content,
			done: true,
		});
		// Queue embedding for user message
		queueEmbedding(thread.id, userMsgId, "user", trigger.content);
	} else {
		// Wake trigger - inject as system message
		const wakeMsgId = generateId();
		const wakeContent = `Scheduled wake: ${trigger.reason}`;
		messages.push({
			id: wakeMsgId,
			role: "system",
			content: wakeContent,
		});
		appEvents.emit("thread:message", {
			threadId: thread.id,
			messageId: wakeMsgId,
			role: "system",
			content: wakeContent,
			done: true,
		});
		// Queue embedding for system/wake message
		queueEmbedding(thread.id, wakeMsgId, "system", wakeContent);
	}

	// Clear wake state if this was a wake
	if (trigger.type === "wake") {
		await agentRepository.clearWake(thread.id);
	}

	// Prepare tools (domain tools + meta-tools)
	const metaTools = createMetaTools(thread);
	const allTools = [...gameServerTools, ...systemInfoTools, ...appTools, ...opsTools, ...metaTools];

	// Build messages for LLM
	const adapter = createOpenAI(config.OPENROUTER_API_KEY, {
		baseURL: "https://openrouter.ai/api/v1",
	});

	// Build context string
	let contextStr = "";
	if (Object.keys(context).length > 0) {
		contextStr = `\n\n## Stored Context\n${JSON.stringify(context, null, 2)}`;
	}

	const llmMessages = [
		{
			role: "user" as const,
			content: `[SYSTEM]\n${AGENT_SYSTEM_PROMPT}${contextStr}\n[/SYSTEM]\n\nAcknowledge.`,
		},
		{
			role: "assistant" as const,
			content: "I understand. I'm The Machine, ready to help manage your Superbloom homelab.",
		},
		...messages
			.filter((m) => m.role !== "tool")
			.map((m) => ({
				// Convert system messages to user messages with prefix for LLM
				role: (m.role === "system" ? "user" : m.role) as "user" | "assistant",
				content: m.role === "system" ? `[SYSTEM WAKE] ${m.content}` : m.content || "",
			}))
			.filter((m) => m.content),
	];

	// Run LLM with direct DB writes on each chunk
	let response = "";
	let continueLoop = true;
	let iterations = 0;
	const maxIterations = 10; // Prevent infinite loops
	const maxDurationMs = 120_000; // 2 minute timeout to prevent runaway costs
	const startTime = Date.now();
	const aiModel = await getAiModel();

	// Wrap in tool context so tool calls can emit events with threadId
	await runWithToolContext(thread.id, async () => {
		while (continueLoop && iterations < maxIterations) {
			iterations++;

			// Check timeout
			if (Date.now() - startTime > maxDurationMs) {
				log.warn({ threadId: thread.id, elapsed: Date.now() - startTime }, "Agent loop timeout");
				throw new Error("Agent loop timeout - exceeded 2 minutes");
			}

			const result = await chat({
				adapter,
				messages: llmMessages,
				model: aiModel as (typeof adapter.models)[number],
				tools: allTools,
			});

			// Create message entry for streaming
			const messageId = generateId();
			let assistantMessage: ThreadMessageType = {
				id: messageId,
				role: "assistant",
				content: "",
			};
			messages.push(assistantMessage);

			// Stream response with direct DB writes
			let chunkCount = 0;
			let currentMessageId = messageId;
			for await (const chunk of result) {
				log.debug({ threadId: thread.id, chunkType: chunk.type }, "Received chunk from LLM");

				if (chunk.type === "content") {
					chunkCount++;
					const prevLength = assistantMessage.content?.length || 0;
					const newLength = chunk.content.length;

					// Detect content reset (happens after tool calls) - create new message
					if (newLength < prevLength && prevLength > 0) {
						log.info(
							{ threadId: thread.id, messageId: currentMessageId, prevLength, newLength },
							"Content reset detected - tool call completed"
						);

						// Finalize current message
						appEvents.emit("thread:message", {
							threadId: thread.id,
							messageId: currentMessageId,
							role: "assistant",
							content: assistantMessage.content || "",
							done: true,
						});
						// Queue embedding for assistant message before tool call
						if (assistantMessage.content) {
							queueEmbedding(thread.id, currentMessageId, "assistant", assistantMessage.content);
						}

						// Create new message for post-tool response
						currentMessageId = generateId();
						assistantMessage = {
							id: currentMessageId,
							role: "assistant",
							content: "",
						};
						messages.push(assistantMessage);
					}

					// TanStack AI sends cumulative content, not deltas - just replace
					assistantMessage.content = chunk.content;

					// Write to DB on each chunk (with error handling)
					try {
						await agentRepository.update(thread.id, {
							messages: messages,
						});
					} catch (dbErr) {
						log.error(
							{ dbErr, threadId: thread.id, messageId: currentMessageId },
							"Failed to write chunk to DB"
						);
						// Continue streaming - we'll try again on next chunk
					}

					// Emit event after DB write
					appEvents.emit("thread:message", {
						threadId: thread.id,
						messageId: currentMessageId,
						role: "assistant",
						content: assistantMessage.content,
						done: false,
					});
				}
			}
			log.info(
				{ threadId: thread.id, messageId: currentMessageId, totalChunks: chunkCount },
				"Finished streaming chunks"
			);
			response = assistantMessage.content || "";

			// Emit final state
			if (response) {
				appEvents.emit("thread:message", {
					threadId: thread.id,
					messageId: currentMessageId,
					role: "assistant",
					content: response,
					done: true,
				});
				// Queue embedding for final assistant response
				queueEmbedding(thread.id, currentMessageId, "assistant", response);

				llmMessages.push({
					role: "assistant" as const,
					content: response,
				});
			} else {
				// No content - remove empty message
				messages.pop();
			}

			// Check if agent called lifecycle tools (thread status will be updated)
			const updatedThread = await agentRepository.findById(thread.id);
			if (updatedThread) {
				thread = updatedThread;
			}

			// Always break after getting a response
			// The loop only continues if we explicitly need another LLM call
			// (e.g., tool execution that requires follow-up - handled internally by TanStack AI)
			continueLoop = false;
		}
	}); // end runWithToolContext

	// Final status update with retry logic
	const finalStatus =
		thread.status === "sleeping" || thread.status === "complete" ? thread.status : "active";
	let writeSuccess = false;
	for (let attempt = 0; attempt < 3 && !writeSuccess; attempt++) {
		try {
			await agentRepository.update(thread.id, {
				messages: messages,
				status: finalStatus,
			});
			writeSuccess = true;
		} catch (dbErr) {
			log.error(
				{ dbErr, threadId: thread.id, attempt: attempt + 1 },
				"Failed to write final state to DB"
			);
			if (attempt < 2) {
				await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
			}
		}
	}
	if (!writeSuccess) {
		log.error({ threadId: thread.id }, "All attempts to write final state failed");
	}

	log.info({ threadId: thread.id, status: finalStatus, iterations }, "Agent loop completed");

	// Generate title after first user message + response (async, don't block)
	const userMessages = messages.filter((m) => m.role === "user");
	if (userMessages.length === 1 && response && !thread.title) {
		const userContent = userMessages[0].content || "";
		generateConversationTitle(userContent, response).then((title) => {
			if (title) {
				log.info({ threadId: thread.id, title }, "Generated thread title");
				agentRepository.update(thread.id, { title });
				appEvents.emit("thread:updated", { id: thread.id, title });
			}
		});
	}

	return { thread, response };
}

/**
 * Send a message to a thread and run the agent loop.
 * Returns the agent's response.
 */
export async function sendMessage(
	threadId: string,
	content: string
): Promise<{ thread: AgentThread; response: string }> {
	const thread = await agentRepository.findById(threadId);
	if (!thread) {
		throw new Error(`Thread ${threadId} not found`);
	}

	// Cancel any pending wake if thread was sleeping
	if (thread.wakeJobId) {
		try {
			const job = await agentWakeQueue.getJob(thread.wakeJobId);
			if (job) {
				await job.remove();
				log.info({ threadId, jobId: thread.wakeJobId }, "Cancelled pending wake");
			}
		} catch (err) {
			log.warn({ err, threadId }, "Failed to cancel wake job");
		}
	}

	return runAgentLoop(thread, { type: "message", content });
}

/**
 * Wake a sleeping thread (called by worker).
 */
export async function wakeThread(
	threadId: string,
	reason: string
): Promise<{ thread: AgentThread; response: string }> {
	const thread = await agentRepository.findById(threadId);
	if (!thread) {
		throw new Error(`Thread ${threadId} not found`);
	}

	if (thread.status !== "sleeping") {
		log.warn({ threadId, status: thread.status }, "Thread not sleeping, skipping wake");
		return { thread, response: "" };
	}

	return runAgentLoop(thread, { type: "wake", reason });
}

/**
 * Chat with TanStack AI message format.
 * Creates thread if none provided, delegates to sendMessage.
 * Returns threadId for client to track.
 */
export async function processChat(
	incomingMessages: ChatMessageType[],
	threadId?: string
): Promise<{ threadId: string; response: string }> {
	// Get or create thread
	let thread: AgentThread;
	if (threadId) {
		const existing = await agentRepository.findById(threadId);
		if (!existing) {
			throw new Error(`Thread ${threadId} not found`);
		}
		thread = existing;
	} else {
		thread = await createThread("chat");
	}

	// Extract the latest user message content
	const lastUserMessage = [...incomingMessages].reverse().find((m) => m.role === "user");
	if (!lastUserMessage) {
		throw new Error("No user message found");
	}

	// Get content from the message (could be in content or parts)
	let userContent = "";
	if (lastUserMessage.content) {
		userContent = lastUserMessage.content;
	} else if (lastUserMessage.parts) {
		userContent = lastUserMessage.parts
			.filter((p) => p.type === "text")
			.map((p) => p.content || p.text || "")
			.filter(Boolean)
			.join("\n");
	}

	if (!userContent) {
		throw new Error("Empty user message");
	}

	// Delegate to sendMessage which handles the agent loop
	const result = await sendMessage(thread.id, userContent);

	return { threadId: thread.id, response: result.response };
}

// === Alert handling ===

export interface AlertInput {
	alertName: string;
	severity: string;
	description: string;
	labels: Record<string, string>;
	annotations: Record<string, string>;
	startsAt: string;
	fingerprint: string;
	generatorURL?: string;
}

/**
 * Create an agent thread from an Alertmanager alert.
 * Uses fingerprint for deduplication - won't create duplicate threads for the same alert.
 */
export async function createThreadFromAlert(alert: AlertInput): Promise<AgentThread> {
	// Check for existing active thread for this alert (dedup by fingerprint)
	const existing = await agentRepository.findBySourceId("alert", alert.fingerprint);
	if (existing && existing.status !== "complete" && existing.status !== "failed") {
		log.info(
			{ threadId: existing.id, fingerprint: alert.fingerprint },
			"Alert thread already exists, skipping"
		);
		return existing;
	}

	// Create new thread for this alert
	const thread = await agentRepository.create({
		id: generateId(),
		source: "alert",
		sourceId: alert.fingerprint,
		messages: [],
		context: {
			alert: {
				name: alert.alertName,
				severity: alert.severity,
				labels: alert.labels,
				annotations: alert.annotations,
				startsAt: alert.startsAt,
				generatorURL: alert.generatorURL,
			},
		},
	});

	log.info(
		{ threadId: thread.id, alertName: alert.alertName, severity: alert.severity },
		"Created thread for alert"
	);

	// Build alert message for the agent
	const alertMessage = buildAlertMessage(alert);

	// Run agent loop with the alert (fire and forget - don't block webhook response)
	runAgentLoop(thread, { type: "message", content: alertMessage }).catch((err) => {
		log.error({ err, threadId: thread.id, alertName: alert.alertName }, "Failed to process alert");
		agentRepository.update(thread.id, { status: "failed" });
	});

	return thread;
}

function buildAlertMessage(alert: AlertInput): string {
	const parts = [
		`🚨 **Alert: ${alert.alertName}** (${alert.severity})`,
		"",
		alert.description,
		"",
		"**Labels:**",
		...Object.entries(alert.labels).map(([k, v]) => `- ${k}: ${v}`),
	];

	if (Object.keys(alert.annotations).length > 0) {
		parts.push("", "**Annotations:**");
		for (const [k, v] of Object.entries(alert.annotations)) {
			if (k !== "description" && k !== "summary") {
				parts.push(`- ${k}: ${v}`);
			}
		}
	}

	if (alert.generatorURL) {
		parts.push("", `[View in Alertmanager](${alert.generatorURL})`);
	}

	parts.push(
		"",
		"---",
		"Investigate this alert. Check relevant metrics, logs, and system state. Take autonomous action if safe and appropriate, or summarize findings and recommend next steps."
	);

	return parts.join("\n");
}

// === Exported tools array for AI service ===

export const agentTools: never[] = []; // Agent meta-tools are created per-thread, not exported globally
