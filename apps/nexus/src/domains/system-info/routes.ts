import { Elysia, t } from "elysia";
import { systemInfoService } from "./service";
import {
	ApiError,
	CreateDriveRequest,
	Drive,
	DriveIdParam,
	DriveWithStats,
	SuggestedDrive,
	SystemOverview,
	UpdateDriveRequest,
} from "./types";

export const systemInfoRoutes = new Elysia({ prefix: "/systemInfo" })
	// WebSocket for live system stats
	.ws("/live", {
		open(ws) {
			const send = async () => {
				const overview = await systemInfoService.getSystemOverview();
				ws.send(JSON.stringify(overview));
			};
			send();
			const interval = setInterval(send, 1000);
			ws.data = { interval };
		},
		close(ws) {
			if (ws.data?.interval) {
				clearInterval(ws.data.interval);
			}
		},
	})

	// Get complete system overview (drives + stats)
	.get(
		"/overview",
		async () => {
			return await systemInfoService.getSystemOverview();
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Get system overview with drives and stats",
			},
			response: { 200: SystemOverview },
		}
	)

	// Get suggested drives for registration
	.get(
		"/drives/suggestions",
		async () => {
			return await systemInfoService.getSuggestedDrives();
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Get suggested drives based on current mounts",
			},
			response: { 200: t.Array(SuggestedDrive) },
		}
	)

	// List all registered drives with current stats
	.get(
		"/drives",
		async () => {
			return await systemInfoService.listDrivesWithStats();
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "List all registered drives with stats",
			},
			response: { 200: t.Array(DriveWithStats) },
		}
	)

	// Get a single drive by ID
	.get(
		"/drives/:id",
		async ({ params, set }) => {
			const drive = await systemInfoService.getDrive(params.id);
			if (!drive) {
				set.status = 404;
				return { error: "Drive not found" };
			}
			return drive;
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Get drive by ID",
			},
			params: DriveIdParam,
			response: { 200: Drive, 404: ApiError },
		}
	)

	// Register a new drive
	.post(
		"/drives",
		async ({ body, set }) => {
			try {
				return await systemInfoService.createDrive(body);
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to create drive";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Register a new drive",
			},
			body: CreateDriveRequest,
			response: { 200: Drive, 400: ApiError },
		}
	)

	// Update a drive registration
	.patch(
		"/drives/:id",
		async ({ params, body, set }) => {
			try {
				const updated = await systemInfoService.updateDrive(params.id, body);
				if (!updated) {
					set.status = 404;
					return { error: "Drive not found" };
				}
				return updated;
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to update drive";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Update drive registration",
			},
			params: DriveIdParam,
			body: UpdateDriveRequest,
			response: { 200: Drive, 400: ApiError, 404: ApiError },
		}
	)

	// Delete a drive registration
	.delete(
		"/drives/:id",
		async ({ params, set }) => {
			try {
				const drive = await systemInfoService.getDrive(params.id);
				if (!drive) {
					set.status = 404;
					return { error: "Drive not found" };
				}
				await systemInfoService.deleteDrive(params.id);
				return { success: true };
			} catch (e) {
				const message = e instanceof Error ? e.message : "Failed to delete drive";
				set.status = 400;
				return { error: message };
			}
		},
		{
			detail: {
				tags: ["System Info"],
				summary: "Delete drive registration",
			},
			params: DriveIdParam,
			response: { 200: t.Object({ success: t.Boolean() }), 400: ApiError, 404: ApiError },
		}
	);
