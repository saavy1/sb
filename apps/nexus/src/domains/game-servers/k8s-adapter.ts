import { config } from "../../infra/config";

interface K8sDeploymentSpec {
	name: string;
	namespace: string;
	modpack: string;
	memory: string;
	port: number;
	cfApiKey?: string;
}

export function generateMinecraftManifests(spec: K8sDeploymentSpec) {
	const { name, namespace, modpack, memory, port, cfApiKey } = spec;
	const labels = {
		app: name,
		"app.kubernetes.io/name": name,
		"app.kubernetes.io/component": "minecraft",
		"app.kubernetes.io/managed-by": "nexus",
	};

	const pvc = {
		apiVersion: "v1",
		kind: "PersistentVolumeClaim",
		metadata: { name: `${name}-data`, namespace, labels },
		spec: {
			accessModes: ["ReadWriteOnce"],
			storageClassName: config.MC_STORAGE_CLASS,
			resources: { requests: { storage: config.MC_STORAGE_SIZE } },
		},
	};

	const deployment = {
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

	const service = {
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

// K8s client operations (placeholder - implement with @kubernetes/client-node or kubectl)
export const k8sAdapter = {
	async applyManifests(manifests: object[]): Promise<void> {
		// In production, use @kubernetes/client-node
		// For now, shell out to kubectl
		for (const manifest of manifests) {
			const yaml = JSON.stringify(manifest);
			const proc = Bun.spawn(["kubectl", "apply", "-f", "-"], {
				stdin: Buffer.from(yaml),
			});
			await proc.exited;
			if (proc.exitCode !== 0) {
				throw new Error(`kubectl apply failed: ${proc.exitCode}`);
			}
		}
	},

	async scaleDeployment(name: string, replicas: number): Promise<void> {
		const proc = Bun.spawn([
			"kubectl",
			"scale",
			`deployment/${name}`,
			`--replicas=${replicas}`,
			`-n`,
			config.K8S_NAMESPACE,
		]);
		await proc.exited;
		if (proc.exitCode !== 0) {
			throw new Error(`kubectl scale failed: ${proc.exitCode}`);
		}
	},

	async deleteResources(name: string): Promise<void> {
		const namespace = config.K8S_NAMESPACE;
		// Delete in reverse order
		for (const kind of ["service", "deployment", "pvc"]) {
			const resourceName = kind === "pvc" ? `${name}-data` : name;
			const proc = Bun.spawn([
				"kubectl",
				"delete",
				kind,
				resourceName,
				`-n`,
				namespace,
				"--ignore-not-found",
			]);
			await proc.exited;
		}
	},

	async getDeploymentStatus(name: string): Promise<{ replicas: number; ready: number } | null> {
		const proc = Bun.spawn([
			"kubectl",
			"get",
			`deployment/${name}`,
			`-n`,
			config.K8S_NAMESPACE,
			"-o",
			"jsonpath={.status.replicas},{.status.readyReplicas}",
		]);
		const output = await new Response(proc.stdout).text();
		await proc.exited;

		if (proc.exitCode !== 0) return null;

		const [replicas, ready] = output.split(",").map(Number);
		return { replicas: replicas || 0, ready: ready || 0 };
	},
};
