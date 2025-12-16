import {
	type Deployment,
	getK8sClient,
	isK8sError,
	type K8sError,
	type PersistentVolumeClaim,
} from "k8s";
import logger from "logger";
import { config } from "../../infra/config";

interface K8sDeploymentSpec {
	name: string;
	namespace: string;
	modpack: string;
	memory: string;
	storage: string;
	cfApiKey?: string;
}

// Initialize the Bun-native K8s client
const client = getK8sClient();
logger.info({ server: client.getServer() }, "K8s client initialized");

export function generateMinecraftManifests(spec: K8sDeploymentSpec) {
	const { name, namespace, modpack, memory, storage, cfApiKey } = spec;
	const labels = {
		app: name,
		"app.kubernetes.io/name": name,
		"app.kubernetes.io/component": "minecraft",
		"app.kubernetes.io/managed-by": "nexus",
	};

	const pvc: PersistentVolumeClaim = {
		apiVersion: "v1",
		kind: "PersistentVolumeClaim",
		metadata: { name: `${name}-data`, namespace, labels },
		spec: {
			accessModes: ["ReadWriteOnce"],
			storageClassName: config.MC_STORAGE_CLASS,
			resources: { requests: { storage } },
		},
	};

	const deployment: Deployment = {
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

	// Service is managed by Flux (shared LoadBalancer on port 25565)
	// All deployments share the label app.kubernetes.io/component: minecraft
	return { pvc, deployment };
}

export const k8sAdapter = {
	async applyManifests(manifests: {
		pvc: PersistentVolumeClaim;
		deployment: Deployment;
	}): Promise<void> {
		const { pvc, deployment } = manifests;
		const namespace = config.K8S_NAMESPACE;

		try {
			// Ensure namespace exists
			await client.ensureNamespace(namespace);

			// Create or update PVC
			const existingPvc = await client.getPVC(namespace, pvc.metadata.name);
			if (existingPvc) {
				logger.debug({ name: pvc.metadata.name }, "PersistentVolumeClaim already exists");
			} else {
				await client.createPVC(namespace, pvc);
				logger.info({ name: pvc.metadata.name }, "Created PersistentVolumeClaim");
			}

			// Create or update Deployment
			const existingDeployment = await client.getDeployment(namespace, deployment.metadata.name);
			if (existingDeployment) {
				await client.updateDeployment(namespace, deployment.metadata.name, deployment);
				logger.info({ name: deployment.metadata.name }, "Updated Deployment");
			} else {
				await client.createDeployment(namespace, deployment);
				logger.info({ name: deployment.metadata.name }, "Created Deployment");
			}

			// Service is managed by Flux (shared LoadBalancer on port 25565)
		} catch (error) {
			logger.error({ error }, "Failed to apply K8s manifests");
			throw error;
		}
	},

	async scaleDeployment(name: string, replicas: number): Promise<void> {
		const namespace = config.K8S_NAMESPACE;
		try {
			await client.scaleDeployment(namespace, name, replicas);
			logger.info({ name, replicas, namespace }, "Scaled deployment");
		} catch (error) {
			logger.error({ error, name, replicas, namespace }, "Failed to scale deployment");
			throw error;
		}
	},

	async deleteResources(name: string): Promise<void> {
		const namespace = config.K8S_NAMESPACE;

		// Delete deployment and PVC (service is shared and managed by Flux)
		try {
			await client.deleteDeployment(namespace, name);
			logger.info({ name, namespace }, "Deleted Deployment");
		} catch (error) {
			if (!isK8sError(error) || (error as K8sError).status !== 404) {
				logger.warn({ error, name }, "Failed to delete Deployment");
			}
		}

		try {
			await client.deletePVC(namespace, `${name}-data`);
			logger.info({ name: `${name}-data`, namespace }, "Deleted PersistentVolumeClaim");
		} catch (error) {
			if (!isK8sError(error) || (error as K8sError).status !== 404) {
				logger.warn({ error, name }, "Failed to delete PersistentVolumeClaim");
			}
		}
	},

	async getDeploymentStatus(name: string): Promise<{ replicas: number; ready: number } | null> {
		const namespace = config.K8S_NAMESPACE;
		try {
			const status = await client.getDeploymentStatus(namespace, name);
			if (!status) return null;

			return {
				replicas: status.replicas || 0,
				ready: status.readyReplicas || 0,
			};
		} catch (error) {
			if (isK8sError(error) && (error as K8sError).status === 404) {
				return null;
			}
			logger.error({ error, name, namespace }, "Failed to get deployment status");
			throw error;
		}
	},
};
