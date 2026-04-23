/**
 * KServe adapter for the `models` domain.
 *
 * Two kinds of K8s resources are produced:
 *  1. A batch/v1 Job that pre-downloads HuggingFace weights to the NAS
 *     under /tank/models/<name>/ (the ZFS dataset on superbloom). Path is
 *     overridable via the KSERVE_MODELS_DIR env var.
 *  2. A serving.kserve.io/v1beta1 InferenceService referencing the
 *     existing `vllm` ClusterServingRuntime via modelFormat.name=vllm.
 *     Per-model args (tp, gpu_memory_utilization, max_model_len, etc.)
 *     are appended to the runtime args via spec.predictor.model.args.
 */

import {
	getK8sClient,
	type InferenceService,
	type InferenceServiceStatus,
	isK8sError,
	type Job,
	type JobStatus,
} from "@nexus/k8s";
import logger from "@nexus/logger";
import type { Model } from "./schema";
import type { ModelConfigType, ModelLiveStatusType } from "./types";

const log = logger.child({ module: "models.k8s-adapter" });

// Cluster / resource constants. Tightly coupled to serving-runtime.yaml
// in argocd/, so they live here rather than in infra/config.
const NAMESPACE = process.env.KSERVE_NAMESPACE || "kserve";
// Canonical local path on the superbloom host (ZFS dataset `tank/models`).
// Exposed over SMB via samba.nix; mounted directly as a hostPath volume
// for both download Jobs and the vLLM serving-runtime.
const MODELS_DIR = process.env.KSERVE_MODELS_DIR || "/tank/models";
const KSERVE_GROUP = "serving.kserve.io";
const KSERVE_VERSION = "v1beta1";
const KSERVE_PLURAL = "inferenceservices";
const DOWNLOADER_IMAGE = process.env.HF_DOWNLOADER_IMAGE || "python:3.12-slim";

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

function shellQuote(v: string): string {
	return `'${v.replace(/'/g, "'\\''")}'`;
}

export function downloadJobName(modelName: string): string {
	// Timestamped so re-downloads don't collide. Base36 timestamp keeps the
	// Job name safely under the 63-char K8s DNS-label ceiling.
	const ts = Math.floor(Date.now() / 1000).toString(36);
	const truncated = modelName.slice(0, 40);
	return `hf-dl-${truncated}-${ts}`;
}

function buildDownloadScript(model: Model): string {
	const dest = `${MODELS_DIR}/${model.name}`;
	const revisionFlag = model.hfRevision ? `--revision ${shellQuote(model.hfRevision)}` : "";
	// huggingface_hub is pure-python; pip-installing inside python:3.12-slim
	// is fast (~5s), avoids baking a custom image. As of huggingface_hub 1.x
	// the CLI is `hf` (legacy `huggingface-cli` is deprecated) and the [cli]
	// extra no longer exists — the CLI is bundled with the base package.
	return [
		"set -eu",
		'echo "[$(date -Iseconds)] installing huggingface_hub"',
		"pip install --quiet --no-cache-dir 'huggingface_hub>=1.0.0'",
		`mkdir -p ${dest}`,
		`echo "[$(date -Iseconds)] downloading ${model.hfRepoId}${model.hfRevision ? `@${model.hfRevision}` : ""} -> ${dest}"`,
		`hf download ${shellQuote(model.hfRepoId)} ${revisionFlag} --local-dir ${dest}`,
		'echo "[$(date -Iseconds)] download complete"',
	].join("\n");
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

export function generateDownloadJob(model: Model, jobName: string): Job {
	const config = (model.config ?? {}) as ModelConfigType;
	const hfTokenEnv = config.env?.find((e) => e.name === "HF_TOKEN");

	const env: { name: string; value: string }[] = [
		{ name: "HF_HOME", value: "/tmp/hf-home" },
		{ name: "PIP_DISABLE_PIP_VERSION_CHECK", value: "1" },
	];
	if (hfTokenEnv?.value) {
		env.push({ name: "HF_TOKEN", value: hfTokenEnv.value });
	} else if (process.env.HF_TOKEN) {
		env.push({ name: "HF_TOKEN", value: process.env.HF_TOKEN });
	}

	return {
		apiVersion: "batch/v1",
		kind: "Job",
		metadata: {
			name: jobName,
			namespace: NAMESPACE,
			labels: {
				...baseLabels(model.name),
				"app.kubernetes.io/component": "model-download",
			},
		},
		spec: {
			backoffLimit: 1,
			ttlSecondsAfterFinished: 3600,
			template: {
				metadata: {
					labels: {
						...baseLabels(model.name),
						"app.kubernetes.io/component": "model-download",
					},
				},
				spec: {
					restartPolicy: "Never",
					nodeSelector: { "kubernetes.io/os": "linux" },
					containers: [
						{
							name: "downloader",
							image: DOWNLOADER_IMAGE,
							command: ["sh", "-c"],
							args: [buildDownloadScript(model)],
							env,
							volumeMounts: [{ name: "nas-models", mountPath: MODELS_DIR }],
							resources: {
								requests: { cpu: "500m", memory: "512Mi" },
								limits: { memory: "2Gi" },
							},
						},
					],
					volumes: [
						{
							name: "nas-models",
							hostPath: { path: MODELS_DIR, type: "Directory" },
						},
					],
				},
			},
		},
	};
}

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

	// --- Download Job lifecycle ---

	async startDownload(model: Model): Promise<string> {
		await client.ensureNamespace(NAMESPACE);
		const jobName = downloadJobName(model.name);
		const job = generateDownloadJob(model, jobName);
		const created = await client.createJob(NAMESPACE, job);
		log.info({ model: model.name, job: created.metadata.name }, "created download Job");
		return created.metadata.name;
	},

	async getDownloadStatus(jobName: string): Promise<JobStatus | null> {
		const job = await client.getJob(NAMESPACE, jobName);
		return job?.status ?? null;
	},

	async deleteDownload(jobName: string): Promise<void> {
		try {
			await client.deleteJob(NAMESPACE, jobName);
		} catch (err) {
			if (!isK8sError(err) || err.status !== 404) {
				log.warn({ err, jobName }, "failed to delete download Job");
			}
		}
	},

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
