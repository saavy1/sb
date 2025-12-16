/**
 * Bun-native Kubernetes client with proper mTLS support.
 *
 * @example
 * ```ts
 * import { K8sClient, getK8sClient } from "k8s";
 *
 * // Use default client (loads from kubeconfig or in-cluster)
 * const client = getK8sClient();
 *
 * // Create a deployment
 * await client.createDeployment("default", {
 *   apiVersion: "apps/v1",
 *   kind: "Deployment",
 *   metadata: { name: "my-app" },
 *   spec: { ... }
 * });
 *
 * // Scale a deployment
 * await client.scaleDeployment("default", "my-app", 3);
 * ```
 */

export { getK8sClient, isK8sError, K8sClient } from "./client";
export type {
	Container,
	Deployment,
	DeploymentStatus,
	K8sError,
	K8sStatus,
	KubeConfig,
	Namespace,
	ObjectMeta,
	PersistentVolumeClaim,
	PodSpec,
	Service,
} from "./types";
