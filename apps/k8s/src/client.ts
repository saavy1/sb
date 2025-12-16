/**
 * Bun-native Kubernetes client with proper mTLS support.
 * Uses Bun's fetch with TLS options for client certificate authentication.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import yaml from "js-yaml";
import type {
	Deployment,
	DeploymentStatus,
	K8sError,
	K8sStatus,
	KubeConfig,
	Namespace,
	PersistentVolumeClaim,
	Pod,
	PodList,
	Service,
} from "./types";

interface KubeconfigFile {
	apiVersion: string;
	kind: string;
	clusters: {
		name: string;
		cluster: {
			server: string;
			"certificate-authority-data"?: string;
			"certificate-authority"?: string;
			"insecure-skip-tls-verify"?: boolean;
		};
	}[];
	contexts: {
		name: string;
		context: {
			cluster: string;
			user: string;
			namespace?: string;
		};
	}[];
	"current-context": string;
	users: {
		name: string;
		user: {
			"client-certificate-data"?: string;
			"client-certificate"?: string;
			"client-key-data"?: string;
			"client-key"?: string;
			token?: string;
		};
	}[];
}

function base64Decode(data: string): string {
	return Buffer.from(data, "base64").toString("utf-8");
}

function loadKubeconfigFromFile(path?: string): KubeConfig {
	const kubeconfigPath = path ?? process.env.KUBECONFIG ?? join(homedir(), ".kube", "config");

	if (!existsSync(kubeconfigPath)) {
		throw new Error(`Kubeconfig not found at ${kubeconfigPath}`);
	}

	const content = readFileSync(kubeconfigPath, "utf-8");
	const config = yaml.load(content) as KubeconfigFile;

	const currentContext = config["current-context"];
	const context = config.contexts.find((c) => c.name === currentContext);
	if (!context) {
		throw new Error(`Context '${currentContext}' not found in kubeconfig`);
	}

	const cluster = config.clusters.find((c) => c.name === context.context.cluster);
	if (!cluster) {
		throw new Error(`Cluster '${context.context.cluster}' not found in kubeconfig`);
	}

	const user = config.users.find((u) => u.name === context.context.user);
	if (!user) {
		throw new Error(`User '${context.context.user}' not found in kubeconfig`);
	}

	return {
		server: cluster.cluster.server,
		certificateAuthorityData: cluster.cluster["certificate-authority-data"],
		certificateAuthority: cluster.cluster["certificate-authority"],
		clientCertificateData: user.user["client-certificate-data"],
		clientCertificate: user.user["client-certificate"],
		clientKeyData: user.user["client-key-data"],
		clientKey: user.user["client-key"],
		token: user.user.token,
		skipTLSVerify: cluster.cluster["insecure-skip-tls-verify"],
	};
}

function loadKubeconfigFromCluster(): KubeConfig {
	const tokenPath = "/var/run/secrets/kubernetes.io/serviceaccount/token";
	const caPath = "/var/run/secrets/kubernetes.io/serviceaccount/ca.crt";

	if (!existsSync(tokenPath)) {
		throw new Error("Not running in a Kubernetes cluster (token not found)");
	}

	const token = readFileSync(tokenPath, "utf-8").trim();
	const host = process.env.KUBERNETES_SERVICE_HOST;
	const port = process.env.KUBERNETES_SERVICE_PORT;

	if (!host || !port) {
		throw new Error("KUBERNETES_SERVICE_HOST or KUBERNETES_SERVICE_PORT not set");
	}

	return {
		server: `https://${host}:${port}`,
		certificateAuthority: existsSync(caPath) ? caPath : undefined,
		token,
	};
}

export class K8sClient {
	private config: KubeConfig;
	private tlsOptions: {
		cert?: string;
		key?: string;
		ca?: string;
		rejectUnauthorized: boolean;
	};
	private isInCluster: boolean;

	constructor(config?: KubeConfig) {
		if (config) {
			this.config = config;
			this.isInCluster = false;
		} else if (process.env.KUBERNETES_SERVICE_HOST) {
			this.config = loadKubeconfigFromCluster();
			this.isInCluster = true;
		} else {
			this.config = loadKubeconfigFromFile();
			this.isInCluster = false;
		}

		// Prepare TLS options for Bun's fetch
		// Note: In-cluster mode with Bun has issues with CA validation, so we skip it for now
		// TODO: Investigate proper CA handling with Bun's fetch
		this.tlsOptions = {
			rejectUnauthorized: this.isInCluster ? false : !this.config.skipTLSVerify,
		};

		console.log("[k8s] Client initialized:", {
			server: this.config.server,
			isInCluster: this.isInCluster,
			hasCA: !!this.config.certificateAuthority || !!this.config.certificateAuthorityData,
			hasCert: !!this.config.clientCertificate || !!this.config.clientCertificateData,
			hasKey: !!this.config.clientKey || !!this.config.clientKeyData,
			hasToken: !!this.config.token,
		});

		// Load client certificate and key
		if (this.config.clientCertificateData) {
			this.tlsOptions.cert = base64Decode(this.config.clientCertificateData);
		} else if (this.config.clientCertificate) {
			this.tlsOptions.cert = readFileSync(this.config.clientCertificate, "utf-8");
		}

		if (this.config.clientKeyData) {
			this.tlsOptions.key = base64Decode(this.config.clientKeyData);
		} else if (this.config.clientKey) {
			this.tlsOptions.key = readFileSync(this.config.clientKey, "utf-8");
		}

		// Load CA certificate
		if (this.config.certificateAuthorityData) {
			this.tlsOptions.ca = base64Decode(this.config.certificateAuthorityData);
		} else if (this.config.certificateAuthority) {
			this.tlsOptions.ca = readFileSync(this.config.certificateAuthority, "utf-8");
		}

		console.log("[k8s] TLS options:", {
			hasCa: !!this.tlsOptions.ca,
			caLength: this.tlsOptions.ca?.length,
			rejectUnauthorized: this.tlsOptions.rejectUnauthorized,
		});
	}

	getServer(): string {
		return this.config.server;
	}

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		const url = `${this.config.server}${path}`;

		const headers: Record<string, string> = {
			"Content-Type": "application/json",
			Accept: "application/json",
		};

		if (this.config.token) {
			headers.Authorization = `Bearer ${this.config.token}`;
		}

		const response = await fetch(url, {
			method,
			headers,
			body: body ? JSON.stringify(body) : undefined,
			tls: {
				cert: this.tlsOptions.cert,
				key: this.tlsOptions.key,
				ca: this.tlsOptions.ca,
				rejectUnauthorized: this.tlsOptions.rejectUnauthorized,
			},
		});

		if (!response.ok) {
			const errorBody = await response.json().catch(() => null);
			const error: K8sError = {
				status: response.status,
				message: (errorBody as K8sStatus)?.message ?? response.statusText,
				reason: (errorBody as K8sStatus)?.reason,
				body: errorBody,
			};
			throw error;
		}

		return response.json() as Promise<T>;
	}

	// === PersistentVolumeClaim operations ===

	async createPVC(namespace: string, pvc: PersistentVolumeClaim): Promise<PersistentVolumeClaim> {
		return this.request<PersistentVolumeClaim>(
			"POST",
			`/api/v1/namespaces/${namespace}/persistentvolumeclaims`,
			pvc
		);
	}

	async getPVC(namespace: string, name: string): Promise<PersistentVolumeClaim | null> {
		try {
			return await this.request<PersistentVolumeClaim>(
				"GET",
				`/api/v1/namespaces/${namespace}/persistentvolumeclaims/${name}`
			);
		} catch (err) {
			if ((err as K8sError).status === 404) return null;
			throw err;
		}
	}

	async deletePVC(namespace: string, name: string): Promise<void> {
		try {
			await this.request<K8sStatus>(
				"DELETE",
				`/api/v1/namespaces/${namespace}/persistentvolumeclaims/${name}`
			);
		} catch (err) {
			if ((err as K8sError).status === 404) return;
			throw err;
		}
	}

	// === Deployment operations ===

	async createDeployment(namespace: string, deployment: Deployment): Promise<Deployment> {
		return this.request<Deployment>(
			"POST",
			`/apis/apps/v1/namespaces/${namespace}/deployments`,
			deployment
		);
	}

	async getDeployment(
		namespace: string,
		name: string
	): Promise<(Deployment & { status?: DeploymentStatus }) | null> {
		try {
			return await this.request<Deployment & { status?: DeploymentStatus }>(
				"GET",
				`/apis/apps/v1/namespaces/${namespace}/deployments/${name}`
			);
		} catch (err) {
			if ((err as K8sError).status === 404) return null;
			throw err;
		}
	}

	async updateDeployment(
		namespace: string,
		name: string,
		deployment: Deployment
	): Promise<Deployment> {
		return this.request<Deployment>(
			"PUT",
			`/apis/apps/v1/namespaces/${namespace}/deployments/${name}`,
			deployment
		);
	}

	async deleteDeployment(namespace: string, name: string): Promise<void> {
		try {
			await this.request<K8sStatus>(
				"DELETE",
				`/apis/apps/v1/namespaces/${namespace}/deployments/${name}`
			);
		} catch (err) {
			if ((err as K8sError).status === 404) return;
			throw err;
		}
	}

	async scaleDeployment(namespace: string, name: string, replicas: number): Promise<void> {
		const deployment = await this.getDeployment(namespace, name);
		if (!deployment) {
			throw { status: 404, message: `Deployment ${name} not found` } as K8sError;
		}
		deployment.spec.replicas = replicas;
		await this.updateDeployment(namespace, name, deployment);
	}

	async getDeploymentStatus(namespace: string, name: string): Promise<DeploymentStatus | null> {
		const deployment = await this.getDeployment(namespace, name);
		return deployment?.status ?? null;
	}

	// === Service operations ===

	async createService(namespace: string, service: Service): Promise<Service> {
		return this.request<Service>("POST", `/api/v1/namespaces/${namespace}/services`, service);
	}

	async getService(namespace: string, name: string): Promise<Service | null> {
		try {
			return await this.request<Service>("GET", `/api/v1/namespaces/${namespace}/services/${name}`);
		} catch (err) {
			if ((err as K8sError).status === 404) return null;
			throw err;
		}
	}

	async updateService(namespace: string, name: string, service: Service): Promise<Service> {
		return this.request<Service>(
			"PUT",
			`/api/v1/namespaces/${namespace}/services/${name}`,
			service
		);
	}

	async deleteService(namespace: string, name: string): Promise<void> {
		try {
			await this.request<K8sStatus>("DELETE", `/api/v1/namespaces/${namespace}/services/${name}`);
		} catch (err) {
			if ((err as K8sError).status === 404) return;
			throw err;
		}
	}

	// === Namespace operations ===

	async getNamespace(name: string): Promise<Namespace | null> {
		try {
			return await this.request<Namespace>("GET", `/api/v1/namespaces/${name}`);
		} catch (err) {
			if ((err as K8sError).status === 404) return null;
			throw err;
		}
	}

	async createNamespace(name: string): Promise<Namespace> {
		const namespace: Namespace = {
			apiVersion: "v1",
			kind: "Namespace",
			metadata: { name },
		};
		return this.request<Namespace>("POST", "/api/v1/namespaces", namespace);
	}

	async ensureNamespace(name: string): Promise<void> {
		const existing = await this.getNamespace(name);
		if (!existing) {
			await this.createNamespace(name);
		}
	}

	// === Pod operations ===

	async listPods(namespace: string, labelSelector?: string): Promise<Pod[]> {
		const params = new URLSearchParams();
		if (labelSelector) {
			params.set("labelSelector", labelSelector);
		}
		const query = params.toString();
		const path = `/api/v1/namespaces/${namespace}/pods${query ? `?${query}` : ""}`;
		const response = await this.request<PodList>("GET", path);
		return response.items;
	}

	async getPod(namespace: string, name: string): Promise<Pod | null> {
		try {
			return await this.request<Pod>("GET", `/api/v1/namespaces/${namespace}/pods/${name}`);
		} catch (err) {
			if ((err as K8sError).status === 404) return null;
			throw err;
		}
	}

	// === Utility ===

	async healthCheck(): Promise<boolean> {
		try {
			await this.request<unknown>("GET", "/healthz");
			return true;
		} catch {
			return false;
		}
	}
}

// Export singleton for convenience
let defaultClient: K8sClient | null = null;

export function getK8sClient(): K8sClient {
	if (!defaultClient) {
		defaultClient = new K8sClient();
	}
	return defaultClient;
}

export function isK8sError(error: unknown): error is K8sError {
	return (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof (error as K8sError).status === "number"
	);
}
