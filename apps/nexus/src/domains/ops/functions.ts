import { $ } from "bun";
import { desc, eq } from "drizzle-orm";
import logger from "logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { opsDb } from "../../infra/db";
import { withTool } from "../../infra/tools";
import type { NewOperationRecord, OperationRecord } from "./schema";
import { operations } from "./schema";
import type { CommandResultType, OperationTypeValue, TriggerSourceValue } from "./types";

// === Config ===

const sshHost = config.OPS_SSH_HOST;
const sshUser = config.OPS_SSH_USER;
const flakePath = config.OPS_FLAKE_PATH;
const flakeTarget = config.OPS_FLAKE_TARGET;

// === Internal helpers ===

async function executeSSH(command: string): Promise<CommandResultType> {
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

async function executeLocal(command: string): Promise<CommandResultType> {
	const startTime = Date.now();
	try {
		const result = await $`sh -c ${command}`.quiet();
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
			errorMessage: err.message || "Command failed",
			durationMs,
		};
	}
}

async function executeNixosRebuild(): Promise<CommandResultType> {
	const commands = [
		`cd ${flakePath} && git pull`,
		`nixos-rebuild switch --flake ${flakePath}#${flakeTarget}`,
	];

	let combinedOutput = "";
	let totalDurationMs = 0;
	for (const cmd of commands) {
		logger.info({ cmd }, "Executing SSH command");
		const result = await executeSSH(cmd);
		combinedOutput += `$ ${cmd}\n${result.output}\n\n`;
		totalDurationMs += result.durationMs;
		if (!result.success) {
			return {
				success: false,
				output: combinedOutput,
				errorMessage: result.errorMessage,
				durationMs: totalDurationMs,
			};
		}
	}

	return { success: true, output: combinedOutput, durationMs: totalDurationMs };
}

async function executeFluxReconcile(): Promise<CommandResultType> {
	if (config.K8S_IN_CLUSTER) {
		return executeLocal("flux reconcile kustomization flux-system --with-source --timeout=5m");
	}
	return executeSSH("flux reconcile kustomization flux-system --with-source --timeout=5m");
}

async function executeOperation(id: string, type: OperationTypeValue): Promise<void> {
	let result: CommandResultType;

	switch (type) {
		case "nixos-rebuild":
			result = await executeNixosRebuild();
			break;
		case "flux-reconcile":
			result = await executeFluxReconcile();
			break;
		default:
			result = {
				success: false,
				output: "",
				errorMessage: `Unknown operation type: ${type}`,
				durationMs: 0,
			};
	}

	const completedAt = new Date().toISOString();
	await opsDb
		.update(operations)
		.set({
			status: result.success ? "success" : "failed",
			output: result.output.slice(0, 50000),
			errorMessage: result.errorMessage || null,
			completedAt,
			durationMs: result.durationMs,
		})
		.where(eq(operations.id, id));

	logger.info(
		{ id, success: result.success, durationMs: result.durationMs },
		"Operation completed"
	);
}

// === Exported functions ===

export async function triggerOperation(
	type: OperationTypeValue,
	source: TriggerSourceValue,
	user?: string
): Promise<OperationRecord> {
	const id = crypto.randomUUID().slice(0, 8);
	const now = new Date().toISOString();

	const newOp: NewOperationRecord = {
		id,
		type,
		status: "running",
		triggeredBy: source,
		triggeredByUser: user || null,
		startedAt: now,
	};

	await opsDb.insert(operations).values(newOp);
	logger.info({ id, type, source, user }, "Operation started");

	// Execute async - don't block the response
	executeOperation(id, type).catch(async (err) => {
		logger.error({ err, id }, "Operation execution error");
		try {
			await opsDb
				.update(operations)
				.set({
					status: "failed",
					errorMessage: err?.message || "Unexpected error",
					completedAt: new Date().toISOString(),
				})
				.where(eq(operations.id, id));
		} catch (dbErr) {
			logger.error({ dbErr, id }, "Failed to update operation status after error");
		}
	});

	return {
		...newOp,
		triggeredByUser: newOp.triggeredByUser ?? null,
		output: null,
		errorMessage: null,
		completedAt: null,
		durationMs: null,
	};
}

