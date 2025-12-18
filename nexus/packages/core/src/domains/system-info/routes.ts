import { Elysia, t } from "elysia";
import logger from "@nexus/logger";
import { withRetry } from "../../infra/db";
import { getQdrantInfo } from "../../infra/qdrant";
import {
	createDrive,
	deleteDrive,
	getDrive,
	getDatabaseInfo,
	getDirectorySizes,
	getSuggestedDrives,
	getSystemStats,
	getZfsDatasets,
	getZfsIostat,
	getZfsPools,
	getZfsPoolStatus,
	listDrivesWithStats,
	updateDrive,
} from "./functions";
import {
	ApiError,
	CreateDriveRequest,
	DirectorySize,
	Drive,
	DriveIdParam,
	DriveWithStats,
	QdrantInfo,
	SuggestedDrive,
	SystemOverview,
	UpdateDriveRequest,
	ZfsDataset,
	ZfsIostat,
	ZfsPool,
	ZfsPoolStatus,
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
	)

	// === ZFS Routes ===

	// List all ZFS pools
	.get(
		"/zfs/pools",
		async () => {
			return await getZfsPools();
		},
		{
			detail: {
				tags: ["System Info", "ZFS"],
				summary: "List ZFS pools with health and capacity",
			},
			response: { 200: t.Array(ZfsPool) },
		}
	)

	// Get detailed status for a ZFS pool
	.get(
		"/zfs/pools/:name/status",
		async ({ params, set }) => {
			const status = await getZfsPoolStatus(params.name);
			if (!status) {
				set.status = 404;
				return { error: "Pool not found" };
			}
			return status;
		},
		{
			detail: {
				tags: ["System Info", "ZFS"],
				summary: "Get detailed ZFS pool status including drives and scrub info",
			},
			params: t.Object({ name: t.String() }),
			response: { 200: ZfsPoolStatus, 404: ApiError },
		}
	)

	// Get ZFS pool I/O stats
	.get(
		"/zfs/pools/:name/iostat",
		async ({ params, set }) => {
			const iostat = await getZfsIostat(params.name);
			if (!iostat) {
				set.status = 404;
				return { error: "Pool not found or iostat unavailable" };
			}
			return iostat;
		},
		{
			detail: {
				tags: ["System Info", "ZFS"],
				summary: "Get ZFS pool I/O statistics",
			},
			params: t.Object({ name: t.String() }),
			response: { 200: ZfsIostat, 404: ApiError },
		}
	)

	// List all ZFS datasets
	.get(
		"/zfs/datasets",
		async () => {
			return await getZfsDatasets();
		},
		{
			detail: {
				tags: ["System Info", "ZFS"],
				summary: "List ZFS datasets with usage and compression",
			},
			response: { 200: t.Array(ZfsDataset) },
		}
	)

	// Get directory sizes
	.get(
		"/zfs/directories",
		async ({ query, set }) => {
			const path = query.path || "/tank";
			const depth = query.depth ? parseInt(query.depth, 10) : 2;

			const sizes = await getDirectorySizes(path, depth);
			if (sizes.length === 0) {
				set.status = 400;
				return { error: "Path not allowed or no data available" };
			}
			return sizes;
		},
		{
			detail: {
				tags: ["System Info", "ZFS"],
				summary: "Get directory sizes (du equivalent)",
			},
			query: t.Object({
				path: t.Optional(t.String()),
				depth: t.Optional(t.String()),
			}),
			response: { 200: t.Array(DirectorySize), 400: ApiError },
		}
	)

	// === Qdrant Routes ===

	.get(
		"/qdrant",
		async () => {
			return await getQdrantInfo();
		},
		{
			detail: {
				tags: ["System Info", "Qdrant"],
				summary: "Get Qdrant vector database info and collection stats",
			},
			response: { 200: QdrantInfo },
		}
	);
