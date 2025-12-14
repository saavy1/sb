import { record } from "@elysiajs/opentelemetry";
import logger from "logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { withTool } from "../../infra/tools";
import { generateMinecraftManifests, k8sAdapter } from "./k8s-adapter";
import { gameServerRepository } from "./repository";
import type { CreateServerRequestType, GameServerType } from "./types";

const log = logger.child({ module: "game-servers" });

// === Internal helpers ===

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function allocatePort(): number {
	const base = 30000;
	const existing = gameServerRepository.findAll();
	const usedPorts = new Set(existing.map((s) => s.port).filter(Boolean));

	for (let port = base; port < base + 1000; port++) {
		if (!usedPorts.has(port)) return port;
	}
	throw new Error("No available ports");
}

// === Exported functions ===

export function list(): GameServerType[] {
	return gameServerRepository.findAll();
}

export function get(name: string): GameServerType | null {
	return gameServerRepository.findByName(name);
}

export async function create(request: CreateServerRequestType): Promise<GameServerType> {
	log.info(
		{
			name: request.name,
			modpack: request.modpack,
			createdBy: request.createdBy,
		},
		"creating game server"
	);

	const existing = gameServerRepository.findByName(request.name);
	if (existing) {
		log.warn({ name: request.name }, "server already exists");
		throw new Error(`Server '${request.name}' already exists`);
	}

	const id = generateId();
	const port = allocatePort();
	const memory = request.memory || config.MC_DEFAULT_MEMORY;

	log.info({ id, port, memory }, "allocated resources for server");

	const server = gameServerRepository.create({
		id,
		name: request.name,
		modpack: request.modpack,
		createdBy: request.createdBy,
		memory,
	});

	const manifests = generateMinecraftManifests({
		name: request.name,
		namespace: config.K8S_NAMESPACE,
		modpack: request.modpack,
		memory,
		port,
		cfApiKey: config.CURSEFORGE_API_KEY,
	});

	try {
		log.info({ name: request.name }, "applying k8s manifests");
		await record("k8s.applyManifests", () => k8sAdapter.applyManifests(manifests));
		gameServerRepository.updateK8sDeployment(request.name, request.name);
		gameServerRepository.updateStatus(request.name, "stopped", port);
		log.info({ name: request.name, port }, "game server created successfully");
	} catch (error) {
		log.error({ error, name: request.name }, "failed to apply k8s manifests, rolling back");
		gameServerRepository.delete(request.name);
		throw error;
	}

	return { ...server, port, status: "stopped" };
}

export async function start(name: string): Promise<GameServerType> {
	log.info({ name }, "starting game server");

	const server = gameServerRepository.findByName(name);
	if (!server) {
		log.warn({ name }, "server not found");
		throw new Error(`Server '${name}' not found`);
	}

	if (server.status === "running" || server.status === "starting") {
		log.warn({ name, status: server.status }, "server already running or starting");
		throw new Error(`Server '${name}' is already ${server.status}`);
	}

	gameServerRepository.updateStatus(name, "starting");

	try {
		await record("k8s.scaleDeployment", () => k8sAdapter.scaleDeployment(name, 1));
		gameServerRepository.updateStatus(name, "running", server.port);
		log.info({ name }, "game server started");
		return { ...server, status: "running" };
	} catch (error) {
		log.error({ error, name }, "failed to start server");
		gameServerRepository.updateStatus(name, "error", server.port);
		throw error;
	}
}

export async function stop(name: string): Promise<GameServerType> {
	log.info({ name }, "stopping game server");

	const server = gameServerRepository.findByName(name);
	if (!server) {
		log.warn({ name }, "server not found");
		throw new Error(`Server '${name}' not found`);
	}

	if (server.status === "stopped" || server.status === "stopping") {
		log.warn({ name, status: server.status }, "server already stopped or stopping");
		throw new Error(`Server '${name}' is already ${server.status}`);
	}

	gameServerRepository.updateStatus(name, "stopping");

	try {
		await record("k8s.scaleDeployment", () => k8sAdapter.scaleDeployment(name, 0));
		gameServerRepository.updateStatus(name, "stopped", server.port);
		log.info({ name }, "game server stopped");
		return { ...server, status: "stopped" };
	} catch (error) {
		log.error({ error, name }, "failed to stop server");
		gameServerRepository.updateStatus(name, "error", server.port);
		throw error;
	}
}

