import { record } from "@elysiajs/opentelemetry";
import logger from "@nexus/logger";
import { toolDefinition } from "@tanstack/ai";
import { z } from "zod";
import { appEvents } from "../../infra/events";
import * as hf from "./huggingface";
import { kserveAdapter } from "./k8s-adapter";
import { modelRepository } from "./repository";
import * as sparkArena from "./spark-arena";
import type {
	CreateModelRequestType,
	ModelConfigType,
	ModelMetadataType,
	ModelResponseType,
	ModelStatusType,
	ModelWithLiveStatusType,
	SparkArenaImportResponseType,
	UpdateModelRequestType,
} from "./types";
import type { Model } from "./schema";

const log = logger.child({ module: "models" });

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function generateId(): string {
	return crypto.randomUUID().slice(0, 8);
}

function toResponse(m: Model): ModelResponseType {
	return {
		id: m.id,
		name: m.name,
		hfRepoId: m.hfRepoId,
		hfRevision: m.hfRevision,
		runtime: m.runtime,
		servedModelName: m.servedModelName,
		status: m.status as ModelStatusType,
		downloadJobName: m.downloadJobName,
		config: (m.config ?? {}) as ModelConfigType,
		metadata: (m.metadata ?? {}) as ModelMetadataType,
		sparkArenaSource: m.sparkArenaSource,
		lastError: m.lastError,
		createdBy: m.createdBy,
		createdAt: m.createdAt,
		updatedAt: m.updatedAt,
		lastStartedAt: m.lastStartedAt,
	};
}

