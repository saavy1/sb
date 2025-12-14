import { Elysia, t } from "elysia";
import logger from "logger";
import { config } from "../../infra/config";
import { opsService } from "./service";
import {
	ApiError,
	LatestQueryParams,
	Operation,
	OperationIdParam,
	OperationsQueryParams,
	TriggerOperationRequest,
	TriggerOperationResponse,
	WebhookPayload,
	WebhookResponse,
} from "./types";

export const opsRoutes = new Elysia({ prefix: "/ops" })
	.post(
		"/trigger",
		async ({ body }) => {
			const op = await opsService.triggerOperation(
				body.type,
				body.source || "dashboard",
				body.user
			);
			return {
				id: op.id,
				status: op.status,
				message: `Operation ${op.type} started`,
			};
		},
		{
			detail: { tags: ["Ops"], summary: "Trigger an infrastructure operation" },
			body: TriggerOperationRequest,
			response: { 200: TriggerOperationResponse },
		}
	)
	.get(
		"/operations/:id",
		async ({ params, set }) => {
			const op = await opsService.getOperation(params.id);
			if (!op) {
				set.status = 404;
				return { error: "Operation not found" };
			}
			return op;
		},
		{
			detail: { tags: ["Ops"], summary: "Get operation by ID" },
			params: OperationIdParam,
			response: { 200: Operation, 404: ApiError },
		}
	)
	.get(
		"/operations",
		async ({ query }) => {
			const limit = query.limit ? parseInt(query.limit, 10) : 50;
			return opsService.listOperations(limit);
		},
		{
			detail: { tags: ["Ops"], summary: "List recent operations" },
			query: OperationsQueryParams,
			response: { 200: t.Array(Operation) },
		}
	)
	.get(
		"/latest",
		async ({ query, set }) => {
			const type = query.type as "nixos-rebuild" | "flux-reconcile" | undefined;
			const op = await opsService.getLatestOperation(type);
			if (!op) {
				set.status = 404;
				return { error: "No operations found" };
			}
			return op;
		},
		{
			detail: { tags: ["Ops"], summary: "Get latest operation" },
			query: LatestQueryParams,
			response: { 200: Operation, 404: ApiError },
		}
	);

export const opsWebhookRoutes = new Elysia({ prefix: "/webhooks" }).post(
	"/github",
	async ({ body, headers, set }) => {
		const webhookSecret = config.GITHUB_WEBHOOK_SECRET;
		if (webhookSecret) {
			const signature = headers["x-hub-signature-256"];
			if (!signature) {
				logger.warn("GitHub webhook missing signature");
				set.status = 401;
				return { message: "Missing signature" };
			}
			// TODO: Implement HMAC verification
		}

		const event = headers["x-github-event"];
		if (event !== "push") {
			return { message: "Ignored non-push event" };
		}

		const changedFiles: string[] = [];
		for (const commit of body.commits || []) {
			changedFiles.push(...(commit.modified || []), ...(commit.added || []));
		}

		const user = body.sender?.login;
		const triggers: string[] = [];

		if (opsService.shouldTriggerNixosRebuild(changedFiles)) {
			await opsService.triggerOperation("nixos-rebuild", "webhook", user);
			triggers.push("nixos-rebuild");
		}

		if (triggers.length === 0) {
			return { message: "No matching triggers", changedFiles };
		}

		logger.info({ triggers, changedFiles, user }, "Webhook triggered operations");
		return { message: "Operations triggered", triggers };
	},
	{
		detail: { tags: ["Webhooks"], summary: "GitHub webhook for auto-deploy" },
		body: WebhookPayload,
		response: { 200: WebhookResponse },
	}
);
