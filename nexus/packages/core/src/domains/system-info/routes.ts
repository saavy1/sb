import { Elysia, t } from "elysia";
import logger from "@nexus/logger";
import { withRetry } from "../../infra/db";
import {
	createDrive,
	deleteDrive,
	getDrive,
	getDatabaseInfo,
	getSuggestedDrives,
	getSystemStats,
	listDrivesWithStats,
	updateDrive,
} from "./functions";
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

const STATS_INTERVAL_MS = 2000;
const DB_INFO_CACHE_MS = 30000; // Cache database info for 30 seconds

const wsIntervals = new Map<unknown, ReturnType<typeof setInterval>>();
const wsSending = new WeakSet<object>(); // Track ongoing sends to prevent overlap

// Cache for database info (rarely changes)
let cachedDatabaseInfo: Awaited<ReturnType<typeof getDatabaseInfo>> | null = null;
let cacheTimestamp = 0;

async function getCachedDatabaseInfo() {
	const now = Date.now();
	if (!cachedDatabaseInfo || now - cacheTimestamp > DB_INFO_CACHE_MS) {
		try {
			cachedDatabaseInfo = await withRetry(() => getDatabaseInfo());
			cacheTimestamp = now;
		} catch (error) {
			logger.error({ error }, "Failed to fetch database info");
			// Return stale cache if available, otherwise empty
			return cachedDatabaseInfo ?? [];
		}
	}
	return cachedDatabaseInfo;
}

export const systemInfoRoutes = new Elysia({ prefix: "/systemInfo" })
	// WebSocket for live system stats
	.ws("/live", {
		open(ws) {
			const send = async () => {
				// Prevent overlapping sends (if previous is still running, skip this tick)
				if (wsSending.has(ws)) return;
				wsSending.add(ws);

				try {
					const [stats, drivesWithStats, databases] = await Promise.all([
						getSystemStats(),
						withRetry(() => listDrivesWithStats()),
						getCachedDatabaseInfo(),
					]);
					ws.send(JSON.stringify({ drives: drivesWithStats, stats, databases }));
				} catch (error) {
					logger.error({ error }, "Failed to send system overview");
				} finally {
					wsSending.delete(ws);
				}
			};
			send();
			wsIntervals.set(ws, setInterval(send, STATS_INTERVAL_MS));
		},
		close(ws) {
			const interval = wsIntervals.get(ws);
			if (interval) {
				clearInterval(interval);
				wsIntervals.delete(ws);
			}
			wsSending.delete(ws);
		},
	})

	// Get complete system overview (drives + stats)
	.get(
		"/overview",
		async () => {
			const [stats, drivesWithStats, databases] = await Promise.all([
				getSystemStats(),
				withRetry(() => listDrivesWithStats()),
				getCachedDatabaseInfo(),
			]);
			return { drives: drivesWithStats, stats, databases };
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
			return await getSuggestedDrives();
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
			return await listDrivesWithStats();
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
			const drive = await getDrive(params.id);
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
				return await createDrive(body);
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
				const updated = await updateDrive(params.id, body);
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
				const drive = await getDrive(params.id);
				if (!drive) {
					set.status = 404;
					return { error: "Drive not found" };
				}
				await deleteDrive(params.id);
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
