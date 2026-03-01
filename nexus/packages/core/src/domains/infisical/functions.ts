import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { executeKubectl } from "../../infra/ssh";
import { toolDefinition } from "@tanstack/ai";
import type {
	InfisicalGetResponse,
	InfisicalListResponse,
	InfisicalProjectListResponse,
	InfisicalSecretVersion,
	InfisicalVersionsResponse,
} from "./types";

const log = logger.child({ module: "infisical" });

// === Input validation for kubectl parameters ===

const SAFE_K8S_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
const SAFE_K8S_KEY = /^[a-zA-Z0-9._-]+$/;

// === Infisical API Client ===

async function infisicalFetch<T>(
	path: string,
	params: Record<string, string> = {},
): Promise<T> {
	if (!config.INFISICAL_API_TOKEN) {
		throw new Error("INFISICAL_API_TOKEN not configured");
	}

	const url = new URL(`${config.INFISICAL_URL}/api${path}`);
	for (const [key, value] of Object.entries(params)) {
		url.searchParams.set(key, value);
	}

	log.debug({ path, params: Object.keys(params) }, "Infisical API request");

	const response = await fetch(url.toString(), {
		headers: {
			Authorization: `Bearer ${config.INFISICAL_API_TOKEN}`,
			Accept: "application/json",
		},
		signal: AbortSignal.timeout(15_000),
	});

	if (!response.ok) {
		const errorText = await response.text();
		log.error(
			{ url: url.pathname, status: response.status, error: errorText },
			"Infisical API error",
		);
		throw new Error(`Infisical API error ${response.status}: ${errorText}`);
	}

	return (await response.json()) as T;
}

// === Helper to mask secret values ===

function maskValue(value: string | undefined): string {
	if (!value) return "(empty)";
	if (value.length <= 8) return "****";
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// === Exported functions ===

export async function listProjects() {
	return infisicalFetch<InfisicalProjectListResponse>("/v1/projects");
}

export async function getSecret(
	secretName: string,
	projectId: string,
	environment: string,
	secretPath: string,
	showValue: boolean,
) {
	const params: Record<string, string> = {
		projectId,
		environment,
		secretPath,
		type: "shared",
		viewSecretValue: showValue ? "true" : "false",
		expandSecretReferences: "true",
		includeImports: "true",
	};

	const response = await infisicalFetch<InfisicalGetResponse>(
		`/v4/secrets/${encodeURIComponent(secretName)}`,
		params,
	);

	return response.secret;
}

export async function listSecrets(
	projectId: string,
	environment: string,
	secretPath: string,
	showValues: boolean,
	recursive: boolean,
) {
	const params: Record<string, string> = {
		projectId,
		environment,
		secretPath,
		viewSecretValue: showValues ? "true" : "false",
		expandSecretReferences: "true",
		recursive: recursive ? "true" : "false",
		includeImports: "true",
	};

	return infisicalFetch<InfisicalListResponse>("/v4/secrets", params);
}

export async function getSecretVersions(
	secretId: string,
	limit: number,
): Promise<InfisicalSecretVersion[]> {
	const params: Record<string, string> = {
		offset: "0",
		limit: String(limit),
	};

	const response = await infisicalFetch<InfisicalVersionsResponse>(
		`/v1/secret/${secretId}/secret-versions`,
		params,
	);

	return response.secretVersions;
}

// === Tool definitions ===

export const listInfisicalProjectsTool = toolDefinition({
	name: "list_infisical_projects",
	description: `List all Infisical projects accessible to the agent.

Use this FIRST to discover available projects and get their IDs. All other Infisical tools require a projectId.

Projects are scoped by domain:
- infra: infrastructure secrets (Authelia, DDNS, Argo, Kargo)
- nexus: application secrets (API keys, Discord tokens, DB URLs)
- data: data service secrets (Kargo git credentials)
- media: media service secrets

Example: list_infisical_projects()`,
	inputSchema: z.object({}),
}).server(async () => {
	log.info("Listing Infisical projects");

	try {
		const response = await listProjects();

		const projects = response.projects.map((p) => ({
			id: p.id,
			name: p.name,
			slug: p.slug,
			environments: p.environments.map((e) => e.slug),
		}));

		return {
			success: true,
			count: projects.length,
			projects,
		};
	} catch (error) {
		log.error({ error }, "Failed to list Infisical projects");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to list projects",
		};
	}
});

