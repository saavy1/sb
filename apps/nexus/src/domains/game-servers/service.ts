import logger from "logger";
import { config } from "../../infra/config";
import { generateMinecraftManifests, k8sAdapter } from "./k8s-adapter";
import { gameServerRepository } from "./repository";
import type { CreateServerRequestType, GameServerType } from "./types";

const log = logger.child({ module: "game-servers" });

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function allocatePort(): number {
	// Simple port allocation - in production, track used ports
	const base = 30000;
	const existing = gameServerRepository.findAll();
	const usedPorts = new Set(existing.map((s) => s.port).filter(Boolean));

	for (let port = base; port < base + 1000; port++) {
		if (!usedPorts.has(port)) return port;
	}
	throw new Error("No available ports");
}

export const gameServerService = {
	list(): GameServerType[] {
		return gameServerRepository.findAll();
	},

	get(name: string): GameServerType | null {
		return gameServerRepository.findByName(name);
	},

	async create(request: CreateServerRequestType): Promise<GameServerType> {
		log.info(
			{
				name: request.name,
				modpack: request.modpack,
				createdBy: request.createdBy,
			},
			"creating game server"
		);

		// Check if server already exists
		const existing = gameServerRepository.findByName(request.name);
		if (existing) {
			log.warn({ name: request.name }, "server already exists");
			throw new Error(`Server '${request.name}' already exists`);
		}

		const id = generateId();
		const port = allocatePort();
		const memory = request.memory || config.MC_DEFAULT_MEMORY;

		log.info({ id, port, memory }, "allocated resources for server");

		// Create in database first
		const server = gameServerRepository.create({
			id,
			name: request.name,
			modpack: request.modpack,
			createdBy: request.createdBy,
			memory,
		});

		// Generate and apply K8s manifests
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
			await k8sAdapter.applyManifests(manifests);
			gameServerRepository.updateK8sDeployment(request.name, request.name);
			gameServerRepository.updateStatus(request.name, "stopped", port);
			log.info({ name: request.name, port }, "game server created successfully");
		} catch (error) {
			log.error({ error, name: request.name }, "failed to apply k8s manifests, rolling back");
			// Rollback database entry on K8s failure
			gameServerRepository.delete(request.name);
			throw error;
		}

		return { ...server, port, status: "stopped" };
	},

	async start(name: string): Promise<GameServerType> {
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
			await k8sAdapter.scaleDeployment(name, 1);
			gameServerRepository.updateStatus(name, "running", server.port);
			log.info({ name }, "game server started");
			return { ...server, status: "running" };
		} catch (error) {
			log.error({ error, name }, "failed to start server");
			gameServerRepository.updateStatus(name, "error", server.port);
			throw error;
		}
	},

	async stop(name: string): Promise<GameServerType> {
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
			await k8sAdapter.scaleDeployment(name, 0);
			gameServerRepository.updateStatus(name, "stopped", server.port);
			log.info({ name }, "game server stopped");
			return { ...server, status: "stopped" };
		} catch (error) {
			log.error({ error, name }, "failed to stop server");
			gameServerRepository.updateStatus(name, "error", server.port);
			throw error;
		}
	},

	async delete(name: string): Promise<void> {
		log.info({ name }, "deleting game server");

		const server = gameServerRepository.findByName(name);
		if (!server) {
			log.warn({ name }, "server not found");
			throw new Error(`Server '${name}' not found`);
		}

		// Stop first if running
		if (server.status === "running") {
			log.info({ name }, "stopping running server before deletion");
			await k8sAdapter.scaleDeployment(name, 0);
		}

		// Delete K8s resources
		log.info({ name }, "deleting k8s resources");
		await k8sAdapter.deleteResources(name);

		// Delete from database
		gameServerRepository.delete(name);
		log.info({ name }, "game server deleted");
	},

	async syncStatus(name: string): Promise<GameServerType | null> {
		const server = gameServerRepository.findByName(name);
		if (!server) return null;

		const k8sStatus = await k8sAdapter.getDeploymentStatus(name);
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
	},
};
