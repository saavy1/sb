import { randomUUID } from "node:crypto";
import logger from "@nexus/logger";
import { z } from "zod";
import { tracedFetch } from "../../infra/telemetry";
import { toolDefinition } from "@tanstack/ai";
import { appRepository } from "./repository";
import type { App } from "./schema";
import type { AppStatusType, AppWithStatusType, StatusCacheEntryType } from "./types";

// === Module-level state ===

const statusCache = new Map<string, StatusCacheEntryType>();
const CACHE_TTL = 30000; // 30 seconds

// === Internal helpers ===

async function checkHealth(url: string): Promise<AppStatusType> {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 5000);

		const response = await tracedFetch(url, {
			method: "HEAD",
			signal: controller.signal,
		});

		clearTimeout(timeout);
		return response.ok ? "up" : "down";
	} catch (error) {
		logger.debug({ url, error }, "Health check failed");
		return "down";
	}
}

async function getStatus(app: App): Promise<AppStatusType> {
	if (!app.healthCheckUrl) return "unknown";

	const cached = statusCache.get(app.id);
	if (cached && Date.now() - cached.checkedAt < CACHE_TTL) {
		return cached.status;
	}

	const status = await checkHealth(app.healthCheckUrl);
	statusCache.set(app.id, { status, checkedAt: Date.now() });
	return status;
}

// === Exported functions ===

export async function list(): Promise<AppWithStatusType[]> {
	const apps = await appRepository.findAll();
	const appsWithStatus = await Promise.all(
		apps.map(async (app) => ({
			...app,
			status: await getStatus(app),
		}))
	);
	return appsWithStatus;
}

export async function get(id: string): Promise<AppWithStatusType | null> {
	const app = await appRepository.findById(id);
	if (!app) return null;
	return {
		...app,
		status: await getStatus(app),
	};
}

export async function findByName(name: string): Promise<AppWithStatusType | null> {
	const apps = await appRepository.findAll();
	const searchLower = name.toLowerCase();

	// Exact match first
	let found = apps.find((app) => app.name.toLowerCase() === searchLower);

	// Partial match if no exact match
	if (!found) {
		found = apps.find((app) => app.name.toLowerCase().includes(searchLower));
	}

	if (!found) return null;

	return {
		...found,
		status: await getStatus(found),
	};
}

export async function create(data: {
	name: string;
	url: string;
	icon?: string;
	category?: App["category"];
	healthCheckUrl?: string;
	description?: string;
	sortOrder?: number;
}): Promise<App> {
	const now = new Date();
	return appRepository.create({
		id: randomUUID().slice(0, 8),
		name: data.name,
		url: data.url,
		icon: data.icon ?? null,
		category: data.category ?? "other",
		healthCheckUrl: data.healthCheckUrl ?? null,
		description: data.description ?? null,
		sortOrder: data.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now,
	});
}

export async function update(
	id: string,
	data: Partial<{
		name: string;
		url: string;
		icon: string | null;
		category: App["category"];
		healthCheckUrl: string | null;
		description: string | null;
		sortOrder: number;
	}>
): Promise<App | null> {
	statusCache.delete(id);
	return (await appRepository.update(id, data)) ?? null;
}

export async function deleteApp(id: string): Promise<boolean> {
	statusCache.delete(id);
	return appRepository.delete(id);
}

export async function refreshStatus(id: string): Promise<AppStatusType> {
	const app = await appRepository.findById(id);
	if (!app || !app.healthCheckUrl) return "unknown";

	statusCache.delete(id);
	return getStatus(app);
}

// === AI Tool-exposed functions ===
// These tools manage the dashboard bookmark registry — NOT for cluster operations.
// For service health, deployments, rollouts etc. use ArgoCD/k8s/Grafana tools instead.

export const getAppUrlTool = toolDefinition({
		name: "get_app_url",
		description:
			"Look up the dashboard URL for a registered app by name. This is a bookmark registry for the Nexus dashboard — it only knows about apps that have been explicitly registered. Use ONLY when the user asks for a URL like 'what's the jellyfin url' or 'how do I access grafana'. Do NOT use this for cluster operations, deployments, or service status — use ArgoCD/k8s tools for those.",
		inputSchema: z.object({
			name: z
				.string()
				.describe("The app name to search for (case-insensitive, partial match supported)"),
		}),
	}).server(async ({ name }) => {
		const app = await findByName(name);
		if (!app) {
			return { error: `No app found matching '${name}' in the dashboard registry` };
		}
		return {
			name: app.name,
			url: app.url,
			category: app.category,
			description: app.description,
		};
	}
);

export const addAppTool = toolDefinition({
		name: "add_app",
		description:
			"Add a bookmark to the Nexus dashboard. Use when the user wants to register a new app URL for the dashboard homepage.",
		inputSchema: z.object({
			name: z.string().describe("The app name (e.g., 'Jellyfin', 'Grafana')"),
			url: z.string().describe("The app URL"),
			category: z
				.enum(["media", "tools", "monitoring", "development", "other"])
				.optional()
				.describe("App category for organization"),
			description: z.string().optional().describe("Brief description of what the app does"),
		}),
	}).server(async ({ name, url, category, description }) => {
		const app = await create({
			name,
			url,
			category,
			description,
		});
		return {
			success: true,
			message: `Added '${app.name}' at ${app.url} to the dashboard`,
			id: app.id,
		};
	}
);

export const deleteAppTool = toolDefinition({
		name: "delete_app",
		description:
			"Remove a bookmark from the Nexus dashboard. Use when the user wants to remove an app from the dashboard homepage.",
		inputSchema: z.object({
			name: z.string().describe("The app name to remove from the dashboard"),
		}),
	}).server(async ({ name }) => {
		const app = await findByName(name);
		if (!app) {
			return { success: false, error: `No app found matching '${name}' in the dashboard registry` };
		}
		await deleteApp(app.id);
		return {
			success: true,
			message: `Removed '${app.name}' from the dashboard`,
		};
	}
);

export const appTools = [
	getAppUrlTool,
	addAppTool,
	deleteAppTool,
];
