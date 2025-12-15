import * as k8s from "@kubernetes/client-node";
import logger from "logger";
import { config } from "../../infra/config";

interface K8sDeploymentSpec {
	name: string;
	namespace: string;
	modpack: string;
	memory: string;
	storage: string;
	port: number;
	cfApiKey?: string;
}

interface K8sHttpError {
	statusCode?: number;
	body?: unknown;
}

// Initialize Kubernetes client
const kc = new k8s.KubeConfig();

// Load config based on environment
if (process.env.NODE_ENV === "production") {
	// Use in-cluster config when running in K8s
	kc.loadFromCluster();
} else {
	// Use default kubeconfig for local development
	kc.loadFromDefault();
}

const k8sAppsApi = kc.makeApiClient(k8s.AppsV1Api);
const k8sCoreApi = kc.makeApiClient(k8s.CoreV1Api);

function isK8sError(error: unknown): error is K8sHttpError {
	return (
		typeof error === "object" &&
		error !== null &&
		"statusCode" in error &&
		typeof (error as { statusCode: unknown }).statusCode === "number"
	);
}

export function generateMinecraftManifests(spec: K8sDeploymentSpec) {
	const { name, namespace, modpack, memory, storage, port, cfApiKey } = spec;
	const labels = {
		app: name,
		"app.kubernetes.io/name": name,
		"app.kubernetes.io/component": "minecraft",
		"app.kubernetes.io/managed-by": "nexus",
	};

	const pvc: k8s.V1PersistentVolumeClaim = {
		apiVersion: "v1",
		kind: "PersistentVolumeClaim",
		metadata: { name: `${name}-data`, namespace, labels },
		spec: {
			accessModes: ["ReadWriteOnce"],
			storageClassName: config.MC_STORAGE_CLASS,
			resources: { requests: { storage } },
		},
	};

	const deployment: k8s.V1Deployment = {
		apiVersion: "apps/v1",
		kind: "Deployment",
		metadata: { name, namespace, labels },
		spec: {
			replicas: 0, // Start stopped
			selector: { matchLabels: { app: name } },
			template: {
				metadata: { labels },
				spec: {
					containers: [
						{
							name: "minecraft",
							image: "itzg/minecraft-server:latest",
							ports: [{ containerPort: 25565, name: "minecraft" }],
							env: [
								{ name: "EULA", value: "TRUE" },
								{ name: "TYPE", value: "AUTO_CURSEFORGE" },
								{ name: "CF_SLUG", value: modpack },
								{ name: "MEMORY", value: memory },
								...(cfApiKey ? [{ name: "CF_API_KEY", value: cfApiKey }] : []),
							],
							resources: {
								requests: { memory, cpu: "1000m" },
								limits: { memory },
							},
							volumeMounts: [{ name: "data", mountPath: "/data" }],
							tty: true,
							stdin: true,
						},
					],
					volumes: [
						{
							name: "data",
							persistentVolumeClaim: { claimName: `${name}-data` },
						},
					],
				},
			},
		},
	};

	const service: k8s.V1Service = {
		apiVersion: "v1",
		kind: "Service",
		metadata: { name, namespace, labels },
		spec: {
			type: "NodePort",
			selector: { app: name },
			ports: [
				{
					port: 25565,
					targetPort: 25565,
					nodePort: port,
					name: "minecraft",
				},
			],
		},
	};

	return { pvc, deployment, service };
}

