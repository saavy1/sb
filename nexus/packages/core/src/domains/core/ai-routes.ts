import { Elysia, t } from "elysia";
import type { AiProvider } from "../agent/schema";
import { providerRepository, modelRepository } from "./ai-registry";
import {
	AiProviderSchema,
	AiModelSchema,
	CreateProviderBody,
	UpdateProviderBody,
	CreateModelBody,
	UpdateModelBody,
	ApiError,
} from "./types";

/** Map a DB provider row to the API schema (never expose raw apiKey). */
function toProviderResponse(p: AiProvider) {
	return {
		id: p.id,
		name: p.name,
		type: p.type as "openrouter" | "openai-compatible",
		baseUrl: p.baseUrl,
		hasApiKey: !!p.apiKey,
		enabled: p.enabled === 1,
		createdAt: p.createdAt.toISOString(),
		updatedAt: p.updatedAt.toISOString(),
	};
}

function toModelResponse(m: { id: string; providerId: string; modelId: string; name: string; enabled: number; createdAt: Date; updatedAt: Date }) {
	return {
		id: m.id,
		providerId: m.providerId,
		modelId: m.modelId,
		name: m.name,
		enabled: m.enabled === 1,
		createdAt: m.createdAt.toISOString(),
		updatedAt: m.updatedAt.toISOString(),
	};
}

// === Provider routes ===

const providerRoutes = new Elysia({ prefix: "/providers" })
	.get(
		"/",
		async () => {
			const providers = await providerRepository.list();
			return providers.map(toProviderResponse);
		},
		{
			detail: { tags: ["AI"], summary: "List all AI providers" },
			response: { 200: t.Array(AiProviderSchema) },
		}
	)
	.get(
		"/:id",
		async ({ params, set }) => {
			const provider = await providerRepository.get(params.id);
			if (!provider) {
				set.status = 404;
				return { error: "Provider not found" };
			}
			return toProviderResponse(provider);
		},
		{
			detail: { tags: ["AI"], summary: "Get AI provider by ID" },
			response: { 200: AiProviderSchema, 404: ApiError },
		}
	)
	.post(
		"/",
		async ({ body, set }) => {
			const existing = await providerRepository.get(body.id);
			if (existing) {
				set.status = 409;
				return { error: `Provider "${body.id}" already exists` };
			}
			const provider = await providerRepository.create({
				id: body.id,
				name: body.name,
				type: body.type,
				baseUrl: body.baseUrl ?? null,
				apiKey: body.apiKey ?? null,
			});
			set.status = 201;
			return toProviderResponse(provider);
		},
		{
			detail: { tags: ["AI"], summary: "Create AI provider" },
			body: CreateProviderBody,
			response: { 201: AiProviderSchema, 409: ApiError },
		}
	)
	.patch(
		"/:id",
		async ({ params, body, set }) => {
			const updates: Parameters<typeof providerRepository.update>[1] = {};
			if (body.name !== undefined) updates.name = body.name;
			if (body.baseUrl !== undefined) updates.baseUrl = body.baseUrl;
			if (body.apiKey !== undefined) updates.apiKey = body.apiKey;
			if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

			const provider = await providerRepository.update(params.id, updates);
			if (!provider) {
				set.status = 404;
				return { error: "Provider not found" };
			}
			return toProviderResponse(provider);
		},
		{
			detail: { tags: ["AI"], summary: "Update AI provider" },
			body: UpdateProviderBody,
			response: { 200: AiProviderSchema, 404: ApiError },
		}
	)
	.delete(
		"/:id",
		async ({ params, set }) => {
			const deleted = await providerRepository.delete(params.id);
			if (!deleted) {
				set.status = 404;
				return { error: "Provider not found" };
			}
			return { success: true };
		},
		{
			detail: { tags: ["AI"], summary: "Delete AI provider" },
			response: { 200: t.Object({ success: t.Boolean() }), 404: ApiError },
		}
	);

// === Model routes ===

const modelRoutes = new Elysia({ prefix: "/models" })
	.get(
		"/",
		async ({ query }) => {
			const models = query.providerId
				? await modelRepository.listByProvider(query.providerId)
				: await modelRepository.list();
			return models.map(toModelResponse);
		},
		{
			detail: { tags: ["AI"], summary: "List all AI models" },
			query: t.Object({ providerId: t.Optional(t.String()) }),
			response: { 200: t.Array(AiModelSchema) },
		}
	)
	.get(
		"/:id",
		async ({ params, set }) => {
			const model = await modelRepository.get(params.id);
			if (!model) {
				set.status = 404;
				return { error: "Model not found" };
			}
			return toModelResponse(model);
		},
		{
			detail: { tags: ["AI"], summary: "Get AI model by ID" },
			response: { 200: AiModelSchema, 404: ApiError },
		}
	)
	.post(
		"/",
		async ({ body, set }) => {
			// Verify provider exists
			const provider = await providerRepository.get(body.providerId);
			if (!provider) {
				set.status = 400;
				return { error: `Provider "${body.providerId}" not found` };
			}

			const id = `${body.providerId}:${body.modelId}`;
			const existing = await modelRepository.get(id);
			if (existing) {
				set.status = 409;
				return { error: `Model "${id}" already exists` };
			}

			const model = await modelRepository.create({
				id,
				providerId: body.providerId,
				modelId: body.modelId,
				name: body.name,
			});
			set.status = 201;
			return toModelResponse(model);
		},
		{
			detail: { tags: ["AI"], summary: "Add AI model" },
			body: CreateModelBody,
			response: { 201: AiModelSchema, 400: ApiError, 409: ApiError },
		}
	)
	.patch(
		"/:id",
		async ({ params, body, set }) => {
			const updates: Parameters<typeof modelRepository.update>[1] = {};
			if (body.name !== undefined) updates.name = body.name;
			if (body.modelId !== undefined) updates.modelId = body.modelId;
			if (body.enabled !== undefined) updates.enabled = body.enabled ? 1 : 0;

			const model = await modelRepository.update(params.id, updates);
			if (!model) {
				set.status = 404;
				return { error: "Model not found" };
			}
			return toModelResponse(model);
		},
		{
			detail: { tags: ["AI"], summary: "Update AI model" },
			body: UpdateModelBody,
			response: { 200: AiModelSchema, 404: ApiError },
		}
	)
	.delete(
		"/:id",
		async ({ params, set }) => {
			const deleted = await modelRepository.delete(params.id);
			if (!deleted) {
				set.status = 404;
				return { error: "Model not found" };
			}
			return { success: true };
		},
		{
			detail: { tags: ["AI"], summary: "Delete AI model" },
			response: { 200: t.Object({ success: t.Boolean() }), 404: ApiError },
		}
	);

// === Combined AI routes ===

export const aiRoutes = new Elysia({ prefix: "/ai" })
	.use(providerRoutes)
	.use(modelRoutes);
