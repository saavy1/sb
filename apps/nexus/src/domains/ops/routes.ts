import { Elysia, t } from "elysia";
import { opsService } from "./service";
import {
	ApiError,
	LatestQueryParams,
	Operation,
	OperationIdParam,
	OperationsQueryParams,
	TriggerOperationRequest,
	TriggerOperationResponse,
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
