import { chat, convertMessagesToModelMessages, maxIterations, toServerSentEventsResponse } from "@tanstack/ai";
import type { StreamChunk, ModelMessage } from "@tanstack/ai";
import { Elysia, t } from "elysia";
import logger from "@nexus/logger";
import { generateConversationTitle } from "../../infra/ai";
import { appEvents } from "../../infra/events";
import { getToolSummary, getToolsByCategory, toolRegistry } from "../../infra/tool-registry";
import {
	AGENT_SYSTEM_PROMPT,
	createAdapter,
	createThread,
	getAllDomainTools,
	getContextStr,
	getThread,
	listThreads,
	queueEmbedding,
	sendMessage,
} from "./functions";
import { agentRepository } from "./repository";
import type { AgentThread } from "./schema";
import {
	AgentThreadDetail,
	AgentThreadResponse,
	ApiError,
	ChatRequest,
	CreateThreadRequest,
	SendMessageRequest,
	ThreadIdParam,
	ThreadsQueryParams,
} from "./types";

const log = logger.child({ module: "agent-routes" });

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function threadToResponse(thread: AgentThread) {
	return {
		id: thread.id,
		status: thread.status,
		source: thread.source,
		sourceId: thread.sourceId,
		title: thread.title,
		messageCount: Array.isArray(thread.messages) ? thread.messages.length : 0,
		context: thread.context,
		wakeReason: thread.wakeReason,
		createdAt: thread.createdAt.toISOString(),
		updatedAt: thread.updatedAt.toISOString(),
	};
}

function threadToDetail(thread: AgentThread) {
	return {
		id: thread.id,
		status: thread.status,
		source: thread.source,
		sourceId: thread.sourceId,
		title: thread.title,
		messages: thread.messages.map(m => ({
			role: m.role,
			content: typeof m.content === "string" || m.content === null ? m.content : null,
			toolCalls: m.toolCalls,
			toolCallId: m.toolCallId,
			name: m.name,
		})),
		context: thread.context,
		wakeJobId: thread.wakeJobId,
		wakeReason: thread.wakeReason,
		createdAt: thread.createdAt.toISOString(),
		updatedAt: thread.updatedAt.toISOString(),
	};
}

/**
 * Async generator that wraps the chat stream with side effects:
 * - Collects messages for DB persistence
 * - Queues embeddings
 * - Triggers title generation on first exchange
 */
async function* withPersistence(
	stream: AsyncIterable<StreamChunk>,
	thread: AgentThread,
	existingMessages: ModelMessage[],
	firstUserContent: string | null,
	timeout: ReturnType<typeof setTimeout>,
): AsyncIterable<StreamChunk> {
	const collectedMessages: ModelMessage[] = [];
	let currentContent = "";
	let currentToolCalls: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }> = [];
	let lastAssistantContent: string | null = null;

	// Track tool call args accumulation
	const toolCallArgsBuffers = new Map<string, { name: string; args: string }>();

	try {
		for await (const chunk of stream) {
			// Track state for persistence
			switch (chunk.type) {
				case "TEXT_MESSAGE_CONTENT":
					currentContent += chunk.delta;
					break;

				case "TEXT_MESSAGE_END":
					if (currentContent) {
						const msg: ModelMessage = {
							role: "assistant",
							content: currentContent,
							...(currentToolCalls.length > 0 && { toolCalls: currentToolCalls }),
						};
						collectedMessages.push(msg);
						lastAssistantContent = currentContent;
						queueEmbedding(thread.id, generateId(), "assistant", currentContent);
					}
					currentContent = "";
					currentToolCalls = [];
					break;

				case "TOOL_CALL_START":
					toolCallArgsBuffers.set(chunk.toolCallId, { name: chunk.toolName, args: "" });
					break;

				case "TOOL_CALL_ARGS":
					if (toolCallArgsBuffers.has(chunk.toolCallId)) {
						const buf = toolCallArgsBuffers.get(chunk.toolCallId)!;
						buf.args += chunk.delta;
					}
					break;

				case "TOOL_CALL_END": {
					const buf = toolCallArgsBuffers.get(chunk.toolCallId);
					if (buf) {
						currentToolCalls.push({
							id: chunk.toolCallId,
							type: "function",
							function: { name: buf.name, arguments: buf.args },
						});
						toolCallArgsBuffers.delete(chunk.toolCallId);

						// Tool result message
						if (chunk.result !== undefined) {
							collectedMessages.push({
								role: "tool",
								content: typeof chunk.result === "string" ? chunk.result : JSON.stringify(chunk.result),
								toolCallId: chunk.toolCallId,
							});
						}
					}
					break;
				}

				case "RUN_FINISHED":
					// Persist all collected messages to DB
					try {
						await agentRepository.update(thread.id, {
							messages: [...existingMessages, ...collectedMessages],
						});
					} catch (dbErr) {
						log.error({ dbErr, threadId: thread.id }, "Failed to persist messages to DB");
					}
					break;
			}

			yield chunk; // Forward all events to the client
		}
	} finally {
		clearTimeout(timeout);

		// Title generation on first exchange
		if (!thread.title && firstUserContent && lastAssistantContent) {
			generateConversationTitle(firstUserContent, lastAssistantContent).then((title) => {
				if (title) {
					log.info({ threadId: thread.id, title }, "Generated thread title");
					agentRepository.update(thread.id, { title });
					appEvents.emit("thread:updated", { id: thread.id, title });
				}
			});
		}
	}
}