export const getInfisicalSecretTool = toolDefinition({
	name: "get_infisical_secret",
	description: `Retrieve a specific secret from Infisical (the source of truth for all secrets in Superbloom).

Use list_infisical_projects first to get the projectId.

Use this to:
- Check the actual value of a secret in Infisical
- Verify what value Infisical has for a given API key, password, or config
- Debug mismatches between what an app is using and what's in Infisical

By default, secret values are HIDDEN (only metadata shown). Set showValue=true to see the actual value.

Parameters:
- projectId: Infisical project ID (from list_infisical_projects)
- secretName: The secret key name (e.g., "API_KEY", "SABNZBD_API_KEY")
- environment: Environment slug (e.g., "dev")
- secretPath: The folder path in Infisical (e.g., "/", "/sabnzbd", "/media")
- showValue: Whether to reveal the actual secret value (default: false)

Example: get_infisical_secret({ projectId: "abc123", secretName: "API_KEY", environment: "dev", secretPath: "/" })`,
	inputSchema: z.object({
		projectId: z
			.string()
			.describe("Infisical project ID (from list_infisical_projects)"),
		secretName: z
			.string()
			.describe(
				'The secret key name (e.g., "API_KEY", "SABNZBD_API_KEY")',
			),
		environment: z
			.string()
			.default("dev")
			.describe('Environment slug (e.g., "dev"). Default: "dev"'),
		secretPath: z
			.string()
			.default("/")
			.describe(
				'Folder path in Infisical (e.g., "/", "/sabnzbd"). Default: "/"',
			),
		showValue: z
			.boolean()
			.default(false)
			.describe(
				"Whether to reveal the actual secret value. Default: false (only metadata)",
			),
	}),
}).server(
	async ({ projectId, secretName, environment, secretPath, showValue }) => {
		const env = environment ?? "dev";
		const path = secretPath ?? "/";
		const reveal = showValue ?? false;

		log.info(
			{ secretName, projectId, environment: env, secretPath: path, showValue: reveal },
			"Getting Infisical secret",
		);

		try {
			const secret = await getSecret(
				secretName,
				projectId,
				env,
				path,
				reveal,
			);

			return {
				success: true,
				secret: {
					id: secret.id,
					key: secret.secretKey,
					value: reveal
						? secret.secretValue
						: maskValue(secret.secretValue),
					version: secret.version,
					environment: secret.environment,
					path: secret.secretPath || path,
					comment: secret.secretComment || undefined,
					createdAt: secret.createdAt,
					updatedAt: secret.updatedAt,
					isRotated: secret.isRotatedSecret || false,
					tags: secret.tags?.map((t) => t.name) || [],
					lastModifiedBy: secret.actor?.name || undefined,
				},
			};
		} catch (error) {
			log.error(
				{ error, secretName, projectId, environment: env, secretPath: path },
				"Failed to get Infisical secret",
			);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to get secret from Infisical",
			};
		}
	},
);

export const listInfisicalSecretsTool = toolDefinition({
	name: "list_infisical_secrets",
	description: `List all secrets at a given path in Infisical.

Use list_infisical_projects first to get the projectId.

Use this to:
- See all secrets in a project (e.g., all infra secrets, all nexus secrets)
- Discover what secrets exist for a service
- Get an overview of all configuration for an environment

By default, secret values are HIDDEN. Only key names and metadata are shown.

Parameters:
- projectId: Infisical project ID (from list_infisical_projects)
- environment: Environment slug (e.g., "dev")
- secretPath: The folder path (e.g., "/", "/media")
- showValues: Whether to reveal actual secret values (default: false)
- recursive: Traverse subdirectories (default: false)

Example: list_infisical_secrets({ projectId: "abc123", environment: "dev", secretPath: "/" })`,
	inputSchema: z.object({
		projectId: z
			.string()
			.describe("Infisical project ID (from list_infisical_projects)"),
		environment: z
			.string()
			.default("dev")
			.describe('Environment slug (e.g., "dev"). Default: "dev"'),
		secretPath: z
			.string()
			.default("/")
			.describe('Folder path (e.g., "/", "/media"). Default: "/"'),
		showValues: z
			.boolean()
			.default(false)
			.describe(
				"Whether to reveal actual secret values. Default: false",
			),
		recursive: z
			.boolean()
			.default(false)
			.describe("Traverse subdirectories. Default: false"),
	}),
}).server(
	async ({ projectId, environment, secretPath, showValues, recursive }) => {
		const env = environment ?? "dev";
		const path = secretPath ?? "/";
		const reveal = showValues ?? false;
		const recurse = recursive ?? false;

		log.info(
			{ projectId, environment: env, secretPath: path, showValues: reveal, recursive: recurse },
			"Listing Infisical secrets",
		);

		try {
			const response = await listSecrets(
				projectId,
				env,
				path,
				reveal,
				recurse,
			);

			const secrets = response.secrets.map((s) => ({
				key: s.secretKey,
				value: reveal
					? s.secretValue
					: maskValue(s.secretValue),
				version: s.version,
				path: s.secretPath || path,
				updatedAt: s.updatedAt,
				isRotated: s.isRotatedSecret || false,
				tags: s.tags?.map((t) => t.name) || [],
			}));

			// Include imported secrets if present
			const imports =
				response.imports?.map((imp) => ({
					sourcePath: imp.secretPath,
					sourceEnvironment: imp.environment,
					secretCount: imp.secrets.length,
					secrets: imp.secrets.map((s) => ({
						key: s.secretKey,
						value: reveal
							? s.secretValue
							: maskValue(s.secretValue),
						version: s.version,
					})),
				})) || [];

			return {
				success: true,
				projectId,
				environment: env,
				path,
				secretCount: secrets.length,
				secrets,
				importCount: imports.length,
				imports: imports.length > 0 ? imports : undefined,
			};
		} catch (error) {
			log.error(
				{ error, projectId, environment: env, secretPath: path },
				"Failed to list Infisical secrets",
			);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to list secrets from Infisical",
			};
		}
	},
);

