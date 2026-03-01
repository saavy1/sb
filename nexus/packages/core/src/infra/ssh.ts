import { $ } from "bun";
import logger from "@nexus/logger";
import { config } from "./config";

// === Config ===

export const sshHost = config.OPS_SSH_HOST;
export const sshUser = config.OPS_SSH_USER;

// Tailscale socket path - set via TS_SOCKET env var when using sidecar
const tsSocket = process.env.TS_SOCKET;

// === Types ===

export interface CommandResult {
	success: boolean;
	output: string;
	errorMessage?: string;
	durationMs: number;
}

// === Input Validation ===

/**
 * Validates a Kubernetes resource name (DNS-1123 subdomain).
 * Names must be lowercase alphanumeric, can contain hyphens, max 253 chars.
 * Throws if invalid to prevent command injection.
 */
export function validateK8sName(name: string, field: string): string {
	if (!name || typeof name !== "string") {
		throw new Error(`${field} is required`);
	}
	// K8s names: lowercase, alphanumeric, hyphens allowed, max 253 chars
	// Must start/end with alphanumeric
	if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(name) || name.length > 253) {
		throw new Error(
			`Invalid ${field}: must be lowercase alphanumeric with optional hyphens, max 253 chars`
		);
	}
	return name;
}

/**
 * Validates a Kubernetes namespace name.
 * Same as resource name but max 63 chars for namespaces.
 */
export function validateNamespace(namespace: string): string {
	if (!namespace || typeof namespace !== "string") {
		throw new Error("namespace is required");
	}
	if (!/^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/.test(namespace) || namespace.length > 63) {
		throw new Error(
			"Invalid namespace: must be lowercase alphanumeric with optional hyphens, max 63 chars"
		);
	}
	return namespace;
}

/**
 * Validates a positive integer within bounds.
 */
export function validatePositiveInt(value: number | undefined, defaultVal: number, max: number): number {
	if (value === undefined) return defaultVal;
	if (!Number.isInteger(value) || value < 1 || value > max) {
		throw new Error(`Value must be a positive integer between 1 and ${max}`);
	}
	return value;
}

/**
 * Defense-in-depth: Validates a command string doesn't contain dangerous shell metacharacters.
 * This is a secondary check - primary validation should happen at the tool input level.
 */
export function validateCommand(command: string): string {
	// Block common shell injection patterns
	const dangerousPatterns = [
		/[;&|`$]/, // Shell command separators and substitution
		/\$\(/, // Command substitution
		/\${/, // Variable expansion
		/>\s*\//, // Redirect to root paths
		/<\s*\//, // Input from root paths
		/\.\.\//, // Path traversal
	];

	for (const pattern of dangerousPatterns) {
		if (pattern.test(command)) {
			logger.warn({ command, pattern: pattern.toString() }, "Blocked dangerous command pattern");
			throw new Error("Command contains forbidden characters");
		}
	}

	return command;
}

// === Core SSH execution ===

/**
 * Execute a command via Tailscale SSH to the configured host.
 * This is the foundation for all remote operations (kubectl, flux, zfs, etc.)
 */
export async function executeSSH(command: string): Promise<CommandResult> {
	const startTime = Date.now();
	try {
		// Use --socket flag if TS_SOCKET is set (for sidecar mode)
		const socketArg = tsSocket ? `--socket=${tsSocket}` : "";
		const result = tsSocket
			? await $`tailscale ${socketArg} ssh ${sshUser}@${sshHost} ${command}`.quiet()
			: await $`tailscale ssh ${sshUser}@${sshHost} ${command}`.quiet();
		const durationMs = Date.now() - startTime;
		return {
			success: true,
			output: result.stdout.toString() + result.stderr.toString(),
			durationMs,
		};
	} catch (error) {
		const durationMs = Date.now() - startTime;
		const err = error as { stdout?: Buffer; stderr?: Buffer; message?: string };
		const output = (err.stdout?.toString() || "") + (err.stderr?.toString() || "");
		return {
			success: false,
			output,
			errorMessage: err.message || "SSH command failed",
			durationMs,
		};
	}
}

// === Command wrappers ===

/**
 * Execute a kubectl command via SSH.
 */
export async function executeKubectl(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`kubectl ${command}`);
}

/**
 * Execute a flux command via SSH.
 */
export async function executeFlux(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`flux ${command}`);
}

/**
 * Execute an argocd command via SSH (using --core mode for direct K8s access).
 */
export async function executeArgocd(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`argocd ${command} --core`);
}

/**
 * Execute a helm command via SSH.
 */
export async function executeHelm(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`helm ${command}`);
}

/**
 * Execute a zpool command via SSH.
 */
export async function executeZpool(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`zpool ${command}`);
}

/**
 * Execute a zfs command via SSH.
 */
export async function executeZfs(command: string): Promise<CommandResult> {
	validateCommand(command);
	return executeSSH(`zfs ${command}`);
}

/**
 * Create a GitHub issue via gh CLI over SSH.
 * Uses base64 encoding to safely transport the markdown body through the SSH shell.
 */
export async function executeGhIssueCreate(options: {
	repo: string;
	title: string;
	body: string;
	labels?: string[];
	assignees?: string[];
}): Promise<CommandResult> {
	const { repo, title, body, labels, assignees } = options;

	// Validate repo format (owner/name)
	if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repo)) {
		throw new Error("Invalid repo format, expected owner/name");
	}

	// Base64 encode body — charset [A-Za-z0-9+/=] is always shell-safe
	const bodyB64 = Buffer.from(body).toString("base64");

	// Escape single quotes in title: replace ' with '\''
	const escapedTitle = title.replace(/'/g, "'\\''");

	let cmd = `echo '${bodyB64}' | base64 -d | gh issue create --title '${escapedTitle}' --body-file - --repo '${repo}'`;

	if (labels?.length) {
		const safeLabels = labels.map((l) => l.replace(/'/g, "")).join(",");
		cmd += ` --label '${safeLabels}'`;
	}

	if (assignees?.length) {
		const safeAssignees = assignees
			.map((a) => a.replace(/[^a-zA-Z0-9-]/g, ""))
			.join(",");
		cmd += ` --assignee '${safeAssignees}'`;
	}

	return executeSSH(cmd);
}