export const agentRoutes = new Elysia({ prefix: "/agent" })
	// List threads
	.get(
		"/threads",
		async ({ query }) => {
			const threads = await listThreads({
				status: query.status as "active" | "sleeping" | "complete" | "failed" | undefined,
				source: query.source as "chat" | "discord" | "event" | "scheduled" | undefined,
				limit: query.limit ? parseInt(query.limit, 10) : undefined,
			});
			return threads.map(threadToResponse);
		},
		{
			detail: { tags: ["Agent"], summary: "List agent threads" },
			query: ThreadsQueryParams,
			response: { 200: t.Array(AgentThreadResponse) },
		}
	)

	// Create thread
	.post(
		"/threads",
		async ({ body }) => {
			const thread = await createThread(body.source, body.sourceId);

			// If initial message provided, send it
			if (body.initialMessage) {
				const { thread: updatedThread, response } = await sendMessage(
					thread.id,
					body.initialMessage
				);
				return {
					...threadToDetail(updatedThread),
					lastResponse: response,
				};
			}

			return threadToDetail(thread);
		},
		{
			detail: { tags: ["Agent"], summary: "Create a new agent thread" },
			body: CreateThreadRequest,
			response: {
				200: t.Intersect([AgentThreadDetail, t.Object({ lastResponse: t.Optional(t.String()) })]),
			},
		}
	)

	// Get thread
	.get(
		"/threads/:id",
		async ({ params, set }) => {
			const thread = await getThread(params.id);
			if (!thread) {
				set.status = 404;
				return { error: "Thread not found" };
			}
			return threadToDetail(thread);
		},
		{
			detail: { tags: ["Agent"], summary: "Get thread by ID" },
			params: ThreadIdParam,
			response: { 200: AgentThreadDetail, 404: ApiError },
		}
	)

	// Send message to thread (non-streaming, for workers/discord)
	.post(
		"/threads/:id/message",
		async ({ params, body, set }) => {
			try {
				const { thread, response } = await sendMessage(params.id, body.content);
				return {
					...threadToDetail(thread),
					lastResponse: response,
				};
			} catch (err) {
				if (err instanceof Error && err.message.includes("not found")) {
					set.status = 404;
					return { error: err.message };
				}
				throw err;
			}
		},
		{
			detail: { tags: ["Agent"], summary: "Send message to thread (non-streaming)" },
			params: ThreadIdParam,
			body: SendMessageRequest,
			response: {
				200: t.Intersect([AgentThreadDetail, t.Object({ lastResponse: t.String() })]),
				404: ApiError,
			},
		}
	)

	// Chat endpoint - SSE streaming via TanStack AI
	.post(
		"/chat",
		async ({ body, query }) => {
			const threadIdInput = query.threadId;

			// Load or create thread
			let thread: AgentThread;
			if (threadIdInput) {
				const existing = await agentRepository.findById(threadIdInput);
				if (!existing) {
					return new Response(JSON.stringify({ error: "Thread not found" }), {
						status: 404,
						headers: { "Content-Type": "application/json" },
					});
				}
				thread = existing;
			} else {
				thread = await createThread("chat");
			}

			// Convert incoming UIMessages → ModelMessages for the LLM
			const modelMessages = convertMessagesToModelMessages(body.messages);

			// Get existing thread messages from DB
			const existingMessages = thread.messages ?? [];

			// Build messages with text-only content (our text adapter only handles string content)
			const allMessages = [
				...existingMessages.map(m => ({
					role: m.role,
					content: typeof m.content === "string" || m.content === null ? m.content : null,
					toolCalls: m.toolCalls,
					toolCallId: m.toolCallId,
					name: m.name,
				})),
				...modelMessages.map(m => ({
					role: m.role,
					content: typeof m.content === "string" || m.content === null ? m.content : null,
					toolCalls: m.toolCalls,
					toolCallId: m.toolCallId,
					name: m.name,
				})),
			];

			// Extract first user content for title generation
			const userMessages = allMessages.filter((m) => m.role === "user");
			const firstUserContent = userMessages.length === 1 ? (userMessages[0].content || null) : null;

			// Queue embedding for the new user message
			const lastUserMsg = modelMessages.filter((m) => m.role === "user").pop();
			if (lastUserMsg && typeof lastUserMsg.content === "string") {
				queueEmbedding(thread.id, generateId(), "user", lastUserMsg.content);
			}

			// Persist user message immediately
			await agentRepository.update(thread.id, { messages: allMessages });

			// Create adapter
			const { adapter } = await createAdapter();
			const contextStr = getContextStr(thread);
			const allTools = getAllDomainTools(thread);

			// Set up timeout
			const abortController = new AbortController();
			const timeout = setTimeout(() => abortController.abort(), 120_000);

			// Run chat with built-in agent loop
			const stream = chat({
				adapter,
				messages: allMessages,
				systemPrompts: [AGENT_SYSTEM_PROMPT + contextStr],
				tools: allTools,
				agentLoopStrategy: maxIterations(10),
				abortController,
			});

			// Wrap with side effects (DB persistence, embeddings, title gen)
			const wrapped = withPersistence(stream, thread, allMessages, firstUserContent, timeout);

			// Return SSE Response
			return toServerSentEventsResponse(wrapped, { abortController });
		},
		{
			detail: { tags: ["Agent"], summary: "Chat with agent (SSE streaming)" },
			query: t.Object({
				threadId: t.Optional(t.String()),
			}),
			body: ChatRequest,
		}
	)

	// List all available tools
	.get(
		"/tools",
		() => {
			const summary = getToolSummary();
			return {
				total: summary.total,
				byCategory: summary.byCategory,
				tools: toolRegistry,
			};
		},
		{
			detail: { tags: ["Agent"], summary: "List all available agent tools" },
			response: {
				200: t.Object({
					total: t.Number(),
					byCategory: t.Record(t.String(), t.Number()),
					tools: t.Array(
						t.Object({
							name: t.String(),
							description: t.String(),
							category: t.String(),
							parameters: t.Optional(
								t.Record(
									t.String(),
									t.Object({
										type: t.String(),
										description: t.Optional(t.String()),
										required: t.Optional(t.Boolean()),
									})
								)
							),
						})
					),
				}),
			},
		}
	)

	// Get tools grouped by category
	.get(
		"/tools/grouped",
		() => {
			return getToolsByCategory();
		},
		{
			detail: { tags: ["Agent"], summary: "Get tools grouped by category" },
			response: {
				200: t.Record(
					t.String(),
					t.Array(
						t.Object({
							name: t.String(),
							description: t.String(),
							category: t.String(),
							parameters: t.Optional(
								t.Record(
									t.String(),
									t.Object({
										type: t.String(),
										description: t.Optional(t.String()),
										required: t.Optional(t.Boolean()),
									})
								)
							),
						})
					)
				),
			},
		}
	);