export const compareSecretSyncTool = toolDefinition({
	name: "compare_secret_sync",
	description: `Compare an Infisical secret with its Kubernetes counterpart to detect sync issues with External Secrets Operator (ESO).

Use list_infisical_projects first to get the projectId.

Use this to:
- Verify if ESO synced a secret correctly from Infisical to K8s
- Debug API key mismatches (e.g., SABnzbd returning 403)
- Check if a secret rotation propagated to K8s

This tool fetches the secret from both Infisical AND Kubernetes, compares them, and reports if they match.

Parameters:
- projectId: Infisical project ID (from list_infisical_projects)
- secretName: The secret key name in Infisical (e.g., "API_KEY")
- infisicalPath: Path in Infisical (e.g., "/")
- kubernetesSecret: K8s secret name (e.g., "sabnzbd-config")
- kubernetesKey: Key within the K8s secret (e.g., "api-key")
- namespace: K8s namespace (e.g., "sabnzbd")
- environment: Infisical environment (default: "dev")

Example: compare_secret_sync({ projectId: "abc123", secretName: "API_KEY", infisicalPath: "/", kubernetesSecret: "sabnzbd-config", kubernetesKey: "api-key", namespace: "sabnzbd" })`,
	inputSchema: z.object({
		projectId: z
			.string()
			.describe("Infisical project ID (from list_infisical_projects)"),
		secretName: z
			.string()
			.describe("The secret key name in Infisical"),
		infisicalPath: z
			.string()
			.describe('Path in Infisical (e.g., "/")'),
		kubernetesSecret: z
			.string()
			.describe('K8s secret name (e.g., "sabnzbd-config")'),
		kubernetesKey: z
			.string()
			.describe('Key within the K8s secret (e.g., "api-key")'),
		namespace: z
			.string()
			.describe('K8s namespace (e.g., "sabnzbd")'),
		environment: z
			.string()
			.default("dev")
			.describe('Infisical environment. Default: "dev"'),
	}),
}).server(
	async ({
		projectId,
		secretName,
		infisicalPath,
		kubernetesSecret,
		kubernetesKey,
		namespace,
		environment,
	}) => {
		const env = environment ?? "dev";

		log.info(
			{
				secretName,
				projectId,
				infisicalPath,
				kubernetesSecret,
				kubernetesKey,
				namespace,
			},
			"Comparing Infisical secret with K8s",
		);

		// Validate K8s parameters to prevent command injection
		if (
			!SAFE_K8S_NAME.test(namespace) ||
			!SAFE_K8S_NAME.test(kubernetesSecret) ||
			!SAFE_K8S_KEY.test(kubernetesKey)
		) {
			return {
				success: false,
				error: "Invalid characters in Kubernetes resource name or key",
			};
		}

		try {
			// Fetch from both sources in parallel
			const [infisicalResult, k8sResult] = await Promise.all([
				getSecret(
					secretName,
					projectId,
					env,
					infisicalPath,
					true,
				)
					.then((secret) => ({
						ok: true as const,
						value: secret.secretValue,
						version: secret.version,
						updatedAt: secret.updatedAt,
					}))
					.catch((err) => ({
						ok: false as const,
						error:
							err instanceof Error
								? err.message
								: String(err),
					})),
				executeKubectl(
					`get secret ${kubernetesSecret} -n ${namespace} -o jsonpath='{.data.${kubernetesKey.replace(/\./g, "\\.")}}'`,
				)
					.then((result) => {
						if (result.success && result.output.trim()) {
							const b64 = result.output.trim();
							return {
								ok: true as const,
								value: Buffer.from(
									b64,
									"base64",
								).toString("utf-8"),
							};
						}
						return { ok: false as const, error: "Secret or key not found" };
					})
					.catch((err) => ({
						ok: false as const,
						error:
							err instanceof Error
								? err.message
								: String(err),
					})),
			]);

			if (!infisicalResult.ok) {
				return {
					success: false,
					error: `Failed to fetch from Infisical: ${infisicalResult.error}`,
					infisical: { available: false },
					kubernetes: { available: k8sResult.ok },
				};
			}

			if (!k8sResult.ok) {
				return {
					success: false,
					error: `Failed to fetch from Kubernetes: ${k8sResult.error}`,
					infisical: {
						available: true,
						version: infisicalResult.version,
					},
					kubernetes: { available: false },
				};
			}

			const inSync =
				infisicalResult.value !== undefined &&
				k8sResult.value !== undefined &&
				infisicalResult.value === k8sResult.value;

			return {
				success: true,
				inSync,
				infisical: {
					available: infisicalResult.value !== undefined,
					version: infisicalResult.version,
					updatedAt: infisicalResult.updatedAt,
					valueMasked: maskValue(infisicalResult.value),
				},
				kubernetes: {
					available: k8sResult.value !== undefined,
					secret: kubernetesSecret,
					key: kubernetesKey,
					namespace,
					valueMasked: maskValue(k8sResult.value),
				},
				message: inSync
					? "Secrets are in sync — Infisical and K8s values match"
					: infisicalResult.value === undefined
						? "Infisical secret value is empty or not found"
						: k8sResult.value === undefined
							? "Kubernetes secret not found or key missing"
							: "MISMATCH — Infisical and K8s values differ. ESO may have failed to sync, or the secret was recently rotated.",
			};
		} catch (error) {
			log.error(
				{ error, secretName, kubernetesSecret, namespace },
				"Failed to compare secret sync",
			);
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to compare secrets",
			};
		}
	},
);

