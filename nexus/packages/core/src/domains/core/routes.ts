import { Elysia } from "elysia";
import { getSettings, updateSettings } from "./functions";
import { ApiError, SettingsResponse, UpdateSettingsBody } from "./types";

export const settingsRoutes = new Elysia({ prefix: "/settings" })
	.get(
		"/",
		async () => {
			return await getSettings();
		},
		{
			detail: { tags: ["Settings"], summary: "Get all settings" },
			response: { 200: SettingsResponse },
		}
	)
	.patch(
		"/",
		async ({ body, set }) => {
			try {
				return await updateSettings(body);
			} catch (err) {
				set.status = 400;
				return { error: err instanceof Error ? err.message : "Unknown error" };
			}
		},
		{
			detail: { tags: ["Settings"], summary: "Update settings" },
			body: UpdateSettingsBody,
			response: { 200: SettingsResponse, 400: ApiError },
		}
	);
