import logger from "@nexus/logger";
import {
	chat,
	convertMessagesToModelMessages,
	maxIterations,
	toServerSentEventsResponse,
} from "@tanstack/ai";
import { Elysia, t } from "elysia";
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
import { recallForMessage } from "../memory/functions";
import { createStreamingMiddleware } from "./middleware";
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

			// Recall relevant memory context from the latest user message
			const lastUserMsg = modelMessages.filter((m) => m.role === "user").pop();
			const userText = lastUserMsg && typeof lastUserMsg.content === "string" ? lastUserMsg.content : "";
			const memoryStr = await recallForMessage(userText, thread.source, thread.context);

			log.info(
				{ threadId: thread.id, model, hasMemory: !!memoryStr, toolCount: allTools.length },
				"Starting streaming chat",
			);

			const abortController = new AbortController();
			const timeout = setTimeout(() => abortController.abort(), 120_000);

			const stream = chat({
				adapter,
				messages,
				systemPrompts: [AGENT_SYSTEM_PROMPT + contextStr + (memoryStr ?? "")],
				tools: allTools,
				agentLoopStrategy: maxIterations(10),
				abortController,
				middleware: [
					createStreamingMiddleware({
						threadId: thread.id,
						model,
						firstUserContent,
						hasTitle: !!thread.title,
						onEnd: () => clearTimeout(timeout),
					}),
				],
			});

			return toServerSentEventsResponse(stream, { abortController });
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
