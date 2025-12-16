import { AsyncLocalStorage } from "node:async_hooks";
import { record } from "@elysiajs/opentelemetry";
import { toolDefinition } from "@tanstack/ai";
import type { z } from "zod";
import { appEvents } from "./events";

// AsyncLocalStorage for passing thread context through tool calls
type ToolContext = { threadId: string };
const toolContextStorage = new AsyncLocalStorage<ToolContext>();

/**
 * Run a function with tool context available to all tool calls within.
 */
export function runWithToolContext<T>(threadId: string, fn: () => T | Promise<T>): T | Promise<T> {
	return toolContextStorage.run({ threadId }, fn);
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
