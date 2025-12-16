import { record } from "@elysiajs/opentelemetry";
import logger from "@nexus/logger";
import { ping as mcPing, type ServerStatus } from "@nexus/mc-monitor";
import { z } from "zod";
import { config } from "../../infra/config";
import { withTool } from "../../infra/tools";
import { getMcDefaultMemory, getMcDefaultStorage } from "../core/functions";
import { generateMinecraftManifests, k8sAdapter } from "./k8s-adapter";
import { gameServerRepository } from "./repository";
import type { CreateServerRequestType, GameServerType } from "./types";

const log = logger.child({ module: "game-servers" });

// === Internal helpers ===

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

// All servers share the LoadBalancer on port 25565
const MINECRAFT_PORT = 25565;

// === Exported functions ===

export async function list(): Promise<GameServerType[]> {
	return gameServerRepository.findAll();
}

export async function get(name: string): Promise<GameServerType | null> {
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

	const existing = await gameServerRepository.findByName(request.name);
	if (existing) {
		log.warn({ name: request.name }, "server already exists");
		throw new Error(`Server '${request.name}' already exists`);
	}

	const id = generateId();

	// Get defaults from settings (falls back to env vars)
	const defaultMemory = await getMcDefaultMemory();
	const defaultStorage = await getMcDefaultStorage();
	const memory = request.memory || defaultMemory;

	log.info({ id, memory, storage: defaultStorage }, "allocated resources for server");

	const server = await gameServerRepository.create({
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
		storage: defaultStorage,
		cfApiKey: config.CURSEFORGE_API_KEY,
	});

	try {
		log.info({ name: request.name }, "applying k8s manifests");
		await record("k8s.applyManifests", () => k8sAdapter.applyManifests(manifests));
		await gameServerRepository.updateK8sDeployment(request.name, request.name);
		await gameServerRepository.updateStatus(request.name, "stopped", MINECRAFT_PORT);
		log.info({ name: request.name, port: MINECRAFT_PORT }, "game server created successfully");
	} catch (error) {
		log.error({ error, name: request.name }, "failed to apply k8s manifests, rolling back");
		await gameServerRepository.delete(request.name);
		throw error;
	}

	return { ...server, port: MINECRAFT_PORT, status: "stopped" };
}

export async function start(name: string): Promise<GameServerType> {
	log.info({ name }, "starting game server");

	const server = await gameServerRepository.findByName(name);
	if (!server) {
		log.warn({ name }, "server not found");
		throw new Error(`Server '${name}' not found`);
	}

	if (server.status === "running" || server.status === "starting") {
		log.warn({ name, status: server.status }, "server already running or starting");
		throw new Error(`Server '${name}' is already ${server.status}`);
	}

	await gameServerRepository.updateStatus(name, "starting");

	try {
		await record("k8s.scaleDeployment", () => k8sAdapter.scaleDeployment(name, 1));
		await gameServerRepository.updateStatus(name, "running", server.port);
		log.info({ name }, "game server started");
		return { ...server, status: "running" };
	} catch (error) {
		log.error({ error, name }, "failed to start server");
		await gameServerRepository.updateStatus(name, "error", server.port);
		throw error;
	}
}

export async function stop(name: string): Promise<GameServerType> {
	log.info({ name }, "stopping game server");

	const server = await gameServerRepository.findByName(name);
	if (!server) {
		log.warn({ name }, "server not found");
		throw new Error(`Server '${name}' not found`);
	}

	if (server.status === "stopped" || server.status === "stopping") {
		log.warn({ name, status: server.status }, "server already stopped or stopping");
		throw new Error(`Server '${name}' is already ${server.status}`);
	}

	await gameServerRepository.updateStatus(name, "stopping");

	try {
		await record("k8s.scaleDeployment", () => k8sAdapter.scaleDeployment(name, 0));
		await gameServerRepository.updateStatus(name, "stopped", server.port);
		log.info({ name }, "game server stopped");
		return { ...server, status: "stopped" };
	} catch (error) {
		log.error({ error, name }, "failed to stop server");
		await gameServerRepository.updateStatus(name, "error", server.port);
		throw error;
	}
}

export async function deleteServer(name: string): Promise<void> {
	log.info({ name }, "deleting game server");

	const server = await gameServerRepository.findByName(name);
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

	await gameServerRepository.delete(name);
	log.info({ name }, "game server deleted");
}

export async function syncStatus(name: string): Promise<GameServerType | null> {
	const server = await gameServerRepository.findByName(name);
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
		await gameServerRepository.updateStatus(name, newStatus, server.port);
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
	async () => {
		const servers = await list();
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
	async ({ name }) => {
		const server = await get(name);
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

// === Minecraft Server Query Functions ===

// The LoadBalancer IP for Minecraft servers (shared across all servers on port 25565)
const MC_LOADBALANCER_HOST = config.MC_LOADBALANCER_HOST || "192.168.0.8";

/**
 * Query Minecraft server status via the Server List Ping protocol.
 * Uses the shared LoadBalancer - works when a single server is running.
 */
export async function queryServerStatus(
	host: string = MC_LOADBALANCER_HOST,
	port = MINECRAFT_PORT
): Promise<ServerStatus | null> {
	try {
		return await record("mc.ping", () => mcPing(host, port, { timeout: 5000 }));
	} catch (error) {
		log.debug({ error, host, port }, "Failed to query Minecraft server");
		return null;
	}
}

export const queryServerStatusTool = withTool(
	{
		name: "query_minecraft_status",
		description:
			"Query the Minecraft server for live status including player count, version, and MOTD. Use this to check if a server is actually running and how many players are online.",
		input: z.object({}),
	},
	async () => {
		const status = await queryServerStatus();
		if (!status) {
			return { online: false, error: "Server not responding or not running" };
		}
		return {
			online: true,
			version: status.version,
			players: {
				online: status.players.online,
				max: status.players.max,
				list: status.players.sample.map((p) => p.name),
			},
			motd: status.motd,
			latency: status.latency,
		};
	}
);

export const getPlayerCountTool = withTool(
	{
		name: "get_player_count",
		description:
			"Get the current player count on the Minecraft server. Quick way to check if anyone is playing.",
		input: z.object({}),
	},
	async () => {
		const status = await queryServerStatus();
		if (!status) {
			return { online: false, players: 0, max: 0 };
		}
		return {
			online: true,
			players: status.players.online,
			max: status.players.max,
		};
	}
);

// === K8s Pod Functions ===

export async function listGameServerPods() {
	const pods = await record("k8s.listPods", () =>
		k8sAdapter.listPods("app.kubernetes.io/component=minecraft")
	);
	return pods.map((pod) => ({
		name: pod.metadata.name,
		serverName: pod.metadata.labels?.app || "unknown",
		phase: pod.status?.phase || "Unknown",
		ready: pod.status?.containerStatuses?.every((c) => c.ready) ?? false,
		restarts: pod.status?.containerStatuses?.[0]?.restartCount ?? 0,
		podIP: pod.status?.podIP,
		startTime: pod.status?.startTime,
	}));
}

export const listPodsTool = withTool(
	{
		name: "list_game_server_pods",
		description:
			"List all Kubernetes pods for game servers. Shows pod status, readiness, restart count, and IP addresses. Use this to debug server issues or check pod health.",
		input: z.object({}),
	},
	async () => {
		try {
			const pods = await listGameServerPods();
			return {
				success: true,
				pods,
				count: pods.length,
			};
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : "Failed to list pods",
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
	queryServerStatusTool.tool,
	getPlayerCountTool.tool,
	listPodsTool.tool,
];
