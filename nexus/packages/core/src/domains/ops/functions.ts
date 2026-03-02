import { desc, eq } from "drizzle-orm";
import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { opsDb } from "../../infra/db";
import {
  executeSSH,
  executeKubectl,
  executeGhIssueCreate,
  sshHost,
  sshUser,
} from "../../infra/ssh";
import { toolDefinition } from "@tanstack/ai";
import type { NewOperationRecord, OperationRecord } from "./schema";
import { operations } from "./schema";
import type {
  CommandResultType,
  OperationTypeValue,
  TriggerSourceValue,
} from "./types";

// === Config ===

const flakePath = config.OPS_FLAKE_PATH;
const flakeTarget = config.OPS_FLAKE_TARGET;

// === Internal helpers ===

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
  return executeSSH(
    "flux reconcile kustomization flux-system --with-source --timeout=5m",
  );
}

async function executeArgocdSync(appName?: string): Promise<CommandResultType> {
  const cmd = appName
    ? `get applications.argoproj.io ${appName} -n argocd -o name`
    : "get applications.argoproj.io -n argocd -o name";

  // First get the app names, then annotate them to trigger a refresh
  const listResult = await executeKubectl(cmd);
  if (!listResult.success) {
    return listResult;
  }

  const apps = listResult.output.trim().split("\n").filter(Boolean);
  if (apps.length === 0) {
    return {
      success: true,
      output: "No ArgoCD applications found",
      durationMs: listResult.durationMs,
    };
  }

  // Annotate each app to trigger a hard refresh
  let combinedOutput = "";
  let totalDurationMs = listResult.durationMs;
  for (const app of apps) {
    const name = app.replace("application.argoproj.io/", "");
    const result = await executeKubectl(
      `annotate applications.argoproj.io ${name} -n argocd argocd.argoproj.io/refresh=hard --overwrite`,
    );
    combinedOutput += `${name}: ${result.success ? "synced" : result.errorMessage}\n`;
    totalDurationMs += result.durationMs;
  }

  return { success: true, output: combinedOutput, durationMs: totalDurationMs };
}

async function executeOperation(
  id: string,
  type: OperationTypeValue,
): Promise<void> {
  let result: CommandResultType;

  switch (type) {
    case "nixos-rebuild":
      result = await executeNixosRebuild();
      break;
    case "flux-reconcile":
      result = await executeFluxReconcile();
      break;
    case "argocd-sync":
      result = await executeArgocdSync();
      break;
    default:
      result = {
        success: false,
        output: "",
        errorMessage: `Unknown operation type: ${type}`,
        durationMs: 0,
      };
  }

  const completedAt = new Date();
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
    "Operation completed",
  );
}

// === Exported functions ===

export async function triggerOperation(
  type: OperationTypeValue,
  source: TriggerSourceValue,
  user?: string,
): Promise<OperationRecord> {
  const id = crypto.randomUUID().slice(0, 8);
  const now = new Date();

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
          completedAt: new Date(),
        })
        .where(eq(operations.id, id));
    } catch (dbErr) {
      logger.error(
        { dbErr, id },
        "Failed to update operation status after error",
      );
    }
  });

  return {
    id,
    type,
    status: "running",
    triggeredBy: source,
    triggeredByUser: user || null,
    startedAt: now,
    output: null,
    errorMessage: null,
    completedAt: null,
    durationMs: null,
  };
}

export async function getOperation(
  id: string,
): Promise<OperationRecord | null> {
  const result = await opsDb
    .select()
    .from(operations)
    .where(eq(operations.id, id));
  return result[0] || null;
}

export async function listOperations(limit = 50): Promise<OperationRecord[]> {
  return opsDb
    .select()
    .from(operations)
    .orderBy(desc(operations.startedAt))
    .limit(limit);
}

export async function getLatestOperation(
  type?: OperationTypeValue,
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

  const result = await opsDb
    .select()
    .from(operations)
    .orderBy(desc(operations.startedAt))
    .limit(1);
  return result[0] || null;
}

export function shouldTriggerNixosRebuild(changedFiles: string[]): boolean {
  return changedFiles.some((f) => f.startsWith("nixos/"));
}

export function shouldTriggerFluxReconcile(changedFiles: string[]): boolean {
  return changedFiles.some((f) => f.startsWith("flux/"));
}

export function shouldTriggerArgocdSync(changedFiles: string[]): boolean {
  return changedFiles.some((f) => f.startsWith("argocd/"));
}

// === AI Tool-exposed functions ===

