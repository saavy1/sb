import { eq } from "drizzle-orm";
import { agentDb } from "../../infra/db";
import {
	type AiModel,
	type AiProvider,
	aiModels,
	aiProviders,
	type NewAiModel,
	type NewAiProvider,
} from "../agent/schema";

// === Provider repository ===

export const providerRepository = {
	async list(): Promise<AiProvider[]> {
		return agentDb.select().from(aiProviders);
	},

	async listEnabled(): Promise<AiProvider[]> {
		return agentDb.select().from(aiProviders).where(eq(aiProviders.enabled, 1));
	},

	async get(id: string): Promise<AiProvider | null> {
		const results = await agentDb.select().from(aiProviders).where(eq(aiProviders.id, id));
		return results[0] ?? null;
	},

	async create(data: NewAiProvider): Promise<AiProvider> {
		const results = await agentDb.insert(aiProviders).values(data).returning();
		return results[0];
	},

	async update(
		id: string,
		data: Partial<Pick<AiProvider, "name" | "baseUrl" | "apiKey" | "enabled">>
	): Promise<AiProvider | null> {
		const results = await agentDb
			.update(aiProviders)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(aiProviders.id, id))
			.returning();
		return results[0] ?? null;
	},

	async delete(id: string): Promise<boolean> {
		const results = await agentDb.delete(aiProviders).where(eq(aiProviders.id, id)).returning();
		return results.length > 0;
	},
};

// === Model repository ===

export const modelRepository = {
	async list(): Promise<AiModel[]> {
		return agentDb.select().from(aiModels);
	},

	async listEnabled(): Promise<AiModel[]> {
		return agentDb.select().from(aiModels).where(eq(aiModels.enabled, 1));
	},

	async listByProvider(providerId: string): Promise<AiModel[]> {
		return agentDb.select().from(aiModels).where(eq(aiModels.providerId, providerId));
	},

	async get(id: string): Promise<AiModel | null> {
		const results = await agentDb.select().from(aiModels).where(eq(aiModels.id, id));
		return results[0] ?? null;
	},

	async getWithProvider(id: string): Promise<{ model: AiModel; provider: AiProvider } | null> {
		const results = await agentDb
			.select()
			.from(aiModels)
			.innerJoin(aiProviders, eq(aiModels.providerId, aiProviders.id))
			.where(eq(aiModels.id, id));
		if (!results[0]) return null;
		return { model: results[0].ai_models, provider: results[0].ai_providers };
	},

	async create(data: NewAiModel): Promise<AiModel> {
		const results = await agentDb.insert(aiModels).values(data).returning();
		return results[0];
	},

	async update(
		id: string,
		data: Partial<Pick<AiModel, "name" | "modelId" | "enabled">>
	): Promise<AiModel | null> {
		const results = await agentDb
			.update(aiModels)
			.set({ ...data, updatedAt: new Date() })
			.where(eq(aiModels.id, id))
			.returning();
		return results[0] ?? null;
	},

	async delete(id: string): Promise<boolean> {
		const results = await agentDb.delete(aiModels).where(eq(aiModels.id, id)).returning();
		return results.length > 0;
	},
};
