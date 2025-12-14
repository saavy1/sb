import { eq } from "drizzle-orm";
import { appsDb } from "../../infra/db";
import { type App, apps, type NewApp } from "./schema";

export const appRepository = {
	async findAll(): Promise<App[]> {
		return appsDb.select().from(apps).orderBy(apps.sortOrder, apps.name);
	},

	async findById(id: string): Promise<App | undefined> {
		const results = await appsDb.select().from(apps).where(eq(apps.id, id));
		return results[0];
	},

	async create(data: NewApp): Promise<App> {
		const results = await appsDb.insert(apps).values(data).returning();
		return results[0];
	},

	async update(id: string, data: Partial<NewApp>): Promise<App | undefined> {
		const now = new Date().toISOString();
		const results = await appsDb
			.update(apps)
			.set({ ...data, updatedAt: now })
			.where(eq(apps.id, id))
			.returning();
		return results[0];
	},

	async delete(id: string): Promise<boolean> {
		const results = await appsDb.delete(apps).where(eq(apps.id, id)).returning();
		return results.length > 0;
	},
};