export async function deleteServer(name: string): Promise<void> {
	log.info({ name }, "deleting game server");

	const server = gameServerRepository.findByName(name);
	if (!server) {
		log.warn({ name }, "server not found");
		throw new Error(`Server '${name}' not found`);
	}

	if (server.status === "running") {
		log.info({ name }, "stopping running server before deletion");
		await record("k8s.scaleDeployment", () => k8sAdapter.scaleDeployment(name, 0));
	}

	log.info({ name }, "deleting k8s resources");
	await record("k8s.deleteResources", () => k8sAdapter.deleteResources(name));

	gameServerRepository.delete(name);
	log.info({ name }, "game server deleted");
}

export async function syncStatus(name: string): Promise<GameServerType | null> {
	const server = gameServerRepository.findByName(name);
	if (!server) return null;

	const k8sStatus = await record("k8s.getDeploymentStatus", () =>
		k8sAdapter.getDeploymentStatus(name)
	);
	if (!k8sStatus) return server;

	let newStatus = server.status;
	if (k8sStatus.replicas === 0) {
		newStatus = "stopped";
	} else if (k8sStatus.ready === k8sStatus.replicas) {
		newStatus = "running";
	} else {
		newStatus = "starting";
	}

	if (newStatus !== server.status) {
		log.info({ name, oldStatus: server.status, newStatus }, "syncing server status from k8s");
		gameServerRepository.updateStatus(name, newStatus, server.port);
	}

	return { ...server, status: newStatus };
}

// === AI Tool-exposed functions ===

export const listServersTool = withTool(
	{
		name: "list_game_servers",
		description: "List all game servers with their current status",
		input: z.object({}),
	},
	() => {
		const servers = list();
		return servers.map((s) => ({
			name: s.name,
			status: s.status,
			modpack: s.modpack,
			port: s.port,
			memory: s.memory,
		}));
	}
);

export const getServerTool = withTool(
	{
		name: "get_server",
		description: "Get details about a specific game server by name",
		input: z.object({
			name: z.string().describe("The server name"),
		}),
	},
	({ name }) => {
		const server = get(name);
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
	}
);

export const startServerTool = withTool(
	{
		name: "start_server",
		description: "Start a game server by name. Use this when the user wants to start a server.",
		input: z.object({
			name: z.string().describe("The server name to start"),
		}),
	},
	async ({ name }) => {
		try {
			const server = await start(name);
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
	}
);

export const stopServerTool = withTool(
	{
		name: "stop_server",
		description: "Stop a game server by name. Use this when the user wants to stop a server.",
		input: z.object({
			name: z.string().describe("The server name to stop"),
		}),
	},
	async ({ name }) => {
		try {
			const server = await stop(name);
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
	}
);

export const createServerTool = withTool(
	{
		name: "create_server",
		description:
			"Create a new Minecraft game server. Use when user wants to set up a new modded Minecraft server.",
		input: z.object({
			name: z
				.string()
				.regex(/^[a-z0-9-]+$/)
				.describe("Server name (lowercase, alphanumeric, hyphens only, e.g., 'atm-10', 'vanilla')"),
			modpack: z
				.string()
				.describe("CurseForge modpack slug or ID (e.g., 'all-the-mods-10', 'vanilla')"),
			memory: z
				.string()
				.optional()
				.describe("Memory allocation (e.g., '8G', '16G'). Defaults to 8G"),
		}),
	},
	async ({ name, modpack, memory }) => {
		try {
			const server = await create({
				name,
				modpack,
				memory,
				createdBy: "the-machine",
			});
			return {
				success: true,
				message: `Created server '${server.name}' with modpack '${modpack}'`,
				port: server.port,
				status: server.status,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to create server",
			};
		}
	}
);

export const deleteServerTool = withTool(
	{
		name: "delete_server",
		description:
			"Delete a Minecraft game server and all its resources. This is destructive and cannot be undone.",
		input: z.object({
			name: z.string().describe("The server name to delete"),
		}),
	},
	async ({ name }) => {
		try {
			await deleteServer(name);
			return {
				success: true,
				message: `Deleted server '${name}'`,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to delete server",
			};
		}
	}
);

export const gameServerTools = [
	listServersTool.tool,
	getServerTool.tool,
	startServerTool.tool,
	stopServerTool.tool,
	createServerTool.tool,
	deleteServerTool.tool,
];