export const getInfisicalSecretHistoryTool = toolDefinition({
	name: "get_infisical_secret_history",
	description: `Get version history for a secret in Infisical.

Use this to:
- See when a secret was last rotated/changed
- Track who changed a secret and when
- Investigate the timeline of a breakage (e.g., "when did the API key change?")

IMPORTANT: You must first get the secret using get_infisical_secret to obtain the secret's ID, then pass that ID here.

Parameters:
- secretId: The Infisical secret ID (from get_infisical_secret result)
- limit: Number of versions to return (default: 10)

Example: get_infisical_secret_history({ secretId: "abc123", limit: 5 })`,
	inputSchema: z.object({
		secretId: z
			.string()
			.describe(
				"The Infisical secret ID (from get_infisical_secret result)",
			),
		limit: z
			.number()
			.int()
			.min(1)
			.max(100)
			.default(10)
			.describe("Number of versions to return (default: 10, max: 100)"),
	}),
}).server(async ({ secretId, limit }) => {
	const maxVersions = limit ?? 10;

	log.info({ secretId, limit: maxVersions }, "Getting Infisical secret history");

	try {
		const versions = await getSecretVersions(secretId, maxVersions);

		const history = versions.map((v) => ({
			version: v.version,
			valueMasked: maskValue(v.secretValue),
			createdAt: v.createdAt,
			modifiedBy: v.actor?.name || "unknown",
		}));

		return {
			success: true,
			secretId,
			versionCount: history.length,
			versions: history,
		};
	} catch (error) {
		log.error({ error, secretId }, "Failed to get secret history");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to get secret version history",
		};
	}
});

// Export tools array for agent
export const infisicalTools = [
	listInfisicalProjectsTool,
	getInfisicalSecretTool,
	listInfisicalSecretsTool,
	compareSecretSyncTool,
	getInfisicalSecretHistoryTool,
];
