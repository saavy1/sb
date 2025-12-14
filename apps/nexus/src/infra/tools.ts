import { record } from "@elysiajs/opentelemetry";
import { toolDefinition } from "@tanstack/ai";
import type { z } from "zod";

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
		return await record(`tool.${config.name}`, async () => {
			return await fn(input);
		});
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
