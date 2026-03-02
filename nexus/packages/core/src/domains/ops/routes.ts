import { Elysia, t } from "elysia";
import {
	getLatestOperation,
	getOperation,
	listOperations,
	testConnection,
	triggerOperation,
} from "./functions";
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
			const op = await triggerOperation(body.type, body.source || "dashboard", body.user);
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
			const op = await getOperation(params.id);
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
			return listOperations(limit);
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
			const op = await getLatestOperation(query.type);
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
	)
	.get(
		"/test-connection",
		async () => {
			return testConnection();
		},
		{
			detail: { tags: ["Ops"], summary: "Test SSH connectivity" },
			response: {
				200: t.Object({
					ssh: t.Object({ success: t.Boolean(), message: t.String() }),
				}),
			},
		}
	);