export const triggerNixosRebuildTool = toolDefinition({
  name: "trigger_nixos_rebuild",
  description:
    "Trigger a NixOS rebuild on the server. This will git pull the latest config and run nixos-rebuild switch. Use when user says things like 'rebuild the server', 'apply my nixos changes', 'update the system config'.",
  inputSchema: z.object({}),
}).server(async () => {
  const op = await triggerOperation("nixos-rebuild", "ai", "the-machine");
  return {
    success: true,
    message: "NixOS rebuild started",
    operationId: op.id,
    status: op.status,
  };
});

export const triggerArgocdSyncTool = toolDefinition({
  name: "trigger_argocd_sync",
  description:
    "Trigger ArgoCD to sync all applications, deploying any pending Kubernetes changes. Use when user says things like 'sync argocd', 'deploy k8s changes', 'sync the cluster'.",
  inputSchema: z.object({
    appName: z
      .string()
      .optional()
      .describe("Specific app name to sync (default: all apps)"),
  }),
}).server(async ({ appName }) => {
  const op = await triggerOperation("argocd-sync", "ai", "the-machine");
  return {
    success: true,
    message: appName
      ? `ArgoCD sync started for ${appName}`
      : "ArgoCD sync started for all apps",
    operationId: op.id,
    status: op.status,
  };
});

export const getOperationStatusTool = toolDefinition({
  name: "get_operation_status",
  description:
    "Get the status of an infrastructure operation by ID. Use when user asks about the status of a rebuild or deployment.",
  inputSchema: z.object({
    id: z.string().describe("The operation ID"),
  }),
}).server(async ({ id }) => {
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
});

export const listRecentOperationsTool = toolDefinition({
  name: "list_recent_operations",
  description:
    "List recent infrastructure operations (rebuilds, deployments). Use when user asks 'what operations ran recently' or 'show me recent deploys'.",
  inputSchema: z.object({
    limit: z
      .number()
      .optional()
      .describe("Number of operations to return (default 10)"),
  }),
}).server(async ({ limit }) => {
  const ops = await listOperations(limit ?? 10);
  return ops.map((op) => ({
    id: op.id,
    type: op.type,
    status: op.status,
    startedAt: op.startedAt,
    durationMs: op.durationMs,
  }));
});

// === Connection test ===

export async function testConnection(): Promise<{
  ssh: { success: boolean; message: string };
}> {
  const results = {
    ssh: { success: false, message: "" },
  };

  // Test SSH (via Tailscale)
  const sshTest = await executeSSH("echo 'SSH connection successful'");
  results.ssh = {
    success: sshTest.success,
    message: sshTest.success
      ? `Connected to ${sshUser}@${sshHost}`
      : sshTest.errorMessage || "SSH connection failed",
  };

  return results;
}

// === GitHub issue tool (uses gh CLI via SSH) ===

export const createGithubIssueTool = toolDefinition({
  name: "create_github_issue",
  description:
    "Create a GitHub issue in the Superbloom repo. Use this when you've investigated a problem (e.g. CrashLoopBackOff, failed deployment) and determined it needs a code change to fix. Include your investigation findings, relevant logs, and what you think needs to change. Putting @droid in the title will cause it to be fixed.",
  inputSchema: z.object({
    title: z.string().describe("Short, descriptive issue title"),
    body: z
      .string()
      .describe(
        "Markdown body with: problem summary, investigation findings (logs, errors), affected files/services, and suggested fix direction",
      ),
    assignees: z
      .array(z.string())
      .optional()
      .describe("GitHub usernames to assign"),
  }),
}).server(async ({ title, body, assignees }) => {
  const repo = config.GITHUB_REPO;
  if (!repo) {
    return { success: false, error: "GITHUB_REPO not configured" };
  }

  const result = await executeGhIssueCreate({
    repo,
    title,
    body,
    assignees,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.errorMessage || "Failed to create issue",
      output: result.output,
    };
  }

  // gh outputs the issue URL on success (e.g. https://github.com/owner/repo/issues/42)
  const issueUrl = result.output.trim();
  const issueNumber = issueUrl.match(/\/issues\/(\d+)/)?.[1];

  return {
    success: true,
    issueUrl,
    issueNumber: issueNumber ? Number(issueNumber) : null,
    message: `Created issue #${issueNumber}: ${title}`,
  };
});

// Kubernetes query/management tools (get_pods, describe_resource, rollout_restart,
// helm_rollback, etc.) have been migrated to the k8s MCP server. They are now
// dynamically discovered via MCP protocol — see infra/mcp.ts.

export const opsTools = [
  triggerNixosRebuildTool,
  triggerArgocdSyncTool,
  getOperationStatusTool,
  listRecentOperationsTool,
  createGithubIssueTool,
];
