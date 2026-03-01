import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { executeKubectl } from "../../infra/ssh";
import { toolDefinition } from "@tanstack/ai";

const log = logger.child({ module: "infisical" });

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

// === Infisical API response types ===

interface InfisicalSecret {
	id: string;
	workspace: string;
	environment: string;
	version: number;
	type: string;
	secretKey: string;
	secretValue?: string;
	secretComment?: string;
	secretValueHidden?: boolean;
	secretPath?: string;
	createdAt?: string;
	updatedAt?: string;
	actor?: {
		actorId: string;
		actorType: string;
		name: string;
	};
	isRotatedSecret?: boolean;
	tags?: { id: string; slug: string; name: string; color: string }[];
}

interface InfisicalListResponse {
	secrets: InfisicalSecret[];
	imports?: {
		secretPath: string;
		environment: string;
		secrets: InfisicalSecret[];
		folderId?: string;
	}[];
}

interface InfisicalGetResponse {
	secret: InfisicalSecret;
}

interface InfisicalSecretVersion {
	id: string;
	secretId: string;
	version: number;
	secretKey: string;
	secretValue?: string;
	secretValueHidden?: boolean;
	createdAt: string;
	actor?: {
		actorId: string;
		actorType: string;
		name: string;
	};
}

interface InfisicalVersionsResponse {
	secretVersions: InfisicalSecretVersion[];
}

// === Helper to mask secret values ===

