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
		messages: thread.messages,
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
 * - Triggers title generation on first exchange
 */
async function* withPersistence(
	stream: AsyncIterable<StreamChunk>,
	thread: AgentThread,
	// Note: existingMessages already includes the user message (persisted before streaming starts)
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
						} else {
							log.warn({ toolCallId: chunk.toolCallId, toolName: buf.name }, "TOOL_CALL_END received without result");
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
			// useChat sends the full conversation each time — no need to load from DB
			const messages = convertMessagesToModelMessages(body.messages);

			// First exchange? Extract user content for title generation
			const isFirstExchange = !thread.title && messages.filter((m) => m.role === "user").length === 1;
			const firstUserContent = isFirstExchange
				? (messages.find((m) => m.role === "user")?.content as string | null)
				: null;

			// Create adapter
			const { adapter } = await createAdapter();
			const contextStr = getContextStr(thread);
			const allTools = getAllDomainTools(thread);

			// Set up timeout
			const abortController = new AbortController();
			const timeout = setTimeout(() => abortController.abort(), 120_000);

			// Run chat with built-in agent loop
			// Note: convertMessagesToModelMessages returns ModelMessage[] but chat() expects
			// ConstrainedModelMessage — a TanStack AI type gap between their own functions
			const stream = chat({
				adapter,
				messages: messages as Parameters<typeof chat>[0]["messages"],
				systemPrompts: [AGENT_SYSTEM_PROMPT + contextStr],
				tools: allTools,
				agentLoopStrategy: maxIterations(10),
				abortController,
			});

			// Wrap with side effects (DB persistence, title gen)
			const wrapped = withPersistence(stream, thread, messages, firstUserContent, timeout);

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
