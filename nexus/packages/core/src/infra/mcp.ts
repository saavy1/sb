/**
 * MCP (Model Context Protocol) client manager.
 *
 * Connects to configured MCP servers, discovers their tools via tools/list,
 * and wraps each as a TanStack AI ServerTool. Provider-agnostic — works with
 * OpenRouter, Ollama, or any adapter.
 */

import { Client } from "@modelcontextprotocol/sdk/client";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { toolDefinition } from "@tanstack/ai";
import type { JSONSchema, ServerTool } from "@tanstack/ai";
import logger from "@nexus/logger";
import { config } from "./config";

const log = logger.child({ module: "mcp" });

interface McpServerConfig {
	id: string;
	url: string;
}

interface ConnectedServer {
	id: string;
	client: Client;
	tools: ServerTool[];
}

function getMcpServerConfigs(): McpServerConfig[] {
	const servers: McpServerConfig[] = [];

	// Each token/credential acts as an enablement flag.
	// MCP servers handle their own backend auth — the agent just connects to the HTTP endpoint.
	if (config.MCP_GRAFANA_TOKEN) {
		servers.push({ id: "grafana", url: config.MCP_GRAFANA_URL });
	}

	if (config.MCP_GITHUB_TOKEN) {
		servers.push({ id: "github", url: config.MCP_GITHUB_URL });
	}

	return servers;
}

/**
 * Connect to an MCP server, trying Streamable HTTP first, then falling back to SSE.
 */
async function connectToServer(
	serverConfig: McpServerConfig,
): Promise<Client> {
	const client = new Client({
		name: "nexus-agent",
		version: "1.0.0",
	});

	const url = new URL(serverConfig.url);

	// Try Streamable HTTP first (newer protocol)
	try {
		const transport = new StreamableHTTPClientTransport(url);
		await client.connect(transport);
		log.info({ serverId: serverConfig.id }, "Connected via Streamable HTTP");
		return client;
	} catch {
		log.debug(
			{ serverId: serverConfig.id },
			"Streamable HTTP failed, trying SSE",
		);
	}

	// Fall back to SSE transport
	const sseTransport = new SSEClientTransport(url);
	await client.connect(sseTransport);
	log.info({ serverId: serverConfig.id }, "Connected via SSE");
	return client;
}

/**
 * Flatten MCP content array to a string for the LLM.
 */
function flattenContent(
	content: Array<{ type: string; text?: string; [key: string]: unknown }>,
): string {
	return content
		.map((c) => (c.type === "text" && c.text ? c.text : JSON.stringify(c)))
		.join("\n");
}

/**
 * Convert MCP tools from a server into TanStack AI ServerTool objects.
 */
function convertMcpTools(
	serverId: string,
	client: Client,
	mcpTools: Array<{
		name: string;
		description?: string;
		inputSchema?: unknown;
	}>,
): ServerTool[] {
	return mcpTools.map((mcpTool) => {
		const namespacedName = `${serverId}_${mcpTool.name}`;

		return toolDefinition({
			name: namespacedName,
			description:
				mcpTool.description || `${serverId} tool: ${mcpTool.name}`,
			inputSchema: (mcpTool.inputSchema ?? {
				type: "object",
			}) as JSONSchema,
		}).server(async (args: unknown) => {
			const result = await client.callTool({
				name: mcpTool.name,
				arguments: (args ?? {}) as Record<string, unknown>,
			});

			const content = result.content as Array<{
				type: string;
				text?: string;
				[key: string]: unknown;
			}>;

			if (result.isError) {
				return {
					success: false,
					error: content
						? flattenContent(content)
						: "MCP tool execution failed",
				};
			}

			return content ? flattenContent(content) : "";
		});
	});
}

class McpManager {
	private servers: ConnectedServer[] = [];
	private initialized = false;

	/**
	 * Connect to all configured MCP servers and discover their tools.
	 */
	async initialize(): Promise<void> {
		if (this.initialized) return;

		const configs = getMcpServerConfigs();
		if (configs.length === 0) {
			log.info("No MCP servers configured, skipping initialization");
			this.initialized = true;
			return;
		}

		log.info(
			{ servers: configs.map((c) => c.id) },
			"Initializing MCP connections",
		);

		// Connect to each server independently — failures don't block others
		const results = await Promise.allSettled(
			configs.map((serverConfig) => this.connectServer(serverConfig)),
		);

		for (let i = 0; i < results.length; i++) {
			const result = results[i];
			if (result.status === "rejected") {
				log.error(
					{ serverId: configs[i].id, error: result.reason },
					"Failed to connect to MCP server",
				);
			}
		}

		const totalTools = this.servers.reduce(
			(sum, s) => sum + s.tools.length,
			0,
		);
		log.info(
			{
				connected: this.servers.map((s) => s.id),
				totalTools,
			},
			"MCP initialization complete",
		);

		this.initialized = true;
	}

	private async connectServer(serverConfig: McpServerConfig): Promise<void> {
		const maxRetries = 3;
		let lastError: unknown;

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				const client = await connectToServer(serverConfig);

				const { tools: mcpTools } = await client.listTools();
				const tools = convertMcpTools(serverConfig.id, client, mcpTools);

				this.servers.push({ id: serverConfig.id, client, tools });

				log.info(
					{
						serverId: serverConfig.id,
						toolCount: tools.length,
						toolNames: tools.map((t) => t.name),
					},
					"MCP server connected and tools discovered",
				);
				return;
			} catch (err) {
				lastError = err;
				if (attempt < maxRetries) {
					const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
					log.warn(
						{ serverId: serverConfig.id, attempt, delay },
						"MCP connection failed, retrying",
					);
					await new Promise((resolve) => setTimeout(resolve, delay));
				}
			}
		}

		throw lastError;
	}

	/**
	 * Get all tools from all connected MCP servers as a flat array.
	 */
	getAllTools() {
		return this.servers.flatMap((s) => s.tools);
	}

	/**
	 * Get connection status for monitoring.
	 */
	getStatus() {
		return {
			initialized: this.initialized,
			servers: this.servers.map((s) => ({
				id: s.id,
				toolCount: s.tools.length,
			})),
		};
	}

	/**
	 * Gracefully close all MCP connections.
	 */
	async close(): Promise<void> {
		for (const server of this.servers) {
			try {
				await server.client.close();
				log.info({ serverId: server.id }, "MCP server disconnected");
			} catch (err) {
				log.warn(
					{ serverId: server.id, error: err },
					"Error closing MCP connection",
				);
			}
		}
		this.servers = [];
		this.initialized = false;
	}
}

export const mcpManager = new McpManager();