function maskValue(value: string | undefined): string {
	if (!value) return "(empty)";
	if (value.length <= 8) return "****";
	return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

// === Exported functions ===

export async function getSecret(
	secretName: string,
	environment: string,
	secretPath: string,
	showValue: boolean,
): Promise<InfisicalSecret> {
	const projectId = config.INFISICAL_PROJECT_ID;
	if (!projectId) {
		throw new Error("INFISICAL_PROJECT_ID not configured");
	}

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
	environment: string,
	secretPath: string,
	showValues: boolean,
	recursive: boolean,
): Promise<InfisicalListResponse> {
	const projectId = config.INFISICAL_PROJECT_ID;
	if (!projectId) {
		throw new Error("INFISICAL_PROJECT_ID not configured");
	}

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
	const projectId = config.INFISICAL_PROJECT_ID;
	if (!projectId) {
		throw new Error("INFISICAL_PROJECT_ID not configured");
	}

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

export const getInfisicalSecretTool = toolDefinition({
	name: "get_infisical_secret",
	description: `Retrieve a specific secret from Infisical (the source of truth for all secrets in Superbloom).

Use this to:
- Check the actual value of a secret in Infisical
- Verify what value Infisical has for a given API key, password, or config
- Debug mismatches between what an app is using and what's in Infisical

By default, secret values are HIDDEN (only metadata shown). Set showValue=true to see the actual value.

Parameters:
- secretName: The secret key name (e.g., "API_KEY", "SABNZBD_API_KEY")
- environment: Environment slug (e.g., "prod", "dev", "staging")
- secretPath: The folder path in Infisical (e.g., "/", "/sabnzbd", "/media")
- showValue: Whether to reveal the actual secret value (default: false)

Example: get_infisical_secret({ secretName: "API_KEY", environment: "prod", secretPath: "/sabnzbd" })`,
	inputSchema: z.object({
		secretName: z
			.string()
			.describe(
				'The secret key name (e.g., "API_KEY", "SABNZBD_API_KEY")',
			),
		environment: z
			.string()
			.default("prod")
			.describe(
				'Environment slug (e.g., "prod", "dev", "staging"). Default: "prod"',
			),
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
}).server(async ({ secretName, environment, secretPath, showValue }) => {
	log.info(
		{ secretName, environment, secretPath, showValue },
		"Getting Infisical secret",
	);

	try {
		const secret = await getSecret(
			secretName,
			environment,
			secretPath,
			showValue,
		);

		return {
			success: true,
			secret: {
				key: secret.secretKey,
				value: showValue
					? secret.secretValue
					: maskValue(secret.secretValue),
				version: secret.version,
				environment: secret.environment,
				path: secret.secretPath || secretPath,
				comment: secret.secretComment || undefined,
				createdAt: secret.createdAt,
				updatedAt: secret.updatedAt,
				isRotated: secret.isRotatedSecret || false,
				tags:
					secret.tags?.map((t) => t.name) ||
					[],
				lastModifiedBy: secret.actor?.name || undefined,
			},
		};
	} catch (error) {
		log.error({ error, secretName, environment, secretPath }, "Failed to get Infisical secret");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to get secret from Infisical",
		};
	}
});

export const listInfisicalSecretsTool = toolDefinition({
	name: "list_infisical_secrets",
	description: `List all secrets at a given path in Infisical.

Use this to:
- See all secrets in a folder (e.g., "/media", "/sabnzbd")
- Discover what secrets exist for a service
- Get an overview of all configuration for an environment

By default, secret values are HIDDEN. Only key names and metadata are shown.

Parameters:
- environment: Environment slug (e.g., "prod", "dev")
- secretPath: The folder path (e.g., "/", "/media")
- showValues: Whether to reveal actual secret values (default: false)
- recursive: Traverse subdirectories (default: false)

Example: list_infisical_secrets({ environment: "prod", secretPath: "/media" })`,
	inputSchema: z.object({
		environment: z
			.string()
			.default("prod")
			.describe('Environment slug (e.g., "prod", "dev"). Default: "prod"'),
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
}).server(async ({ environment, secretPath, showValues, recursive }) => {
	log.info(
		{ environment, secretPath, showValues, recursive },
		"Listing Infisical secrets",
	);

	try {
		const response = await listSecrets(
			environment,
			secretPath,
			showValues,
			recursive,
		);

		const secrets = response.secrets.map((s) => ({
			key: s.secretKey,
			value: showValues ? s.secretValue : maskValue(s.secretValue),
			version: s.version,
			path: s.secretPath || secretPath,
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
					value: showValues
						? s.secretValue
						: maskValue(s.secretValue),
					version: s.version,
				})),
			})) || [];

		return {
			success: true,
			environment,
			path: secretPath,
			secretCount: secrets.length,
			secrets,
			importCount: imports.length,
			imports: imports.length > 0 ? imports : undefined,
		};
	} catch (error) {
		log.error(
			{ error, environment, secretPath },
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
});

export const compareSecretSyncTool = toolDefinition({
	name: "compare_secret_sync",
	description: `Compare an Infisical secret with its Kubernetes counterpart to detect sync issues with External Secrets Operator (ESO).

Use this to:
- Verify if ESO synced a secret correctly from Infisical to K8s
- Debug API key mismatches (e.g., SABnzbd returning 403)
- Check if a secret rotation propagated to K8s

This tool fetches the secret from both Infisical AND Kubernetes, compares them, and reports if they match.

Parameters:
- secretName: The secret key name in Infisical (e.g., "API_KEY")
- infisicalPath: Path in Infisical (e.g., "/sabnzbd")
- kubernetesSecret: K8s secret name (e.g., "sabnzbd-config")
- kubernetesKey: Key within the K8s secret (e.g., "api-key")
- namespace: K8s namespace (e.g., "sabnzbd")
- environment: Infisical environment (default: "prod")

Example: compare_secret_sync({ secretName: "API_KEY", infisicalPath: "/sabnzbd", kubernetesSecret: "sabnzbd-config", kubernetesKey: "api-key", namespace: "sabnzbd" })`,
	inputSchema: z.object({
		secretName: z
			.string()
			.describe("The secret key name in Infisical"),
		infisicalPath: z
			.string()
			.describe('Path in Infisical (e.g., "/sabnzbd")'),
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
			.default("prod")
			.describe('Infisical environment. Default: "prod"'),
	}),
}).server(
	async ({
		secretName,
		infisicalPath,
		kubernetesSecret,
		kubernetesKey,
		namespace,
		environment,
	}) => {
		log.info(
			{
				secretName,
				infisicalPath,
				kubernetesSecret,
				kubernetesKey,
				namespace,
			},
			"Comparing Infisical secret with K8s",
		);

		try {
			// Fetch from Infisical (with value)
			let infisicalValue: string | undefined;
			let infisicalVersion: number | undefined;
			let infisicalUpdatedAt: string | undefined;
			try {
				const infisicalSecret = await getSecret(
					secretName,
					environment,
					infisicalPath,
					true,
				);
				infisicalValue = infisicalSecret.secretValue;
				infisicalVersion = infisicalSecret.version;
				infisicalUpdatedAt = infisicalSecret.updatedAt;
			} catch (err) {
				return {
					success: false,
					error: `Failed to fetch from Infisical: ${err instanceof Error ? err.message : String(err)}`,
					infisical: { available: false },
					kubernetes: { available: false },
				};
			}

			// Fetch from Kubernetes using kubectl
			let k8sValue: string | undefined;
			try {
				const result = await executeKubectl(
					`get secret ${kubernetesSecret} -n ${namespace} -o jsonpath='{.data.${kubernetesKey.replace(/\./g, "\\.")}}'`,
				);
				if (result.success && result.output.trim()) {
					// K8s secrets are base64-encoded; decode
					const b64 = result.output.trim().replace(/^'|'$/g, "");
					k8sValue = Buffer.from(b64, "base64").toString("utf-8");
				}
			} catch (err) {
				return {
					success: false,
					error: `Failed to fetch from Kubernetes: ${err instanceof Error ? err.message : String(err)}`,
					infisical: {
						available: true,
						version: infisicalVersion,
					},
					kubernetes: { available: false },
				};
			}

			// Compare
			const inSync =
				infisicalValue !== undefined &&
				k8sValue !== undefined &&
				infisicalValue === k8sValue;

			return {
				success: true,
				inSync,
				infisical: {
					available: infisicalValue !== undefined,
					version: infisicalVersion,
					updatedAt: infisicalUpdatedAt,
					valueMasked: maskValue(infisicalValue),
				},
				kubernetes: {
					available: k8sValue !== undefined,
					secret: kubernetesSecret,
					key: kubernetesKey,
					namespace,
					valueMasked: maskValue(k8sValue),
				},
				message: inSync
					? "Secrets are in sync — Infisical and K8s values match"
					: infisicalValue === undefined
						? "Infisical secret value is empty or not found"
						: k8sValue === undefined
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
	log.info({ secretId, limit }, "Getting Infisical secret history");

	try {
		const versions = await getSecretVersions(secretId, limit);

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
	getInfisicalSecretTool,
	listInfisicalSecretsTool,
	compareSecretSyncTool,
	getInfisicalSecretHistoryTool,
];
