import { chat, maxIterations, streamToText, toolDefinition } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import logger from "@nexus/logger";
import { z } from "zod";
import { generateConversationTitle } from "../../infra/ai";
import { config } from "../../infra/config";
import { notify } from "../../infra/discord";
import { appEvents } from "../../infra/events";
import { agentWakeQueue } from "../../infra/queue";
import { appTools } from "../apps/functions";
import { getAiModel } from "../core/functions";
import { gameServerTools } from "../game-servers/functions";
import { mediaTools } from "../media/functions";
import { opsTools } from "../ops/functions";
import { systemInfoTools } from "../system-info/functions";
import { agentRepository } from "./repository";
import type { AgentThread } from "./schema";

import type {
	ThreadSourceType,
	WakeJobDataType,
} from "./types";

const log = logger.child({ module: "agent" });

// === System prompt for agent mode ===

export const AGENT_SYSTEM_PROMPT = `You are The Machine, the autonomous agent for Superbloom - a homelab server running NixOS with K3s.

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
- Trigger infrastructure operations (NixOS rebuild, ArgoCD sync)
- Check operation status and history
- Create GitHub issues when code changes are needed (use 'claude-fix' label to trigger automated fixing)
- Search the media library (movies and TV shows)
- Check if specific movies or TV shows are available/downloaded
- Request new movies and TV shows to be downloaded
- Get download queue status (what's downloading, progress, ETA)
- Get download history (what completed recently)
- Pause/resume downloads (for bandwidth management)

## Agent Lifecycle Tools
You also have special tools to control your own lifecycle:
- schedule_wake: Schedule yourself to wake up later to check on something
- complete_task: Mark the current task as complete when done
- store_context: Store information you'll need later (persists across sleep/wake)
- send_notification: Send a Discord notification to alert the user about important events

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

## Using Media Tools

### Searching Media
Use **search_media(query)** for ANY media question - it returns everything you need in one call:

- "Do we have Batman?" → search_media("Batman")
- "Is Breaking Bad available?" → search_media("Breaking Bad")
- "Has Barry finished downloading?" → search_media("Barry")

Each result includes a **status** field:
- "available" = fully downloaded, ready to watch
- "partially available" = some content downloaded
- "processing" = currently downloading
- "pending" = requested, waiting to download
- "unknown" = not in library

Example: User asks "Do we have Jujutsu Kaisen?"
→ search_media("Jujutsu Kaisen")
→ Results show: { title: "JUJUTSU KAISEN", type: "tv", status: "available" }
→ Answer: "Yes, Jujutsu Kaisen is available and ready to watch!"

You do NOT need multiple tool calls - search_media status is authoritative.

### Requesting New Media
Use **request_movie(tmdbId)** or **request_tv_show(tmdbId, seasons)** to add new content:

IMPORTANT: Always search first to get the TMDB ID, then request.

Example: User asks "Can you download The Batman?"
1. Call search_media("The Batman")
2. Confirm which result (e.g., "The Batman (2022)" with tmdbId 414906)
3. Call request_movie(414906)
4. Confirm request submitted

For TV shows, you can request specific seasons or all:
- User: "Download Breaking Bad season 1" → search_media("Breaking Bad") → request_tv_show(tmdbId, [1])
- User: "Download all of The Wire" → search_media("The Wire") → request_tv_show(tmdbId)

After requesting, the content will appear in search results with status "pending" or "processing".

## Using Download Tools
Use **get_download_queue()** for download progress questions:
- "What's downloading?" → get_download_queue()
- "How long until Barry is done?" → get_download_queue() then find Barry in items
- "What's the download speed?" → get_download_queue()

Use **get_download_history()** for recent completions:
- "What finished today?" → get_download_history()
- "Any failed downloads?" → get_download_history()

Use **pause_downloads()** / **resume_downloads()** for bandwidth management:
- "Pause downloads, I'm gaming" → pause_downloads()
- "Resume downloads" → resume_downloads()
- You can autonomously pause if the user starts a game server, then schedule_wake to resume later

## Escalating to Code Changes (GitHub Issues)
When you investigate a problem and determine it needs a CODE CHANGE (not just a restart or config tweak):
1. Investigate thoroughly first — get logs, describe the resource, check events
2. Call create_github_issue with:
   - A clear title describing the bug/issue
   - A body containing: what happened, your investigation findings (logs, errors), affected services/files, and your suggested fix direction
   - Label 'claude-fix' to trigger automated fixing via Claude Code
   - Label 'bug' for bugs, 'ops' for infra issues
3. Call send_notification to alert the user that you've filed an issue
4. Optionally schedule_wake to check if the issue was resolved later

Example: CrashLoopBackOff in api pod due to a missing env var
→ get_pod_logs("api-xxx") → see "Error: DATABASE_URL is undefined"
→ describe_resource("pod", "api-xxx") → see env vars are missing
→ create_github_issue({ title: "API pod crash: missing DATABASE_URL env var", body: "## Problem\n...", labels: ["claude-fix", "bug"] })
→ send_notification("Filed issue #42 for API crash — assigned Claude Code to fix it")

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

export function generateId(): string {
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

// === Meta-tools (agent lifecycle control) ===

// These are created per-thread since they need thread context
export function createMetaTools(thread: AgentThread) {
	const scheduleWakeTool = toolDefinition({
			name: "schedule_wake",
			description: `Schedule yourself to wake up later. Requires two parameters:
- delay: Time string like "10s", "5m", "2h", "1d"
- reason: What to check/do when you wake

Example: schedule_wake({ delay: "30s", reason: "Check if server started" })`,
			inputSchema: z.object({
				delay: z.string().describe('Time to wait, e.g. "10s", "5m", "2h", "1d"'),
				reason: z.string().describe("What to check/do when waking"),
			}),
		}).server(async ({ delay, reason }) => {
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

	const completeTaskTool = toolDefinition({
			name: "complete_task",
			description: `Mark task as complete when the user's request is fully resolved.
- summary: Brief description of what was accomplished

Example: complete_task({ summary: "Started the Minecraft server" })`,
			inputSchema: z.object({
				summary: z.string().describe("Brief description of what was accomplished"),
			}),
		}).server(async ({ summary }) => {
			await agentRepository.update(thread.id, { status: "complete" });

			log.info({ threadId: thread.id, summary }, "Task completed");

			return {
				success: true,
				message: "Task marked complete",
				summary,
			};
		}
	);

	const storeContextTool = toolDefinition({
			name: "store_context",
			description: `Store information for later. Persists across sleep/wake cycles.
- key: String identifier for the data
- value: Any JSON-serializable value to store

Example: store_context({ key: "pendingTask", value: { action: "restart", target: "minecraft" } })`,
			inputSchema: z.object({
				key: z.string().describe("String identifier for the data"),
				value: z.any().describe("Any JSON-serializable value"),
			}),
		}).server(async ({ key, value }) => {
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

	const getContextTool = toolDefinition({
			name: "get_context",
			description: `Retrieve previously stored context data.
- key: The string identifier used when storing

Example: get_context({ key: "pendingTask" })`,
			inputSchema: z.object({
				key: z.string().describe("The string identifier used when storing"),
			}),
		}).server(async ({ key }) => {
			const value = thread.context[key];

			if (value === undefined) {
				return { found: false, key };
			}

			return { found: true, key, value };
		}
	);

	const sendNotificationTool = toolDefinition({
			name: "send_notification",
			description: `Send a Discord notification to the user. Use this to alert the user about important events, completed tasks, or issues that need attention.
- message: The notification text to send

