import logger from "@nexus/logger";
import type { StreamChunk } from "@tanstack/ai";
import { chat, convertMessagesToModelMessages, maxIterations, toServerSentEventsResponse } from "@tanstack/ai";
import { Elysia, t } from "elysia";
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
 * Thin wrapper around the chat stream for logging and title generation.
 *
 * Persistence is NOT done here — the client (useChat) sends the full conversation
 * on each request. We persist those client-sent messages at the start of each /chat
 * request, which captures the complete state including all prior tool calls/results.
 * TanStack AI's chat() handles the agent loop; we just pass through events.
 */
async function* withSideEffects(
	stream: AsyncIterable<StreamChunk>,
	thread: AgentThread,
	firstUserContent: string | null,
	timeout: ReturnType<typeof setTimeout>,
	model: string
): AsyncIterable<StreamChunk> {
	let lastAssistantContent: string | null = null;
	let accumulatedContent = "";
	let chunkCount = 0;
	let lastChunkType = "";

	try {
		for await (const chunk of stream) {
			chunkCount++;
			lastChunkType = chunk.type;

			switch (chunk.type) {
				case "TEXT_MESSAGE_CONTENT":
					accumulatedContent += chunk.delta;
					break;

				case "TOOL_CALL_START":
					log.info(
						{ threadId: thread.id, toolName: chunk.toolName, toolCallId: chunk.toolCallId, model },
						"Tool call started"
					);
					break;

				case "TOOL_CALL_END":
					log.info(
						{ threadId: thread.id, toolName: chunk.toolName, toolCallId: chunk.toolCallId, model },
						"Tool call completed"
					);
					break;

				case "RUN_ERROR":
					log.error(
						{
							threadId: thread.id,
							model,
							error: chunk.error?.message ?? "Unknown error",
							errorCode: chunk.error?.code,
						},
						"Agent run error"
					);
					break;

				case "RUN_FINISHED":
					if (accumulatedContent) {
						lastAssistantContent = accumulatedContent;
						accumulatedContent = "";
					}
					log.info(
						{
							threadId: thread.id,
							model,
							finishReason: chunk.finishReason,
							hasUsage: !!chunk.usage,
							promptTokens: chunk.usage?.promptTokens,
							completionTokens: chunk.usage?.completionTokens,
						},
						"Agent run finished"
					);
					break;
			}

			yield chunk;
		}

		log.info(
			{ threadId: thread.id, model, chunkCount, lastChunkType },
			"Agent stream ended normally"
		);
	} catch (err) {
		log.error(
			{ threadId: thread.id, model, chunkCount, lastChunkType, error: err instanceof Error ? err.message : String(err) },
			"Agent stream error"
		);
		throw err;
	} finally {
		clearTimeout(timeout);

		if (!thread.title && firstUserContent && lastAssistantContent) {
			generateConversationTitle(firstUserContent, lastAssistantContent, model).then((title) => {
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

			// Raw messages from the client (UIMessages from useChat).
			// Pass directly to chat() — it handles conversion internally and
			// needs the original UIMessage parts for client state extraction.
			const { messages } = body;

			// Convert to ModelMessages for DB persistence only
			const modelMessages = convertMessagesToModelMessages(messages);
			try {
				await agentRepository.update(thread.id, { messages: modelMessages });
			} catch (dbErr) {
				log.error({ dbErr, threadId: thread.id }, "Failed to persist client messages");
			}

			// First exchange? Extract user content for title generation
			const isFirstExchange =
				!thread.title && modelMessages.filter((m) => m.role === "user").length === 1;
			const firstUserContent = isFirstExchange
				? (modelMessages.find((m) => m.role === "user")?.content as string | null)
				: null;

			const { adapter, model } = await createAdapter();
			const contextStr = getContextStr(thread);
			const allTools = getAllDomainTools(thread);

			log.info({ threadId: thread.id, model }, "Starting streaming chat");

			const abortController = new AbortController();
			const timeout = setTimeout(() => abortController.abort(), 120_000);

			// chat() handles the full agent loop (tool calls, retries, etc.)
			// Pass raw messages — chat() calls convertMessagesToModelMessages internally
			const stream = chat({
				adapter,
				messages,
				systemPrompts: [AGENT_SYSTEM_PROMPT + contextStr],
				tools: allTools,
				agentLoopStrategy: maxIterations(10),
				abortController,
			});

			// Thin wrapper for logging and title generation only
			const wrapped = withSideEffects(stream, thread, firstUserContent, timeout, model);

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

	// Persist messages — called by the client after the agent finishes responding.
	// The client (useChat) is the source of truth for conversation state.
	// This endpoint captures the final state including the agent's response.
	.post(
		"/threads/:id/persist",
		async ({ params, body, set }) => {
			const thread = await agentRepository.findById(params.id);
			if (!thread) {
				set.status = 404;
				return { error: "Thread not found" };
			}

			const messages = convertMessagesToModelMessages(body.messages);
			await agentRepository.update(params.id, { messages });
			return { ok: true };
		},
		{
			detail: { tags: ["Agent"], summary: "Persist conversation state from client" },
			params: ThreadIdParam,
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
