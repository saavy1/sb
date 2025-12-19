import { AsyncLocalStorage } from "node:async_hooks";
import { record } from "@elysiajs/opentelemetry";
import logger from "@nexus/logger";
import { toolDefinition } from "@tanstack/ai";
import type { z } from "zod";
import { appEvents } from "./events";

const log = logger.child({ module: "tools" });

/**
 * Summarize a tool result for logging.
 * Truncates large results and extracts key info.
 */
function summarizeResult(result: unknown): unknown {
	if (result === null || result === undefined) return result;
	if (typeof result === "string") {
		return result.length > 200 ? `${result.slice(0, 200)}...` : result;
	}
	if (typeof result !== "object") return result;

	// For objects, extract key fields and truncate
	const obj = result as Record<string, unknown>;

	// Common patterns: success/error responses
	if ("success" in obj) {
		const summary: Record<string, unknown> = { success: obj.success };
		if ("error" in obj) summary.error = obj.error;
		if ("message" in obj) summary.message = obj.message;
		if ("status" in obj) summary.status = obj.status; // media status (available, unknown, etc.)
		if ("name" in obj) summary.name = obj.name; // TV show name
		if ("title" in obj) summary.title = obj.title; // Movie title
		if ("count" in obj) summary.count = obj.count;
		if ("totalSeasons" in obj) summary.totalSeasons = obj.totalSeasons;
		if ("results" in obj && Array.isArray(obj.results)) {
			summary.resultCount = obj.results.length;
		}
		return summary;
	}

	// For arrays, show count
	if (Array.isArray(result)) {
		return { arrayLength: result.length };
	}

	// Default: stringify and truncate
	const str = JSON.stringify(result);
	return str.length > 300 ? `${str.slice(0, 300)}...` : result;
}

// AsyncLocalStorage for passing thread context through tool calls
type ToolContext = { threadId: string; model?: string };
const toolContextStorage = new AsyncLocalStorage<ToolContext>();

/**
 * Run a function with tool context available to all tool calls within.
 */
export function runWithToolContext<T>(
	threadId: string,
	fn: () => T | Promise<T>,
	options?: { model?: string }
): T | Promise<T> {
	return toolContextStorage.run({ threadId, model: options?.model }, fn);
}

type ToolConfig<I extends z.ZodType> = {
	name: string;
	description: string;
	input: I;
};

type WithToolFn<I extends z.ZodType, O> = ((input: z.infer<I>) => O | Promise<O>) & {
	tool: ReturnType<ReturnType<typeof toolDefinition>["server"]>;
};

/**
 * Wraps a function with tool metadata, making it both callable and exposable to AI.
 *
 * @example
 * const getServers = withTool({
 *   name: "list_game_servers",
 *   description: "List all game servers",
 *   input: z.object({}),
 * }, () => db.select()...);
 *
 * // Call directly
 * getServers();
 *
 * // Access tool for AI
 * getServers.tool;
 */
export function withTool<I extends z.ZodType, O>(
	config: ToolConfig<I>,
	fn: (input: z.infer<I>) => O | Promise<O>
): WithToolFn<I, O> {
	const wrapped = ((input: z.infer<I>) => fn(input)) as WithToolFn<I, O>;

	wrapped.tool = toolDefinition({
		name: config.name,
		description: config.description,
		inputSchema: config.input,
	}).server(async (input: z.infer<I>) => {
		const ctx = toolContextStorage.getStore();
		const startTime = Date.now();

		// Log tool call start
		log.info(
			{ tool: config.name, args: input, threadId: ctx?.threadId, model: ctx?.model },
			`Tool call: ${config.name}`
		);

		// Emit tool call start event
		if (ctx?.threadId) {
			appEvents.emit("thread:tool-call", {
				threadId: ctx.threadId,
				toolName: config.name,
				args: input as Record<string, unknown>,
				status: "calling",
			});
		}

		try {
			const result = await record(`tool.${config.name}`, async () => {
				return await fn(input);
			});

			const duration = Date.now() - startTime;
			const resultSummary = summarizeResult(result);

			// Log tool call complete (include args for debugging tool usage patterns)
			log.info(
				{ tool: config.name, args: input, duration, result: resultSummary, threadId: ctx?.threadId, model: ctx?.model },
				`Tool complete: ${config.name} (${duration}ms)`
			);

			// Emit tool call complete event
			if (ctx?.threadId) {
				appEvents.emit("thread:tool-call", {
					threadId: ctx.threadId,
					toolName: config.name,
					status: "complete",
					result: typeof result === "string" ? result : JSON.stringify(result),
				});
			}

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;

			// Log tool call error (include args for debugging)
			log.error(
				{ tool: config.name, args: input, duration, error, threadId: ctx?.threadId, model: ctx?.model },
				`Tool error: ${config.name} - ${error instanceof Error ? error.message : "Unknown error"}`
			);

			// Emit tool call error event
			if (ctx?.threadId) {
				appEvents.emit("thread:tool-call", {
					threadId: ctx.threadId,
					toolName: config.name,
					status: "error",
					result: error instanceof Error ? error.message : "Unknown error",
				});
			}
			throw error;
		}
	});

	return wrapped;
}

/**
 * Collects all tools from an object of withTool-wrapped functions.
 *
 * @example
 * import * as fns from "./functions";
 * export const tools = collectTools(fns);
 */
export function collectTools(fns: Record<string, unknown>) {
	return Object.values(fns)
		.filter((fn): fn is WithToolFn<z.ZodType, unknown> => typeof fn === "function" && "tool" in fn)
		.map((fn) => fn.tool);
}
