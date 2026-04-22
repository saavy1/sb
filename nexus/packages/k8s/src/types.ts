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
	command?: string[];
	args?: string[];
	ports?: { containerPort: number; name?: string }[];
	env?: { name: string; value: string }[];
	resources?: {
		requests?: { memory?: string; cpu?: string; [k: string]: string | undefined };
		limits?: { memory?: string; cpu?: string; [k: string]: string | undefined };
	};
	volumeMounts?: { name: string; mountPath: string; readOnly?: boolean }[];
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
		hostPath?: { path: string; type?: string };
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

// === Job (batch/v1) ===

export interface Job {
	apiVersion: "batch/v1";
	kind: "Job";
	metadata: ObjectMeta;
	spec: {
		backoffLimit?: number;
		ttlSecondsAfterFinished?: number;
		activeDeadlineSeconds?: number;
		template: {
			metadata?: { labels?: Record<string, string> };
			spec: PodSpec & {
				restartPolicy: "Never" | "OnFailure";
				nodeSelector?: Record<string, string>;
				tolerations?: {
					key?: string;
					operator?: "Exists" | "Equal";
					value?: string;
					effect?: "NoSchedule" | "PreferNoSchedule" | "NoExecute";
				}[];
			};
		};
	};
	status?: JobStatus;
}

export interface JobStatus {
	active?: number;
	succeeded?: number;
	failed?: number;
	startTime?: string;
	completionTime?: string;
	conditions?: {
		type: "Complete" | "Failed" | "Suspended";
		status: "True" | "False" | "Unknown";
		reason?: string;
		message?: string;
		lastTransitionTime?: string;
	}[];
}

// === Generic CustomResource envelope ===
// Used for CRD-backed kinds like KServe's InferenceService (serving.kserve.io/v1beta1).

export interface CustomResource<TSpec = unknown, TStatus = unknown> {
	apiVersion: string;
	kind: string;
	metadata: ObjectMeta & {
		resourceVersion?: string;
		creationTimestamp?: string;
		uid?: string;
	};
	spec: TSpec;
	status?: TStatus;
}

export interface CustomResourceList<T = CustomResource> {
	apiVersion: string;
	kind: string;
	items: T[];
}

// === KServe: InferenceService (serving.kserve.io/v1beta1) ===
// Minimal typing - only the fields Nexus produces/consumes.

export interface InferenceServiceSpec {
	predictor: {
		minReplicas?: number;
		maxReplicas?: number;
		model?: {
			modelFormat: { name: string; version?: string };
			storageUri?: string;
			runtime?: string;
			args?: string[];
			env?: { name: string; value: string }[];
			resources?: {
				requests?: { memory?: string; cpu?: string; [k: string]: string | undefined };
				limits?: { memory?: string; cpu?: string; [k: string]: string | undefined };
			};
		};
	};
}

export interface InferenceServiceCondition {
	type: string;
	status: "True" | "False" | "Unknown";
	reason?: string;
	message?: string;
	lastTransitionTime?: string;
}

export interface InferenceServiceStatus {
	url?: string;
	address?: { url?: string };
	conditions?: InferenceServiceCondition[];
	modelStatus?: {
		states?: {
			activeModelState?: string;
			targetModelState?: string;
		};
		transitionStatus?: string;
	};
	components?: Record<
		string,
		{
			url?: string;
			address?: { url?: string };
			latestReadyRevision?: string;
		}
	>;
}

export type InferenceService = CustomResource<InferenceServiceSpec, InferenceServiceStatus> & {
	apiVersion: "serving.kserve.io/v1beta1";
	kind: "InferenceService";
};

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
