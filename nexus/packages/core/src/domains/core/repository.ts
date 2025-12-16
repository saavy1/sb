import { eq } from "drizzle-orm";
import { agentDb } from "../../infra/db";
import { type Setting, settings } from "../agent/schema";
import type { SettingKey } from "./types";

export const settingsRepository = {
	async get(key: SettingKey): Promise<string | null> {
		const results = await agentDb.select().from(settings).where(eq(settings.key, key));
		return results[0]?.value ?? null;
	},

	async getAll(): Promise<Record<string, string>> {
		const results = await agentDb.select().from(settings);
		return Object.fromEntries(results.map((r) => [r.key, r.value]));
	},

	async set(key: SettingKey, value: string): Promise<Setting> {
		const now = new Date();
		const results = await agentDb
			.insert(settings)
			.values({ key, value, updatedAt: now })
			.onConflictDoUpdate({
				target: settings.key,
				set: { value, updatedAt: now },
			})
			.returning();
		return results[0];
	},

	async delete(key: SettingKey): Promise<boolean> {
		const results = await agentDb.delete(settings).where(eq(settings.key, key)).returning();
		return results.length > 0;
	},
};