export async function getOperation(id: string): Promise<OperationRecord | null> {
	const result = await opsDb.select().from(operations).where(eq(operations.id, id));
	return result[0] || null;
}

export async function listOperations(limit = 50): Promise<OperationRecord[]> {
	return opsDb.select().from(operations).orderBy(desc(operations.startedAt)).limit(limit);
}

export async function getLatestOperation(
	type?: OperationTypeValue
): Promise<OperationRecord | null> {
	if (type) {
		const result = await opsDb
			.select()
			.from(operations)
			.where(eq(operations.type, type))
			.orderBy(desc(operations.startedAt))
			.limit(1);
		return result[0] || null;
	}

	const result = await opsDb.select().from(operations).orderBy(desc(operations.startedAt)).limit(1);
	return result[0] || null;
}

export function shouldTriggerNixosRebuild(changedFiles: string[]): boolean {
	return changedFiles.some((f) => f.startsWith("nixos/"));
}

export function shouldTriggerFluxReconcile(changedFiles: string[]): boolean {
	return changedFiles.some((f) => f.startsWith("flux/"));
}

// === AI Tool-exposed functions ===

export const triggerNixosRebuildTool = withTool(
	{
		name: "trigger_nixos_rebuild",
		description:
			"Trigger a NixOS rebuild on the server. This will git pull the latest config and run nixos-rebuild switch. Use when user says things like 'rebuild the server', 'apply my nixos changes', 'update the system config'.",
		input: z.object({}),
	},
	async () => {
		const op = await triggerOperation("nixos-rebuild", "ai", "the-machine");
		return {
			success: true,
			message: "NixOS rebuild started",
			operationId: op.id,
			status: op.status,
		};
	}
);

export const triggerFluxReconcileTool = withTool(
	{
		name: "trigger_flux_reconcile",
		description:
			"Trigger a Flux reconciliation to deploy Kubernetes changes. Use when user says things like 'reconcile flux', 'deploy k8s changes', 'sync the cluster'.",
		input: z.object({}),
	},
	async () => {
		const op = await triggerOperation("flux-reconcile", "ai", "the-machine");
		return {
			success: true,
			message: "Flux reconciliation started",
			operationId: op.id,
			status: op.status,
		};
	}
);

export const getOperationStatusTool = withTool(
	{
		name: "get_operation_status",
		description:
			"Get the status of an infrastructure operation by ID. Use when user asks about the status of a rebuild or deployment.",
		input: z.object({
			id: z.string().describe("The operation ID"),
		}),
	},
	async ({ id }) => {
		const op = await getOperation(id);
		if (!op) {
			return { error: `Operation '${id}' not found` };
		}
		return {
			id: op.id,
			type: op.type,
			status: op.status,
			startedAt: op.startedAt,
			completedAt: op.completedAt,
			durationMs: op.durationMs,
			errorMessage: op.errorMessage,
		};
	}
);

export const listRecentOperationsTool = withTool(
	{
		name: "list_recent_operations",
		description:
			"List recent infrastructure operations (rebuilds, deployments). Use when user asks 'what operations ran recently' or 'show me recent deploys'.",
		input: z.object({
			limit: z.number().optional().describe("Number of operations to return (default 10)"),
		}),
	},
	async ({ limit }) => {
		const ops = await listOperations(limit ?? 10);
		return ops.map((op) => ({
			id: op.id,
			type: op.type,
			status: op.status,
			startedAt: op.startedAt,
			durationMs: op.durationMs,
		}));
	}
);

export const opsTools = [
	triggerNixosRebuildTool.tool,
	triggerFluxReconcileTool.tool,
	getOperationStatusTool.tool,
	listRecentOperationsTool.tool,
];
