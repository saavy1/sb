import { $ } from "bun";
import logger from "@nexus/logger";
import { config } from "./config";

// === Config ===

export const sshHost = config.OPS_SSH_HOST;
export const sshUser = config.OPS_SSH_USER;

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
 * Execute a command via SSH over Tailscale to the configured host.
 * This is the foundation for all remote operations (kubectl, flux, zfs, etc.)
 */
export async function executeSSH(command: string): Promise<CommandResult> {
	const startTime = Date.now();
	try {
		const result = await $`ssh -o ConnectTimeout=30 ${sshUser}@${sshHost} ${command}`.quiet();
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
