import { record } from "@elysiajs/opentelemetry";
import { chat, toolDefinition, toStreamResponse } from "@tanstack/ai";
import { createOpenAI } from "@tanstack/ai-openai";
import { Elysia, t } from "elysia";
import logger from "logger";
import { z } from "zod";
import { gameServerService } from "../domains/game-servers/service";
import { systemInfoService } from "../domains/system-info/service";
import { config } from "../infra/config";

const log = logger.child({ module: "ai" });

const SYSTEM_PROMPT = `You are The Machine, the AI assistant for Superbloom - a homelab server running NixOS with K3s.

Your personality:
- Helpful and knowledgeable about the homelab infrastructure
- Concise but friendly responses
- You care about the system's health and the user's experience
- You warn about consequences before destructive actions

You have access to tools to:
- List, start, and stop Minecraft game servers
- Get system stats (CPU, memory, GPU, network)
- Get drive/storage information

When users ask about servers or system status, use your tools to get real data.
Always respond in natural language, never raw JSON.`;

// Tool definitions
const listServersDef = toolDefinition({
	name: "list_game_servers",
	description: "List all game servers with their current status",
	inputSchema: z.object({}),
});

const listServers = listServersDef.server(async () => {
	return record("tool.list_game_servers", () => {
		const servers = gameServerService.list();
		return servers.map((s) => ({
			name: s.name,
			status: s.status,
			modpack: s.modpack,
			port: s.port,
			memory: s.memory,
		}));
	});
});

const getServerDef = toolDefinition({
	name: "get_server",
	description: "Get details about a specific game server by name",
	inputSchema: z.object({
		name: z.string().describe("The server name"),
	}),
});

const getServer = getServerDef.server(async ({ name }) => {
	return record("tool.get_server", () => {
		const server = gameServerService.get(name);
		if (!server) {
			return { error: `Server '${name}' not found` };
		}
		return {
			name: server.name,
			status: server.status,
			modpack: server.modpack,
			port: server.port,
			memory: server.memory,
			createdBy: server.createdBy,
			createdAt: server.createdAt,
		};
	});
});

const startServerDef = toolDefinition({
	name: "start_server",
	description: "Start a game server by name. Use this when the user wants to start a server.",
	inputSchema: z.object({
		name: z.string().describe("The server name to start"),
	}),
});

const startServer = startServerDef.server(async ({ name }) => {
	return await record("tool.start_server", async () => {
		try {
			const server = await gameServerService.start(name);
			return {
				success: true,
				message: `Server '${name}' is starting`,
				status: server.status,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to start server",
			};
		}
	});
});

const stopServerDef = toolDefinition({
	name: "stop_server",
	description: "Stop a game server by name. Use this when the user wants to stop a server.",
	inputSchema: z.object({
		name: z.string().describe("The server name to stop"),
	}),
});

const stopServer = stopServerDef.server(async ({ name }) => {
	return await record("tool.stop_server", async () => {
		try {
			const server = await gameServerService.stop(name);
			return {
				success: true,
				message: `Server '${name}' is stopping`,
				status: server.status,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to stop server",
			};
		}
	});
});

const getSystemStatsDef = toolDefinition({
	name: "get_system_stats",
	description: "Get current system statistics including CPU, memory, GPU, network, and disk I/O",
	inputSchema: z.object({}),
});

const getSystemStats = getSystemStatsDef.server(async () => {
	return await record("tool.get_system_stats", async () => {
		const stats = await systemInfoService.getSystemStats();
		return {
			cpu: {
				usage: stats.cpu.usage,
				coreCount: stats.cpu.coreCount,
				model: stats.cpu.model,
			},
			memory: {
				used: stats.memory.used,
				total: stats.memory.total,
				usagePercent: stats.memory.usagePercent,
			},
			gpu: stats.gpu.available
				? {
						name: stats.gpu.name,
						usage: stats.gpu.usage,
						temperature: stats.gpu.temperature,
						memoryUsed: stats.gpu.memoryUsed,
						memoryTotal: stats.gpu.memoryTotal,
					}
				: { available: false },
			network: {
				downloadSpeed: stats.network.totalRxSpeed,
				uploadSpeed: stats.network.totalTxSpeed,
			},
			disk: {
				readSpeed: stats.disk.readSpeed,
				writeSpeed: stats.disk.writeSpeed,
			},
			uptime: stats.uptime.formatted,
		};
	});
});

