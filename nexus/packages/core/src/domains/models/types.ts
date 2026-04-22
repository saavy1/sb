import { t } from "elysia";

// === Enums ===

export const ModelStatus = t.Union([
	t.Literal("draft"),
	t.Literal("downloading"),
	t.Literal("downloaded"),
	t.Literal("starting"),
	t.Literal("running"),
	t.Literal("stopping"),
	t.Literal("stopped"),
	t.Literal("error"),
]);
export type ModelStatusType = typeof ModelStatus.static;

export const ModelRuntime = t.Union([t.Literal("vllm")]);
export type ModelRuntimeType = typeof ModelRuntime.static;

// === Config (vLLM-specific for now, extensible) ===

export const ModelEnvVar = t.Object({
	name: t.String({ minLength: 1 }),
	value: t.String(),
});
export type ModelEnvVarType = typeof ModelEnvVar.static;

export const ModelConfig = t.Object({
	tensorParallel: t.Optional(t.Integer({ minimum: 1, maximum: 8 })),
	gpuMemoryUtilization: t.Optional(t.Number({ minimum: 0.1, maximum: 1.0 })),
	maxModelLen: t.Optional(t.Integer({ minimum: 1 })),
	dtype: t.Optional(t.String()),
	toolCallParser: t.Optional(t.String()),
	// Qwen3/3.5/3.6 and other thinking-mode models set this to "qwen3";
	// DeepSeek-R1 uses "deepseek_r1"; leave undefined for non-reasoning models.
	reasoningParser: t.Optional(t.String()),
	extraArgs: t.Optional(t.Array(t.String())),
	env: t.Optional(t.Array(ModelEnvVar)),
});
export type ModelConfigType = typeof ModelConfig.static;

// === Spark-Arena recipe metadata (for UI hints / VRAM estimate) ===

export const ModelMetadata = t.Object({
	description: t.Optional(t.String()),
	maintainer: t.Optional(t.String()),
	modelParams: t.Optional(t.String()),
	modelDtype: t.Optional(t.String()),
	kvDtype: t.Optional(t.String()),
});
export type ModelMetadataType = typeof ModelMetadata.static;

// === API params / bodies ===

export const ModelNameParam = t.Object({
	name: t.String({ minLength: 1, maxLength: 63, pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" }),
});

export const CreateModelRequest = t.Object({
	name: t.String({ minLength: 1, maxLength: 63, pattern: "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" }),
	hfRepoId: t.String({ minLength: 1 }),
	hfRevision: t.Optional(t.String()),
	runtime: t.Optional(ModelRuntime),
	servedModelName: t.Optional(t.String()),
	config: t.Optional(ModelConfig),
	metadata: t.Optional(ModelMetadata),
	sparkArenaSource: t.Optional(t.String()),
	autoDownload: t.Optional(t.Boolean()),
	createdBy: t.String({ minLength: 1 }),
});
export type CreateModelRequestType = typeof CreateModelRequest.static;

export const UpdateModelRequest = t.Object({
	servedModelName: t.Optional(t.Nullable(t.String())),
	config: t.Optional(ModelConfig),
	metadata: t.Optional(ModelMetadata),
});
export type UpdateModelRequestType = typeof UpdateModelRequest.static;

// === Live K8s state summary ===

export const ModelLiveStatus = t.Object({
	ready: t.Boolean(),
	url: t.Optional(t.String()),
	replicas: t.Optional(t.Integer()),
	readyReplicas: t.Optional(t.Integer()),
	conditions: t.Optional(
		t.Array(
			t.Object({
				type: t.String(),
				status: t.String(),
				reason: t.Optional(t.String()),
				message: t.Optional(t.String()),
			})
		)
	),
});
export type ModelLiveStatusType = typeof ModelLiveStatus.static;

// === Responses ===

export const ModelResponse = t.Object({
	id: t.String(),
	name: t.String(),
	hfRepoId: t.String(),
	hfRevision: t.Nullable(t.String()),
	runtime: t.String(),
	servedModelName: t.Nullable(t.String()),
	status: ModelStatus,
	downloadJobName: t.Nullable(t.String()),
	config: ModelConfig,
	metadata: ModelMetadata,
	sparkArenaSource: t.Nullable(t.String()),
	lastError: t.Nullable(t.String()),
	createdBy: t.String(),
	createdAt: t.Date(),
	updatedAt: t.Date(),
	lastStartedAt: t.Nullable(t.Date()),
});
export type ModelResponseType = typeof ModelResponse.static;

export const ModelWithLiveStatus = t.Intersect([
	ModelResponse,
	t.Object({ live: t.Optional(ModelLiveStatus) }),
]);
export type ModelWithLiveStatusType = typeof ModelWithLiveStatus.static;

// === HuggingFace search ===

export const HfSearchQuery = t.Object({
	q: t.String({ minLength: 1 }),
	limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
	pipeline: t.Optional(t.String()),
});

export const HfSearchResult = t.Object({
	id: t.String(),
	author: t.Optional(t.String()),
	downloads: t.Optional(t.Integer()),
	likes: t.Optional(t.Integer()),
	pipeline_tag: t.Optional(t.String()),
	tags: t.Optional(t.Array(t.String())),
	lastModified: t.Optional(t.String()),
});
export type HfSearchResultType = typeof HfSearchResult.static;

// === Spark-Arena import ===

export const SparkArenaImportRequest = t.Object({
	source: t.String({ minLength: 1, description: "URL, @spark-arena/<id>, @official/<name>, or @community/<name>" }),
});
export type SparkArenaImportRequestType = typeof SparkArenaImportRequest.static;

export const SparkArenaImportResponse = t.Object({
	source: t.String(),
	hfRepoId: t.String(),
	hfRevision: t.Optional(t.String()),
	servedModelName: t.Optional(t.String()),
	config: ModelConfig,
	metadata: ModelMetadata,
});
export type SparkArenaImportResponseType = typeof SparkArenaImportResponse.static;

// === Errors ===

export const ApiError = t.Object({
	error: t.String(),
});

// === Events ===

export const ModelStatusEventPayload = t.Object({
	name: t.String(),
	status: ModelStatus,
	lastError: t.Optional(t.Nullable(t.String())),
});
export type ModelStatusEventPayloadType = typeof ModelStatusEventPayload.static;

export const ModelDownloadProgressPayload = t.Object({
	name: t.String(),
	phase: t.String(),
});
export type ModelDownloadProgressPayloadType = typeof ModelDownloadProgressPayload.static;
