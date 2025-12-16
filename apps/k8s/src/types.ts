/**
 * Kubernetes resource types for the Bun-native K8s client.
 * Only includes what we need for game server management.
 */

// === Metadata ===

export interface ObjectMeta {
	name: string;
	namespace?: string;
	labels?: Record<string, string>;
	annotations?: Record<string, string>;
}

// === PersistentVolumeClaim ===

export interface PersistentVolumeClaim {
	apiVersion: "v1";
	kind: "PersistentVolumeClaim";
	metadata: ObjectMeta;
	spec: {
		accessModes: ("ReadWriteOnce" | "ReadOnlyMany" | "ReadWriteMany")[];
		storageClassName?: string;
		resources: {
			requests: {
				storage: string;
			};
		};
	};
}

// === Deployment ===

export interface Container {
	name: string;
	image: string;
	ports?: { containerPort: number; name?: string }[];
	env?: { name: string; value: string }[];
	resources?: {
		requests?: { memory?: string; cpu?: string };
		limits?: { memory?: string; cpu?: string };
	};
	volumeMounts?: { name: string; mountPath: string }[];
	tty?: boolean;
	stdin?: boolean;
}

export interface PodSpec {
	containers: Container[];
	volumes?: {
		name: string;
		persistentVolumeClaim?: { claimName: string };
		emptyDir?: Record<string, never>;
		configMap?: { name: string };
		secret?: { secretName: string };
	}[];
}

export interface Deployment {
	apiVersion: "apps/v1";
	kind: "Deployment";
	metadata: ObjectMeta;
	spec: {
		replicas: number;
		selector: {
			matchLabels: Record<string, string>;
		};
		template: {
			metadata: { labels: Record<string, string> };
			spec: PodSpec;
		};
	};
}

export interface DeploymentStatus {
	replicas?: number;
	readyReplicas?: number;
	availableReplicas?: number;
	updatedReplicas?: number;
}

// === Service ===

export interface Service {
	apiVersion: "v1";
	kind: "Service";
	metadata: ObjectMeta;
	spec: {
		type?: "ClusterIP" | "NodePort" | "LoadBalancer";
		selector: Record<string, string>;
		ports: {
			port: number;
			targetPort: number | string;
			nodePort?: number;
			name?: string;
			protocol?: "TCP" | "UDP";
		}[];
	};
}

// === Namespace ===

export interface Namespace {
	apiVersion: "v1";
	kind: "Namespace";
	metadata: ObjectMeta;
}

// === Pod ===

export interface PodStatus {
	phase: "Pending" | "Running" | "Succeeded" | "Failed" | "Unknown";
	conditions?: {
		type: string;
		status: "True" | "False" | "Unknown";
		lastTransitionTime?: string;
		reason?: string;
		message?: string;
	}[];
	containerStatuses?: {
		name: string;
		ready: boolean;
		restartCount: number;
		state?: {
			running?: { startedAt: string };
			waiting?: { reason: string; message?: string };
			terminated?: { exitCode: number; reason?: string; message?: string };
		};
	}[];
	podIP?: string;
	hostIP?: string;
	startTime?: string;
}

export interface Pod {
	apiVersion: "v1";
	kind: "Pod";
	metadata: ObjectMeta & {
		creationTimestamp?: string;
	};
	spec: PodSpec;
	status?: PodStatus;
}

export interface PodList {
	apiVersion: "v1";
	kind: "PodList";
	items: Pod[];
}

// === API Response types ===

export interface K8sStatus {
	kind: "Status";
	apiVersion: "v1";
	metadata: Record<string, never>;
	status: "Success" | "Failure";
	message?: string;
	reason?: string;
	code: number;
}

export interface K8sError {
	status: number;
	message: string;
	reason?: string;
	body?: unknown;
}

// === Client config ===

export interface KubeConfig {
	server: string;
	certificateAuthorityData?: string;
	certificateAuthority?: string;
	clientCertificateData?: string;
	clientCertificate?: string;
	clientKeyData?: string;
	clientKey?: string;
	token?: string;
	skipTLSVerify?: boolean;
}
