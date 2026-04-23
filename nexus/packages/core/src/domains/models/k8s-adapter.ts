/**
 * KServe adapter for the `models` domain.
 *
 * Produces a serving.kserve.io/v1beta1 InferenceService referencing the
 * existing `vllm` ClusterServingRuntime via modelFormat.name=vllm. Per-model
 * args (tp, gpu_memory_utilization, max_model_len, etc.) are appended to the
 * runtime args via spec.predictor.model.args.
 *
 * Weight downloads used to spawn a batch/v1 Job here; that was replaced with
 * an in-process @huggingface/hub downloader running in the agent-worker pod
 * (see download-worker.ts + downloader.ts). vLLM still reads weights from
 * /tank/models/<slug>/ via the ServingRuntime's hostPath.
 */

import {
	getK8sClient,
	type InferenceService,
	type InferenceServiceStatus,
	isK8sError,
} from "@nexus/k8s";
import logger from "@nexus/logger";
import type { Model } from "./schema";
import type { ModelConfigType, ModelLiveStatusType } from "./types";

const log = logger.child({ module: "models.k8s-adapter" });

// Cluster / resource constants. Tightly coupled to serving-runtime.yaml
// in argocd/, so they live here rather than in infra/config.
const NAMESPACE = process.env.KSERVE_NAMESPACE || "kserve";
// Canonical local path on the superbloom host (ZFS dataset `tank/models`).
// Exposed over SMB via samba.nix and mounted by the ServingRuntime hostPath.
// Exported so the downloader can share the same default without re-reading env.
const MODELS_DIR = process.env.KSERVE_MODELS_DIR || "/tank/models";
const KSERVE_GROUP = "serving.kserve.io";
const KSERVE_VERSION = "v1beta1";
const KSERVE_PLURAL = "inferenceservices";

const client = getK8sClient();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function baseLabels(name: string): Record<string, string> {
	return {
		"app.kubernetes.io/name": name,
		"app.kubernetes.io/component": "model",
		"app.kubernetes.io/managed-by": "nexus",
		"nexus.io/domain": "models",
	};
}

function configToVllmArgs(config: ModelConfigType): string[] {
	const args: string[] = [];
	if (config.tensorParallel !== undefined) {
		args.push(`--tensor-parallel-size=${config.tensorParallel}`);
	}
	if (config.gpuMemoryUtilization !== undefined) {
		args.push(`--gpu-memory-utilization=${config.gpuMemoryUtilization}`);
	}
	if (config.maxModelLen !== undefined) {
		args.push(`--max-model-len=${config.maxModelLen}`);
	}
	if (config.dtype) {
		args.push(`--dtype=${config.dtype}`);
	}
	if (config.toolCallParser) {
		args.push(`--tool-call-parser=${config.toolCallParser}`);
	}
	if (config.reasoningParser) {
		args.push(`--reasoning-parser=${config.reasoningParser}`);
	}
	if (config.extraArgs) {
		args.push(...config.extraArgs);
	}
	return args;
}

// ---------------------------------------------------------------------------
// Manifest generators (exported for unit testing / GitOps export)
// ---------------------------------------------------------------------------

export function generateInferenceService(model: Model): InferenceService {
	const config = (model.config ?? {}) as ModelConfigType;
	const env = (config.env ?? []).map((e) => ({ name: e.name, value: e.value }));

	return {
		apiVersion: "serving.kserve.io/v1beta1",
		kind: "InferenceService",
		metadata: {
			name: model.name,
			namespace: NAMESPACE,
			labels: baseLabels(model.name),
			annotations: {
				"nexus.io/hf-repo": model.hfRepoId,
				...(model.hfRevision ? { "nexus.io/hf-revision": model.hfRevision } : {}),
				...(model.servedModelName
					? { "nexus.io/served-model-name": model.servedModelName }
					: {}),
			},
		},
		spec: {
			predictor: {
				minReplicas: 1,
				maxReplicas: 1,
				model: {
					modelFormat: { name: "vllm" },
					args: configToVllmArgs(config),
					env,
				},
			},
		},
	};
}

function deriveLiveStatus(status: InferenceServiceStatus | undefined): ModelLiveStatusType {
	if (!status) return { ready: false };
	const readyCondition = status.conditions?.find((c) => c.type === "Ready");
	const predictorComponent = status.components?.predictor;
	return {
		ready: readyCondition?.status === "True",
		url: status.url ?? status.address?.url ?? predictorComponent?.url,
		conditions: status.conditions?.map((c) => ({
			type: c.type,
			status: c.status,
			reason: c.reason,
			message: c.message,
		})),
	};
}

// ---------------------------------------------------------------------------
// Adapter API
// ---------------------------------------------------------------------------

export const kserveAdapter = {
	namespace: NAMESPACE,
	modelsDir: MODELS_DIR,

	// --- InferenceService lifecycle ---

	async apply(model: Model): Promise<void> {
		await client.ensureNamespace(NAMESPACE);
		const manifest = generateInferenceService(model);
		const existing = await client.getCustomResource<InferenceService>(
			KSERVE_GROUP,
			KSERVE_VERSION,
			NAMESPACE,
			KSERVE_PLURAL,
			model.name
		);
		if (existing) {
			const updated: InferenceService = {
				...manifest,
				metadata: { ...manifest.metadata, resourceVersion: existing.metadata.resourceVersion },
			};
			await client.updateCustomResource<InferenceService>(
				KSERVE_GROUP,
				KSERVE_VERSION,
				NAMESPACE,
				KSERVE_PLURAL,
				model.name,
				updated
			);
			log.info({ model: model.name }, "updated InferenceService");
			return;
		}
		await client.createCustomResource<InferenceService>(
			KSERVE_GROUP,
			KSERVE_VERSION,
			NAMESPACE,
			KSERVE_PLURAL,
			manifest
		);
		log.info({ model: model.name }, "created InferenceService");
	},

	async scale(modelName: string, replicas: number): Promise<void> {
		const patch = {
			spec: {
				predictor: {
					minReplicas: replicas,
					maxReplicas: Math.max(replicas, 1),
				},
			},
		};
		try {
			await client.patchCustomResource<InferenceService>(
				KSERVE_GROUP,
				KSERVE_VERSION,
				NAMESPACE,
				KSERVE_PLURAL,
				modelName,
				patch,
				"merge"
			);
			log.info({ model: modelName, replicas }, "patched InferenceService replicas");
		} catch (err) {
			if (isK8sError(err) && err.status === 404) return;
			throw err;
		}
	},

	async remove(modelName: string): Promise<void> {
		await client.deleteCustomResource(
			KSERVE_GROUP,
			KSERVE_VERSION,
			NAMESPACE,
			KSERVE_PLURAL,
			modelName
		);
		log.info({ model: modelName }, "deleted InferenceService");
	},

	async exists(modelName: string): Promise<boolean> {
		const is = await client.getCustomResource<InferenceService>(
			KSERVE_GROUP,
			KSERVE_VERSION,
			NAMESPACE,
			KSERVE_PLURAL,
			modelName
		);
		return is !== null;
	},

	async getLiveStatus(modelName: string): Promise<ModelLiveStatusType | null> {
		const is = await client.getCustomResource<InferenceService>(
			KSERVE_GROUP,
			KSERVE_VERSION,
			NAMESPACE,
			KSERVE_PLURAL,
			modelName
		);
		if (!is) return null;
		return deriveLiveStatus(is.status);
	},
};
