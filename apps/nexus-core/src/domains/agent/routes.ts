import { Elysia, t } from "elysia";
import logger from "logger";
import { getToolsByCategory, getToolSummary, toolRegistry } from "../../infra/tool-registry";
import { createThread, getThread, listThreads, processChat, sendMessage } from "./functions";
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

	// Send message to thread (non-streaming)
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

	// Chat endpoint - creates thread if needed, processes message
	// UI receives updates via WebSocket, not HTTP streaming
	.post(
		"/chat",
		async ({ body, query, set }) => {
			try {
				const threadIdInput = query.threadId || body.threadId;
				const { threadId, response } = await processChat(body.messages, threadIdInput);

				return {
					threadId,
					response,
				};
			} catch (err) {
				logger.error({ err }, "Agent chat failed");
				set.status = 500;
				return { error: err instanceof Error ? err.message : "Chat failed" };
			}
		},
		{
			detail: { tags: ["Agent"], summary: "Chat with agent (updates via WebSocket)" },
			query: t.Object({
				threadId: t.Optional(t.String()),
			}),
			body: ChatRequest,
			response: {
				200: t.Object({
					threadId: t.String(),
					response: t.String(),
				}),
				500: ApiError,
			},
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
