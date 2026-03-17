import logger from "@nexus/logger";
import type { ChatMiddleware, ModelMessage, StreamChunk } from "@tanstack/ai";
import { generateConversationTitle } from "../../infra/ai";
import { appEvents } from "../../infra/events";
import { agentRepository } from "./repository";

const log = logger.child({ module: "agent" });

/**
 * Log RUN_ERROR chunks from the adapter.
 * These bypass onError (which only fires for thrown exceptions),
 * so without this they'd reach the client with zero server-side logging.
 */
function logChunkError(threadId: string, model: string, chunk: StreamChunk) {
	if (chunk.type !== "RUN_ERROR") return;
	log.error(
		{
			threadId,
			model,
			error: chunk.error?.message ?? "Unknown provider error",
			errorCode: (chunk.error as Record<string, unknown>)?.code,
		},
		"Provider returned error"
	);
}

interface BaseOptions {
	threadId: string;
	model: string;
	firstUserContent: string | null;
	hasTitle: boolean;
	onEnd?: () => void;
}

/**
 * Captured results from the headless agent loop.
 * Populated by middleware hooks during streaming.
 */
export interface AgentLoopCapture {
	response: string;
	toolCallCount: number;
	usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
	messages: ReadonlyArray<ModelMessage>;
}

/**
 * Creates middleware for the SSE streaming chat endpoint.
 * Replaces withSideEffects — handles logging and title generation.
 */
export function createStreamingMiddleware({
	threadId,
	model,
	firstUserContent,
	hasTitle,
	onEnd,
}: BaseOptions): ChatMiddleware {
	return {
		name: "agent-streaming",

		onChunk(_ctx, chunk) {
			logChunkError(threadId, model, chunk);
		},

		onBeforeToolCall(_ctx, hookCtx) {
			log.info(
				{ threadId, toolName: hookCtx.toolName, toolCallId: hookCtx.toolCallId, model },
				"Tool call started"
			);
		},

		onAfterToolCall(_ctx, info) {
			log.info(
				{
					threadId,
					toolName: info.toolName,
					toolCallId: info.toolCallId,
					model,
					ok: info.ok,
					duration: info.duration,
				},
				info.ok ? "Tool call completed" : "Tool call failed"
			);
		},

		onUsage(_ctx, usage) {
			log.info({ threadId, model, ...usage }, "Agent run finished");
		},

		onFinish(_ctx, info) {
			log.info(
				{
					threadId,
					model,
					finishReason: info.finishReason,
					duration: info.duration,
				},
				"Agent stream ended normally"
			);

			onEnd?.();

			if (!hasTitle && firstUserContent && info.content) {
				generateConversationTitle(firstUserContent, info.content, model).then((title) => {
					if (title) {
						log.info({ threadId, title }, "Generated thread title");
						agentRepository.update(threadId, { title });
						appEvents.emit("thread:updated", { id: threadId, title });
					}
				});
			}
		},

		onError(_ctx, info) {
			log.error(
				{
					threadId,
					model,
					error: info.error instanceof Error ? info.error.message : String(info.error),
					duration: info.duration,
				},
				"Agent stream error"
			);
			onEnd?.();
		},

		onAbort(_ctx, info) {
			log.info(
				{ threadId, model, reason: info.reason, duration: info.duration },
				"Agent stream aborted"
			);
			onEnd?.();
		},
	};
}

/**
 * Creates middleware for the headless agent loop (workers, discord, alerts).
 * Handles logging and captures results for persistence by the caller.
 */
export function createHeadlessMiddleware({
	threadId,
	model,
	firstUserContent,
	hasTitle,
	onEnd,
	capture,
}: BaseOptions & { capture: AgentLoopCapture }): ChatMiddleware {
	return {
		name: "agent-headless",

		onChunk(_ctx, chunk) {
			logChunkError(threadId, model, chunk);
		},

		onBeforeToolCall(_ctx, hookCtx) {
			log.info(
				{ threadId, toolName: hookCtx.toolName, toolCallId: hookCtx.toolCallId, model },
				"Tool call started"
			);
		},

		onAfterToolCall(_ctx, info) {
			capture.toolCallCount++;
			log.info(
				{
					threadId,
					toolName: info.toolName,
					toolCallId: info.toolCallId,
					model,
					ok: info.ok,
					duration: info.duration,
				},
				info.ok ? "Tool call completed" : "Tool call failed"
			);
		},

		onUsage(_ctx, usage) {
			capture.usage = usage;
			log.info({ threadId, model, ...usage }, "Agent run finished");
		},

		onFinish(ctx, info) {
			capture.response = info.content;
			capture.messages = ctx.messages;

			log.info(
				{
					threadId,
					model,
					finishReason: info.finishReason,
					duration: info.duration,
					toolCallCount: capture.toolCallCount,
					...(info.usage && {
						promptTokens: info.usage.promptTokens,
						completionTokens: info.usage.completionTokens,
						totalTokens: info.usage.totalTokens,
					}),
				},
				"Agent loop completed"
			);

			onEnd?.();

			if (!hasTitle && firstUserContent && info.content) {
				generateConversationTitle(firstUserContent, info.content, model).then((title) => {
					if (title) {
						log.info({ threadId, title }, "Generated thread title");
						agentRepository.update(threadId, { title });
						appEvents.emit("thread:updated", { id: threadId, title });
					}
				});
			}
		},

		onError(_ctx, info) {
			log.error(
				{
					threadId,
					model,
					error: info.error instanceof Error ? info.error.message : String(info.error),
					duration: info.duration,
				},
				"Agent loop error"
			);
			onEnd?.();
		},

		onAbort(_ctx, info) {
			log.info(
				{ threadId, model, reason: info.reason, duration: info.duration },
				"Agent loop aborted"
			);
			onEnd?.();
		},
	};
}