export const k8sAdapter = {
	async applyManifests(manifests: {
		pvc: k8s.V1PersistentVolumeClaim;
		deployment: k8s.V1Deployment;
		service: k8s.V1Service;
	}): Promise<void> {
		const { pvc, deployment, service } = manifests;
		const namespace = config.K8S_NAMESPACE;

		try {
			// Create or update PVC
			try {
				await k8sCoreApi.createNamespacedPersistentVolumeClaim({ namespace, body: pvc });
				logger.info({ name: pvc.metadata?.name }, "Created PersistentVolumeClaim");
			} catch (error) {
				if (isK8sError(error) && error.statusCode === 409) {
					// Already exists, that's fine
					logger.debug({ name: pvc.metadata?.name }, "PersistentVolumeClaim already exists");
				} else {
					throw error;
				}
			}

			// Create or update Deployment
			try {
				await k8sAppsApi.createNamespacedDeployment({ namespace, body: deployment });
				logger.info({ name: deployment.metadata?.name }, "Created Deployment");
			} catch (error) {
				if (isK8sError(error) && error.statusCode === 409) {
					// Already exists, update it
					const deploymentName = deployment.metadata?.name;
					if (!deploymentName) {
						throw new Error("Deployment name is required");
					}
					await k8sAppsApi.replaceNamespacedDeployment({
						name: deploymentName,
						namespace,
						body: deployment,
					});
					logger.info({ name: deploymentName }, "Updated Deployment");
				} else {
					throw error;
				}
			}

			// Create or update Service
			try {
				await k8sCoreApi.createNamespacedService({ namespace, body: service });
				logger.info({ name: service.metadata?.name }, "Created Service");
			} catch (error) {
				if (isK8sError(error) && error.statusCode === 409) {
					// Already exists, update it
					const serviceName = service.metadata?.name;
					if (!serviceName) {
						throw new Error("Service name is required");
					}
					await k8sCoreApi.replaceNamespacedService({
						name: serviceName,
						namespace,
						body: service,
					});
					logger.info({ name: serviceName }, "Updated Service");
				} else {
					throw error;
				}
			}
		} catch (error) {
			logger.error({ error }, "Failed to apply K8s manifests");
			throw error;
		}
	},

	async scaleDeployment(name: string, replicas: number): Promise<void> {
		const namespace = config.K8S_NAMESPACE;
		try {
			const deployment = await k8sAppsApi.readNamespacedDeployment({ name, namespace });
			if (deployment.spec) {
				deployment.spec.replicas = replicas;
			}
			await k8sAppsApi.replaceNamespacedDeployment({ name, namespace, body: deployment });
			logger.info({ name, replicas, namespace }, "Scaled deployment");
		} catch (error) {
			logger.error({ error, name, replicas, namespace }, "Failed to scale deployment");
			throw error;
		}
	},

	async deleteResources(name: string): Promise<void> {
		const namespace = config.K8S_NAMESPACE;

		// Delete in reverse order: service -> deployment -> pvc
		try {
			// Delete Service
			try {
				await k8sCoreApi.deleteNamespacedService({ name, namespace });
				logger.info({ name, namespace }, "Deleted Service");
			} catch (error) {
				if (isK8sError(error) && error.statusCode !== 404) {
					logger.warn({ error, name }, "Failed to delete Service");
				}
			}

			// Delete Deployment
			try {
				await k8sAppsApi.deleteNamespacedDeployment({ name, namespace });
				logger.info({ name, namespace }, "Deleted Deployment");
			} catch (error) {
				if (isK8sError(error) && error.statusCode !== 404) {
					logger.warn({ error, name }, "Failed to delete Deployment");
				}
			}

			// Delete PVC
			try {
				await k8sCoreApi.deleteNamespacedPersistentVolumeClaim({ name: `${name}-data`, namespace });
				logger.info({ name: `${name}-data`, namespace }, "Deleted PersistentVolumeClaim");
			} catch (error) {
				if (isK8sError(error) && error.statusCode !== 404) {
					logger.warn({ error, name }, "Failed to delete PersistentVolumeClaim");
				}
			}
		} catch (error) {
			logger.error({ error, name, namespace }, "Failed to delete resources");
			throw error;
		}
	},

	async getDeploymentStatus(name: string): Promise<{ replicas: number; ready: number } | null> {
		const namespace = config.K8S_NAMESPACE;
		try {
			const response = await k8sAppsApi.readNamespacedDeploymentStatus({ name, namespace });
			const status = response.status;

			return {
				replicas: status?.replicas || 0,
				ready: status?.readyReplicas || 0,
			};
		} catch (error) {
			if (isK8sError(error) && error.statusCode === 404) {
				return null;
			}
			logger.error({ error, name, namespace }, "Failed to get deployment status");
			throw error;
		}
	},
};
