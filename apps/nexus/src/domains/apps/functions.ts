import { randomUUID } from "node:crypto";
import logger from "logger";
import { z } from "zod";
import { withTool } from "../../infra/tools";
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

		const response = await fetch(url, {
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
	const now = new Date().toISOString();
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

export const listAppsTool = withTool(
	{
		name: "list_apps",
		description: "List all registered apps/services in the homelab with their URLs and status",
		input: z.object({}),
	},
	async () => {
		const apps = await list();
		return apps.map((app) => ({
			name: app.name,
			url: app.url,
			category: app.category,
			status: app.status,
			description: app.description,
		}));
	}
);

export const getAppUrlTool = withTool(
	{
		name: "get_app_url",
		description:
			"Get the URL for a specific app by name. Use this when the user asks things like 'what's the jellyfin url' or 'how do I access grafana'",
		input: z.object({
			name: z
				.string()
				.describe("The app name to search for (case-insensitive, partial match supported)"),
		}),
	},
	async ({ name }) => {
		const app = await findByName(name);
		if (!app) {
			return { error: `No app found matching '${name}'` };
		}
		return {
			name: app.name,
			url: app.url,
			status: app.status,
			description: app.description,
		};
	}
);

export const addAppTool = withTool(
	{
		name: "add_app",
		description:
			"Register a new app/service in the homelab. Use when user wants to add, register, or save an app URL.",
		input: z.object({
			name: z.string().describe("The app name (e.g., 'Jellyfin', 'Grafana')"),
			url: z.string().describe("The app URL"),
			category: z
				.enum(["media", "tools", "monitoring", "development", "other"])
				.optional()
				.describe("App category for organization"),
			description: z.string().optional().describe("Brief description of what the app does"),
			healthCheckUrl: z
				.string()
				.optional()
				.describe("URL to check if the app is up (defaults to main URL)"),
		}),
	},
	async ({ name, url, category, description, healthCheckUrl }) => {
		const app = await create({
			name,
			url,
			category,
			description,
			healthCheckUrl: healthCheckUrl ?? url,
		});
		return {
			success: true,
			message: `Added '${app.name}' at ${app.url}`,
			id: app.id,
		};
	}
);

export const deleteAppTool = withTool(
	{
		name: "delete_app",
		description:
			"Remove an app/service from the homelab registry. Use when user wants to delete or remove an app.",
		input: z.object({
			name: z.string().describe("The app name to delete"),
		}),
	},
	async ({ name }) => {
		const app = await findByName(name);
		if (!app) {
			return { success: false, error: `No app found matching '${name}'` };
		}
		await deleteApp(app.id);
		return {
			success: true,
			message: `Deleted '${app.name}'`,
		};
	}
);

export const appTools = [
	listAppsTool.tool,
	getAppUrlTool.tool,
	addAppTool.tool,
	deleteAppTool.tool,
];