Example: send_notification({ message: "Server minecraft-smp is now online with 3 players" })`,
			inputSchema: z.object({
				message: z.string().describe("The notification text to send"),
			}),
		}).server(async ({ message }) => {
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

	return [
		scheduleWakeTool,
		completeTaskTool,
		storeContextTool,
		getContextTool,
		sendNotificationTool,
	];
}

// === Helper to build context string ===

export function getContextStr(thread: AgentThread): string {
	if (Object.keys(thread.context).length > 0) {
		return `\n\n## Stored Context\n${JSON.stringify(thread.context, null, 2)}`;
	}
	return "";
}

// === Helper to create adapter ===

export async function createAdapter() {
	const aiModel = await getAiModel();
	return {
		adapter: createOpenRouterText(
			aiModel as Parameters<typeof createOpenRouterText>[0],
			config.OPENROUTER_API_KEY!,
		),
		model: aiModel,
	};
}

// === All domain tools (flat array) ===

export function getAllDomainTools(thread: AgentThread) {
	const metaTools = createMetaTools(thread);
	return [...gameServerTools, ...systemInfoTools, ...appTools, ...opsTools, ...mediaTools, ...metaTools];
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
 * Run the agent loop for a thread (worker-only: wakes, alerts, discord).
 * No SSE streaming — runs to completion, persists to DB, emits thread:updated.
 */
export async function runAgentLoop(
	thread: AgentThread,
	trigger: { type: "message"; content: string } | { type: "wake"; reason: string }
): Promise<{ thread: AgentThread; response: string }> {
	if (!config.OPENROUTER_API_KEY) {
		throw new Error("OPENROUTER_API_KEY not configured");
	}

	log.info({ threadId: thread.id, trigger }, "Starting agent loop");

	const messages = [...thread.messages];

	// Add trigger as new message
	if (trigger.type === "message") {
		messages.push({ role: "user" as const, content: trigger.content });
	} else {
		const wakeContent = `[SYSTEM WAKE] Scheduled wake: ${trigger.reason}`;
		messages.push({ role: "user" as const, content: wakeContent });
	}

	// Clear wake state if this was a wake
	if (trigger.type === "wake") {
		await agentRepository.clearWake(thread.id);
	}

	// Prepare tools and adapter
	const allTools = getAllDomainTools(thread);
	const { adapter } = await createAdapter();
	const contextStr = getContextStr(thread);

	// Run chat with built-in agent loop (non-streaming for workers)
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), 120_000);

	let response: string;
	try {
		// convertMessagesToModelMessages returns ModelMessage[] but chat() expects
		// ConstrainedModelMessage — a known TanStack AI type gap (their internal code uses `as any`)
		const stream = chat({
			adapter,
			messages: messages as Parameters<typeof chat>[0]["messages"],
			systemPrompts: [AGENT_SYSTEM_PROMPT + contextStr],
			tools: allTools,
			agentLoopStrategy: maxIterations(10),
			abortController,
		});
		response = await streamToText(stream);
	} finally {
		clearTimeout(timeout);
	}

	// Build new messages to persist: original messages + assistant response
	const newMessages = [...messages];
	if (response) {
		newMessages.push({ role: "assistant" as const, content: response });
	}

	// Persist final state
	const updatedThread = await agentRepository.findById(thread.id);
	if (updatedThread) {
		thread = updatedThread;
	}

	const finalStatus =
		thread.status === "sleeping" || thread.status === "complete" ? thread.status : "active";

	let writeSuccess = false;
	for (let attempt = 0; attempt < 3 && !writeSuccess; attempt++) {
		try {
			await agentRepository.update(thread.id, {
				messages: newMessages,
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

	log.info({ threadId: thread.id, status: finalStatus }, "Agent loop completed");

	// Emit thread:updated so UI knows to refetch if viewing this thread
	appEvents.emit("thread:updated", { id: thread.id, title: thread.title });

	// Generate title after first user message + response (async, don't block)
	const userMessages = newMessages.filter((m) => m.role === "user");
	if (userMessages.length === 1 && response && !thread.title) {
		const userContent = typeof userMessages[0].content === "string" ? userMessages[0].content : "";
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
		`Alert: ${alert.alertName} (${alert.severity})`,
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