async function emitStatus(name: string, status: ModelStatusType, lastError?: string | null) {
	appEvents.emit("model:status", { name, status, lastError: lastError ?? null });
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

export async function list(): Promise<ModelResponseType[]> {
	const rows = await modelRepository.findAll();
	return rows.map(toResponse);
}

export async function get(name: string): Promise<ModelWithLiveStatusType | null> {
	const row = await modelRepository.findByName(name);
	if (!row) return null;
	const live = await record("kserve.getLiveStatus", () =>
		kserveAdapter.getLiveStatus(name).catch((err) => {
			log.warn({ err, name }, "failed to fetch live status");
			return null;
		})
	);
	return { ...toResponse(row), live: live ?? undefined };
}

// ---------------------------------------------------------------------------
// Create / Update
// ---------------------------------------------------------------------------

export async function create(request: CreateModelRequestType): Promise<ModelResponseType> {
	log.info(
		{ name: request.name, hfRepoId: request.hfRepoId, createdBy: request.createdBy },
		"creating model"
	);

	const existing = await modelRepository.findByName(request.name);
	if (existing) throw new Error(`Model '${request.name}' already exists`);

	if (!hf.isValidRepoId(request.hfRepoId)) {
		throw new Error(`Invalid HuggingFace repo id: ${request.hfRepoId}`);
	}

	// Single-GPU GB10 defaults if the caller didn't supply. These match the
	// existing serving-runtime.yaml knobs and can be overridden per-model.
	const config: ModelConfigType = {
		tensorParallel: request.config?.tensorParallel ?? 1,
		gpuMemoryUtilization: request.config?.gpuMemoryUtilization ?? 0.9,
		maxModelLen: request.config?.maxModelLen,
		dtype: request.config?.dtype,
		toolCallParser: request.config?.toolCallParser,
		extraArgs: request.config?.extraArgs,
		env: request.config?.env,
	};
	for (const key of Object.keys(config) as (keyof ModelConfigType)[]) {
		if (config[key] === undefined) delete config[key];
	}

	const id = generateId();
	const row = await modelRepository.create({
		id,
		name: request.name,
		hfRepoId: request.hfRepoId,
		hfRevision: request.hfRevision ?? null,
		runtime: request.runtime ?? "vllm",
		servedModelName: request.servedModelName ?? request.name,
		status: "draft",
		downloadJobName: null,
		config,
		metadata: request.metadata ?? {},
		sparkArenaSource: request.sparkArenaSource ?? null,
		lastError: null,
		createdBy: request.createdBy,
	});

	if (request.autoDownload !== false) {
		// Fire-and-forget: kick off the download Job so the UI can move on.
		downloadWeights(row.name).catch((err) => {
			log.error({ err, name: row.name }, "auto-download failed to start");
		});
	}

	return toResponse(row);
}

export async function update(
	name: string,
	patch: UpdateModelRequestType
): Promise<ModelResponseType | null> {
	const row = await modelRepository.findByName(name);
	if (!row) return null;

	const mergedConfig: ModelConfigType = { ...(row.config as ModelConfigType), ...(patch.config ?? {}) };
	const mergedMetadata = { ...(row.metadata as ModelMetadataType), ...(patch.metadata ?? {}) };

	const updated = await modelRepository.update(name, {
		servedModelName:
			patch.servedModelName === undefined ? row.servedModelName : patch.servedModelName,
		config: mergedConfig,
		metadata: mergedMetadata,
	});

	// If the InferenceService already exists, reapply so the new config takes effect.
	if (updated && (await kserveAdapter.exists(name))) {
		try {
			await kserveAdapter.apply(updated);
		} catch (err) {
			log.error({ err, name }, "failed to reapply InferenceService after update");
		}
	}
	return updated ? toResponse(updated) : null;
}

// ---------------------------------------------------------------------------
// Download lifecycle
// ---------------------------------------------------------------------------

export async function downloadWeights(name: string): Promise<ModelResponseType> {
	const row = await modelRepository.findByName(name);
	if (!row) throw new Error(`Model '${name}' not found`);

	// If a prior Job is still tracked, clean it up so retries work.
	if (row.downloadJobName) {
		await record("kserve.deleteDownload", () => kserveAdapter.deleteDownload(row.downloadJobName!));
	}

	const jobName = await record("kserve.startDownload", () => kserveAdapter.startDownload(row));
	const updated = await modelRepository.updateStatus(name, "downloading", {
		downloadJobName: jobName,
		lastError: null,
	});
	emitStatus(name, "downloading");
	log.info({ name, jobName }, "download started");
	return toResponse(updated ?? row);
}

/**
 * Poll the download Job and fold its status into the model row.
 * Returns the post-sync model state.
 */
export async function syncDownload(name: string): Promise<ModelResponseType | null> {
	const row = await modelRepository.findByName(name);
	if (!row || !row.downloadJobName) return row ? toResponse(row) : null;

	const status = await kserveAdapter.getDownloadStatus(row.downloadJobName);
	if (!status) return toResponse(row);

	if (status.succeeded && status.succeeded > 0) {
		const updated = await modelRepository.updateStatus(name, "downloaded", { lastError: null });
		emitStatus(name, "downloaded");
		return toResponse(updated ?? row);
	}
	if (status.failed && status.failed > 0) {
		const msg = status.conditions?.find((c) => c.type === "Failed")?.message ?? "Download failed";
		const updated = await modelRepository.updateStatus(name, "error", { lastError: msg });
		emitStatus(name, "error", msg);
		return toResponse(updated ?? row);
	}
	return toResponse(row);
}

// ---------------------------------------------------------------------------
// Start / Stop / Delete
// ---------------------------------------------------------------------------

export async function start(name: string): Promise<ModelResponseType> {
	const row = await modelRepository.findByName(name);
	if (!row) throw new Error(`Model '${name}' not found`);
	if (row.status === "downloading") {
		throw new Error(`Model '${name}' is still downloading`);
	}

	await modelRepository.updateStatus(name, "starting", { lastError: null });
	emitStatus(name, "starting");

	try {
		if (await kserveAdapter.exists(name)) {
			await record("kserve.scale", () => kserveAdapter.scale(name, 1));
		} else {
			await record("kserve.apply", () => kserveAdapter.apply(row));
		}
		const updated = await modelRepository.updateStatus(name, "starting", {
			lastStartedAt: new Date(),
		});
		return toResponse(updated ?? row);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await modelRepository.updateStatus(name, "error", { lastError: msg });
		emitStatus(name, "error", msg);
		throw err;
	}
}

export async function stop(name: string): Promise<ModelResponseType> {
	const row = await modelRepository.findByName(name);
	if (!row) throw new Error(`Model '${name}' not found`);

	await modelRepository.updateStatus(name, "stopping");
	emitStatus(name, "stopping");

	try {
		await record("kserve.scale", () => kserveAdapter.scale(name, 0));
		const updated = await modelRepository.updateStatus(name, "stopped");
		emitStatus(name, "stopped");
		return toResponse(updated ?? row);
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		await modelRepository.updateStatus(name, "error", { lastError: msg });
		emitStatus(name, "error", msg);
		throw err;
	}
}

export async function remove(name: string): Promise<void> {
	const row = await modelRepository.findByName(name);
	if (!row) throw new Error(`Model '${name}' not found`);

	try {
		await record("kserve.remove", () => kserveAdapter.remove(name));
	} catch (err) {
		log.warn({ err, name }, "failed to delete InferenceService - continuing");
	}
	if (row.downloadJobName) {
		await record("kserve.deleteDownload", () =>
			kserveAdapter.deleteDownload(row.downloadJobName!)
		);
	}
	await modelRepository.delete(name);
	emitStatus(name, "stopped");
	log.info({ name }, "model deleted");
}

// ---------------------------------------------------------------------------
// Status reconciliation
// ---------------------------------------------------------------------------

/**
 * Reconcile the DB row with the live InferenceService state.
 * Should be called periodically (or on-demand from the UI) so the stored
 * status reflects what KServe actually believes.
 */
export async function syncStatus(name: string): Promise<ModelWithLiveStatusType | null> {
	const row = await modelRepository.findByName(name);
	if (!row) return null;

	// If we're in the middle of a download, keep the download sync path.
	if (row.status === "downloading" && row.downloadJobName) {
		await syncDownload(name);
	}

	const live = await kserveAdapter.getLiveStatus(name).catch((err) => {
		log.debug({ err, name }, "live status fetch failed");
		return null;
	});

	let newStatus: ModelStatusType | null = null;
	if (live === null) {
		// CR absent. If we're in any "on-cluster" state, reconcile down.
		if (["starting", "running"].includes(row.status)) newStatus = "stopped";
	} else if (live.ready) {
		newStatus = "running";
	} else if (row.status === "running") {
		// Was running, now not ready - reflect it.
		newStatus = "starting";
	}

	if (newStatus && newStatus !== row.status) {
		await modelRepository.updateStatus(name, newStatus);
		emitStatus(name, newStatus);
	}

	const after = await modelRepository.findByName(name);
	return after ? { ...toResponse(after), live: live ?? undefined } : null;
}

// ---------------------------------------------------------------------------
// HuggingFace + Spark-Arena
// ---------------------------------------------------------------------------

export const searchHuggingFace = hf.searchModels;
export const getHuggingFaceModel = hf.getModelInfo;

export async function importSparkArena(source: string): Promise<SparkArenaImportResponseType> {
	return sparkArena.importRecipe(source);
}

// ---------------------------------------------------------------------------
// AI Tools (exposed to The Machine via MCP)
// ---------------------------------------------------------------------------

export const listModelsTool = toolDefinition({
	name: "list_models",
	description:
		"List all KServe-managed models with their current status (draft/downloading/downloaded/starting/running/stopped/error).",
	inputSchema: z.object({}),
}).server(async () => {
	const rows = await list();
	return rows.map((m) => ({
		name: m.name,
		hfRepoId: m.hfRepoId,
		status: m.status,
		servedModelName: m.servedModelName,
	}));
});

export const startModelTool = toolDefinition({
	name: "start_model",
	description:
		"Start a KServe model by name. Creates or scales up its InferenceService. Requires the model to have been downloaded first.",
	inputSchema: z.object({
		name: z.string().describe("The model slug"),
	}),
}).server(async ({ name }) => {
	try {
		const model = await start(name);
		return { success: true, status: model.status, message: `Model '${name}' is starting` };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : "Failed to start" };
	}
});

