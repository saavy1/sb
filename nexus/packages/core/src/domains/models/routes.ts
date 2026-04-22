import { Elysia, t } from "elysia";
import {
	create,
	downloadWeights,
	get,
	importSparkArena,
	list,
	remove,
	searchHuggingFace,
	start,
	stop,
	syncStatus,
	update,
} from "./functions";
import {
	ApiError,
	CreateModelRequest,
	HfSearchQuery,
	HfSearchResult,
	ModelNameParam,
	ModelResponse,
	ModelWithLiveStatus,
	SparkArenaImportRequest,
	SparkArenaImportResponse,
	UpdateModelRequest,
} from "./types";

export const modelRoutes = new Elysia({ prefix: "/models" })
	// === Collection ===
	.get(
		"/",
		async () => list(),
		{
			detail: { tags: ["Models"], summary: "List all managed models" },
			response: { 200: t.Array(ModelResponse) },
		}
	)
	.post(
		"/",
		async ({ body, set }) => {
			try {
				return await create(body);
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Failed to create model" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Create (and optionally download) a new model" },
			body: CreateModelRequest,
			response: { 200: ModelResponse, 400: ApiError },
		}
	)

	// === HuggingFace search (collection-level, before :name) ===
	.get(
		"/huggingface/search",
		async ({ query, set }) => {
			try {
				const limit = query.limit ? Number(query.limit) : 20;
				const results = await searchHuggingFace(query.q, {
					limit,
					pipeline: query.pipeline ?? "text-generation",
				});
				return results;
			} catch (e) {
				set.status = 502;
				return { error: e instanceof Error ? e.message : "HF search failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Search HuggingFace for models" },
			query: HfSearchQuery,
			response: { 200: t.Array(HfSearchResult), 502: ApiError },
		}
	)

	// === Spark-Arena import ===
	.post(
		"/import/spark-arena",
		async ({ body, set }) => {
			try {
				return await importSparkArena(body.source);
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Import failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Import a Spark-Arena recipe as a model config" },
			body: SparkArenaImportRequest,
			response: { 200: SparkArenaImportResponse, 400: ApiError },
		}
	)

	// === Single resource ===
	.get(
		"/:name",
		async ({ params, set }) => {
			const model = await get(params.name);
			if (!model) {
				set.status = 404;
				return { error: "Model not found" };
			}
			return model;
		},
		{
			detail: { tags: ["Models"], summary: "Get model by name (with live status)" },
			params: ModelNameParam,
			response: { 200: ModelWithLiveStatus, 404: ApiError },
		}
	)
	.patch(
		"/:name",
		async ({ params, body, set }) => {
			try {
				const model = await update(params.name, body);
				if (!model) {
					set.status = 404;
					return { error: "Model not found" };
				}
				return model;
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Update failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Update a model's config" },
			params: ModelNameParam,
			body: UpdateModelRequest,
			response: { 200: ModelResponse, 400: ApiError, 404: ApiError },
		}
	)
	.delete(
		"/:name",
		async ({ params, set }) => {
			try {
				await remove(params.name);
				return { success: true };
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Delete failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Delete a model and its InferenceService" },
			params: ModelNameParam,
			response: { 200: t.Object({ success: t.Boolean() }), 400: ApiError },
		}
	)

	// === Lifecycle actions ===
	.post(
		"/:name/download",
		async ({ params, set }) => {
			try {
				return await downloadWeights(params.name);
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Download failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Trigger the HuggingFace download Job" },
			params: ModelNameParam,
			response: { 200: ModelResponse, 400: ApiError },
		}
	)
	.post(
		"/:name/start",
		async ({ params, set }) => {
			try {
				return await start(params.name);
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Start failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Start the model (create/scale InferenceService)" },
			params: ModelNameParam,
			response: { 200: ModelResponse, 400: ApiError },
		}
	)
	.post(
		"/:name/stop",
		async ({ params, set }) => {
			try {
				return await stop(params.name);
			} catch (e) {
				set.status = 400;
				return { error: e instanceof Error ? e.message : "Stop failed" };
			}
		},
		{
			detail: { tags: ["Models"], summary: "Stop the model (scale InferenceService to 0)" },
			params: ModelNameParam,
			response: { 200: ModelResponse, 400: ApiError },
		}
	)
	.post(
		"/:name/sync",
		async ({ params, set }) => {
			const model = await syncStatus(params.name);
			if (!model) {
				set.status = 404;
				return { error: "Model not found" };
			}
			return model;
		},
		{
			detail: { tags: ["Models"], summary: "Reconcile the model's status from K8s" },
			params: ModelNameParam,
			response: { 200: ModelWithLiveStatus, 404: ApiError },
		}
	);
