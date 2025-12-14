import { Elysia, t } from "elysia";
import { create, deleteApp, get, list, refreshStatus, update } from "./functions";
import {
	ApiError,
	AppListResponse,
	AppParams,
	AppResponse,
	AppStatus,
	AppWithStatusResponse,
	CreateAppBody,
	UpdateAppBody,
} from "./types";

export const appRoutes = new Elysia({ prefix: "/apps" })
	.get(
		"/",
		async () => {
			return await list();
		},
		{
			detail: { tags: ["Apps"], summary: "List all apps with status" },
			response: { 200: AppListResponse },
		}
	)

	.get(
		"/:id",
		async ({ params, set }) => {
			const app = await get(params.id);
			if (!app) {
				set.status = 404;
				return { error: "App not found" };
			}
			return app;
		},
		{
			detail: { tags: ["Apps"], summary: "Get app by ID" },
			params: AppParams,
			response: { 200: AppWithStatusResponse, 404: ApiError },
		}
	)

	.post(
		"/",
		async ({ body }) => {
			return await create(body);
		},
		{
			detail: { tags: ["Apps"], summary: "Create a new app" },
			body: CreateAppBody,
			response: { 200: AppResponse },
		}
	)

	.patch(
		"/:id",
		async ({ params, body, set }) => {
			const app = await update(params.id, body);
			if (!app) {
				set.status = 404;
				return { error: "App not found" };
			}
			return app;
		},
		{
			detail: { tags: ["Apps"], summary: "Update an app" },
			params: AppParams,
			body: UpdateAppBody,
			response: { 200: AppResponse, 404: ApiError },
		}
	)

	.delete(
		"/:id",
		async ({ params, set }) => {
			const deleted = await deleteApp(params.id);
			if (!deleted) {
				set.status = 404;
				return { error: "App not found" };
			}
			return { success: true };
		},
		{
			detail: { tags: ["Apps"], summary: "Delete an app" },
			params: AppParams,
			response: { 200: t.Object({ success: t.Boolean() }), 404: ApiError },
		}
	)

	.post(
		"/:id/refresh",
		async ({ params }) => {
			const status = await refreshStatus(params.id);
			return { status };
		},
		{
			detail: { tags: ["Apps"], summary: "Refresh app health status" },
			params: AppParams,
			response: {
				200: t.Object({ status: AppStatus }),
			},
		}
	);