export const stopModelTool = toolDefinition({
	name: "stop_model",
	description: "Stop a KServe model by scaling its InferenceService to 0 replicas.",
	inputSchema: z.object({
		name: z.string().describe("The model slug"),
	}),
}).server(async ({ name }) => {
	try {
		const model = await stop(name);
		return { success: true, status: model.status, message: `Model '${name}' is stopping` };
	} catch (err) {
		return { success: false, error: err instanceof Error ? err.message : "Failed to stop" };
	}
});

export const searchHuggingFaceTool = toolDefinition({
	name: "search_huggingface_models",
	description:
		"Search HuggingFace for models matching a query. Returns candidate repo IDs, author, download counts, and tags. Use this when the user wants to find a model to run.",
	inputSchema: z.object({
		query: z.string().describe("Free-text search query"),
		limit: z.number().optional().describe("Max results to return (default 10)"),
	}),
}).server(async ({ query, limit }) => {
	const results = await hf.searchModels(query, { limit: limit ?? 10 });
	return results.map((r) => ({
		id: r.id,
		author: r.author,
		downloads: r.downloads,
		likes: r.likes,
		pipeline_tag: r.pipeline_tag,
	}));
});

export const modelTools = [listModelsTool, startModelTool, stopModelTool, searchHuggingFaceTool];
