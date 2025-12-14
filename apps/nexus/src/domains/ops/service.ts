import { $ } from "bun";
import { desc, eq } from "drizzle-orm";
import logger from "logger";
import { opsDb } from "../../infra/db";
import type { NewOperationRecord, OperationRecord } from "./schema";
import { operations } from "./schema";

type OperationType = "nixos-rebuild" | "flux-reconcile";
type TriggerSource = "webhook" | "dashboard" | "cli";

interface CommandResult {
	success: boolean;
	output: string;
	errorMessage?: string;
	durationMs: number;
}

class OpsService {
	private sshHost: string;
	private sshUser: string;
	private flakePath: string;
	private flakeTarget: string;

	constructor() {
		// Use Tailscale hostname - Tailscale SSH handles auth, no keys needed
		this.sshHost = process.env.OPS_SSH_HOST || "superbloom";
		this.sshUser = process.env.OPS_SSH_USER || "root";
		this.flakePath = process.env.OPS_FLAKE_PATH || "/home/saavy/dev/sb";
		this.flakeTarget = process.env.OPS_FLAKE_TARGET || "superbloom";
	}

	private async executeSSH(command: string): Promise<CommandResult> {
		const startTime = Date.now();
		try {
			// Tailscale SSH - no StrictHostKeyChecking needed, Tailscale handles trust
			const result =
				await $`ssh -o ConnectTimeout=30 ${this.sshUser}@${this.sshHost} ${command}`.quiet();
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

	private async executeLocal(command: string): Promise<CommandResult> {
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

	async triggerOperation(
		type: OperationType,
		source: TriggerSource,
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
		this.executeOperation(id, type).catch((err) => {
			logger.error({ err, id }, "Operation execution error");
		});

		return { ...newOp, output: null, errorMessage: null, completedAt: null, durationMs: null };
	}

	private async executeOperation(id: string, type: OperationType): Promise<void> {
		let result: CommandResult;

		switch (type) {
			case "nixos-rebuild":
				result = await this.executeNixosRebuild();
				break;
			case "flux-reconcile":
				result = await this.executeFluxReconcile();
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
				output: result.output.slice(0, 50000), // Limit output size
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

	private async executeNixosRebuild(): Promise<CommandResult> {
		// First git pull, then nixos-rebuild
		const commands = [
			`cd ${this.flakePath} && git pull`,
			`nixos-rebuild switch --flake ${this.flakePath}#${this.flakeTarget}`,
		];

		let combinedOutput = "";
		for (const cmd of commands) {
			logger.info({ cmd }, "Executing SSH command");
			const result = await this.executeSSH(cmd);
			combinedOutput += `$ ${cmd}\n${result.output}\n\n`;
			if (!result.success) {
				return {
					success: false,
					output: combinedOutput,
					errorMessage: result.errorMessage,
					durationMs: result.durationMs,
				};
			}
		}

		return { success: true, output: combinedOutput, durationMs: 0 };
	}

	private async executeFluxReconcile(): Promise<CommandResult> {
		// Flux runs in K8s, so we can use kubectl/flux CLI locally or via SSH
		// If Nexus is running in K8s, use local kubectl
		const isInCluster = process.env.KUBERNETES_SERVICE_HOST !== undefined;

		if (isInCluster) {
			return this.executeLocal(
				"flux reconcile kustomization flux-system --with-source --timeout=5m"
			);
		}

		// Otherwise SSH to host and run flux
		return this.executeSSH("flux reconcile kustomization flux-system --with-source --timeout=5m");
	}

	async getOperation(id: string): Promise<OperationRecord | null> {
		const result = await opsDb.select().from(operations).where(eq(operations.id, id));
		return result[0] || null;
	}

	async listOperations(limit = 50): Promise<OperationRecord[]> {
		return opsDb.select().from(operations).orderBy(desc(operations.startedAt)).limit(limit);
	}

	async getLatestOperation(type?: OperationType): Promise<OperationRecord | null> {
		if (type) {
			const result = await opsDb
				.select()
				.from(operations)
				.where(eq(operations.type, type))
				.orderBy(desc(operations.startedAt))
				.limit(1);
			return result[0] || null;
		}

		const result = await opsDb
			.select()
			.from(operations)
			.orderBy(desc(operations.startedAt))
			.limit(1);
		return result[0] || null;
	}

	shouldTriggerNixosRebuild(changedFiles: string[]): boolean {
		return changedFiles.some((f) => f.startsWith("nixos/"));
	}

	shouldTriggerFluxReconcile(changedFiles: string[]): boolean {
		// Flux auto-reconciles from git, but we might want to force it
		return changedFiles.some((f) => f.startsWith("flux/"));
	}
}

export const opsService = new OpsService();
