import { randomUUID } from "node:crypto";
import logger from "logger";
import { appRepository } from "./repository";
import type { App } from "./schema";

type AppStatus = "up" | "down" | "unknown";

interface AppWithStatus extends App {
	status: AppStatus;
}

class AppService {
	private statusCache = new Map<string, { status: AppStatus; checkedAt: number }>();
	private readonly CACHE_TTL = 30000; // 30 seconds

	async list(): Promise<AppWithStatus[]> {
		const apps = await appRepository.findAll();
		const appsWithStatus = await Promise.all(
			apps.map(async (app) => ({
				...app,
				status: await this.getStatus(app),
			}))
		);
		return appsWithStatus;
	}

	async get(id: string): Promise<AppWithStatus | null> {
		const app = await appRepository.findById(id);
		if (!app) return null;
		return {
			...app,
			status: await this.getStatus(app),
		};
	}

	async create(data: {
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

	async update(
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
		// Clear cache when app is updated
		this.statusCache.delete(id);
		return (await appRepository.update(id, data)) ?? null;
	}

	async delete(id: string): Promise<boolean> {
		this.statusCache.delete(id);
		return appRepository.delete(id);
	}

	private async getStatus(app: App): Promise<AppStatus> {
		if (!app.healthCheckUrl) return "unknown";

		// Check cache
		const cached = this.statusCache.get(app.id);
		if (cached && Date.now() - cached.checkedAt < this.CACHE_TTL) {
			return cached.status;
		}

		// Perform health check
		const status = await this.checkHealth(app.healthCheckUrl);
		this.statusCache.set(app.id, { status, checkedAt: Date.now() });
		return status;
	}

	private async checkHealth(url: string): Promise<AppStatus> {
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

	async refreshStatus(id: string): Promise<AppStatus> {
		const app = await appRepository.findById(id);
		if (!app || !app.healthCheckUrl) return "unknown";

		this.statusCache.delete(id);
		return this.getStatus(app);
	}
}

export const appService = new AppService();