const getDrivesDef = toolDefinition({
	name: "get_drives",
	description: "Get information about registered storage drives and their usage",
	inputSchema: z.object({}),
});

const getDrives = getDrivesDef.server(async () => {
	return await record("tool.get_drives", async () => {
		const drives = await systemInfoService.listDrivesWithStats();
		return drives.map((d) => ({
			label: d.label,
			path: d.path,
			mounted: d.mounted,
			used: d.used,
			total: d.total,
			usagePercent: d.usagePercent,
		}));
	});
});

const allTools = [listServers, getServer, startServer, stopServer, getSystemStats, getDrives];

// Request/response types for AI chat endpoint
const MessagePart = t.Object({
	type: t.String(),
	content: t.Optional(t.String()),
	text: t.Optional(t.String()),
	id: t.Optional(t.String()),
	name: t.Optional(t.String()),
	toolName: t.Optional(t.String()),
	toolCallId: t.Optional(t.String()),
	arguments: t.Optional(t.String()),
	state: t.Optional(t.String()),
});

const ChatMessage = t.Object({
	id: t.Optional(t.String()),
	role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("tool")]),
	content: t.Optional(t.Union([t.String(), t.Null()])),
	parts: t.Optional(t.Array(MessagePart)),
});

const ChatRequestBody = t.Object({
	messages: t.Array(ChatMessage),
});

const ErrorResponse = t.Object({
	error: t.String(),
});

export const aiRoutes = new Elysia({ prefix: "/ai" })
	.onError(({ code, error, request, body }) => {
		if (code === "VALIDATION") {
			log.error(
				{
					code,
					message: error.message,
					url: request.url,
					body: JSON.stringify(body).slice(0, 2000),
					// Log the validation error details
					all: JSON.stringify(error.all, null, 2),
				},
				"validation error in AI route"
			);
		}
	})
	.post(
		"/chat",
		async ({ body, set, _request }) => {
			log.debug({ body: JSON.stringify(body).slice(0, 1000) }, "received chat request body");
			if (!config.OPENROUTER_API_KEY) {
				log.error("OPENROUTER_API_KEY not configured");
				set.status = 500;
				return { error: "OPENROUTER_API_KEY not configured" };
			}

			log.info({ messageCount: body.messages.length }, "processing chat request");

			try {
				const adapter = createOpenAI(config.OPENROUTER_API_KEY, {
					baseURL: "https://openrouter.ai/api/v1",
				});

				// Build messages array with system prompt
				const messagesWithSystem = [
					{
						role: "user" as const,
						content: `[SYSTEM]\n${SYSTEM_PROMPT}\n[/SYSTEM]\n\nPlease acknowledge you understand these instructions.`,
					},
					{
						role: "assistant" as const,
						content: "I understand. I'm The Machine, ready to help manage your Superbloom homelab.",
					},
					...body.messages,
				];

				// Cast model for OpenRouter compatibility (supports non-OpenAI models)
				const stream = chat({
					adapter,
					messages: messagesWithSystem,
					model: config.AI_MODEL as string as (typeof adapter.models)[number],
					tools: allTools,
				});

				log.info({ model: config.AI_MODEL }, "streaming chat response");
				return toStreamResponse(stream);
			} catch (err) {
				log.error({ error: err }, "chat request failed");
				set.status = 500;
				return { error: err instanceof Error ? err.message : "Chat failed" };
			}
		},
		{
			body: ChatRequestBody,
			response: { 500: ErrorResponse },
			detail: { tags: ["AI"], summary: "Chat with The Machine AI assistant" },
		}
	);
