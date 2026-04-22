import { desc, eq } from "drizzle-orm";
import { modelsDb } from "../../infra/db";
import { type Model, models, type NewModel } from "./schema";

export const modelRepository = {
	async findAll(): Promise<Model[]> {
		return modelsDb.select().from(models).orderBy(desc(models.updatedAt));
	},

	async findById(id: string): Promise<Model | undefined> {
		const rows = await modelsDb.select().from(models).where(eq(models.id, id));
		return rows[0];
	},

	async findByName(name: string): Promise<Model | undefined> {
		const rows = await modelsDb.select().from(models).where(eq(models.name, name));
		return rows[0];
	},

	async create(data: NewModel): Promise<Model> {
		const rows = await modelsDb.insert(models).values(data).returning();
		return rows[0];
	},

	async update(name: string, data: Partial<NewModel>): Promise<Model | undefined> {
		const rows = await modelsDb
			.update(models)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(models.name, name))
			.returning();
		return rows[0];
	},

	async updateStatus(
		name: string,
		status: Model["status"],
		extras: Partial<Pick<NewModel, "lastError" | "lastStartedAt" | "downloadJobName">> = {}
	): Promise<Model | undefined> {
		const rows = await modelsDb
			.update(models)
			.set({ status, updatedAt: new Date(), ...extras })
			.where(eq(models.name, name))
			.returning();
		return rows[0];
	},

	async delete(name: string): Promise<boolean> {
		const rows = await modelsDb.delete(models).where(eq(models.name, name)).returning();
		return rows.length > 0;
	},
};
