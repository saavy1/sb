import { readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { $ } from "bun";
import { eq } from "drizzle-orm";
import type { Static } from "elysia";
import logger from "@nexus/logger";
import { z } from "zod";
import { systemInfoDb, withDb } from "../../infra/db";
import { executeZpool, executeZfs, executeSSH } from "../../infra/ssh";
import { withTool } from "../../infra/tools";
import type { DriveRecord } from "./schema";
import { drives } from "./schema";
import type {
	CpuStats,
	CpuTimesType,
	DatabaseInfo,
	DirectorySizeType,
	DiskStats,
	GpuStats,
	MemoryStats,
	MountInfoType,
	NetInterfaceSampleType,
	NetworkStats,
	RawSampleType,
	SystemStats,
	ZfsDatasetType,
	ZfsIostatType,
	ZfsPoolStatusType,
	ZfsPoolType,
	ZfsScrubStatusType,
	ZfsVdevType,
} from "./types";

// === Module-level state ===
let lastSample: RawSampleType | null = null;

// === Constants ===
const ALLOWED_FILESYSTEMS = new Set([
	"ext4",
	"ext3",
	"xfs",
	"btrfs",
	"zfs",
	"nfs",
	"nfs4",
	"cifs",
	"ntfs",
	"vfat",
]);

// === Internal helpers ===

function takeSample(): RawSampleType {
	const cpus = os.cpus();
	const cpuTimes: CpuTimesType[] = cpus.map((cpu) => cpu.times);

	// Read disk stats from /proc/diskstats
	let diskReads = 0;
	let diskWrites = 0;
	try {
		const diskstats = readFileSync("/proc/diskstats", "utf-8");
		for (const line of diskstats.split("\n")) {
			const parts = line.trim().split(/\s+/);
			if (parts.length < 14) continue;
			const device = parts[2];
			if (/^(sd[a-z]|nvme\d+n\d+|vd[a-z])$/.test(device)) {
				diskReads += parseInt(parts[5], 10) * 512;
				diskWrites += parseInt(parts[9], 10) * 512;
			}
		}
	} catch {
		// /proc/diskstats not available
	}

	// Read network stats from /proc/net/dev
	let netRx = 0;
	let netTx = 0;
	const netInterfaces = new Map<string, NetInterfaceSampleType>();
	try {
		const netdev = readFileSync("/proc/net/dev", "utf-8");
		for (const line of netdev.split("\n").slice(2)) {
			const parts = line.trim().split(/\s+/);
			if (parts.length < 10) continue;
			const iface = parts[0].replace(":", "");
			if (iface === "lo") continue;
			const rx = parseInt(parts[1], 10);
			const tx = parseInt(parts[9], 10);
			netRx += rx;
			netTx += tx;
			netInterfaces.set(iface, { rx, tx });
		}
	} catch {
		// /proc/net/dev not available
	}

	return {
		timestamp: Date.now(),
		cpuTimes,
		diskReads,
		diskWrites,
		netRx,
		netTx,
		netInterfaces,
	};
}

function getUptime(): { seconds: number; formatted: string } {
	try {
		const uptime = readFileSync("/proc/uptime", "utf-8");
		const seconds = Math.floor(parseFloat(uptime.split(" ")[0]));
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);

		const parts = [];
		if (days > 0) parts.push(`${days}d`);
		if (hours > 0) parts.push(`${hours}h`);
		parts.push(`${minutes}m`);

		return { seconds, formatted: parts.join(" ") };
	} catch {
		return { seconds: 0, formatted: "unknown" };
	}
}

async function getAmdGpuStats(): Promise<Static<typeof GpuStats> | null> {
	try {
		const cards = readdirSync("/sys/class/drm").filter((d) => /^card\d+$/.test(d));

		for (const card of cards) {
			const devicePath = `/sys/class/drm/${card}/device`;

			try {
				const vendor = readFileSync(`${devicePath}/vendor`, "utf-8").trim();
				if (vendor !== "0x1002") continue;
			} catch {
				continue;
			}

			let usage: number | undefined;
			try {
				usage = parseInt(readFileSync(`${devicePath}/gpu_busy_percent`, "utf-8").trim(), 10);
			} catch {}

			let memoryUsed: number | undefined;
			let memoryTotal: number | undefined;
			try {
				memoryUsed = Math.round(
					parseInt(readFileSync(`${devicePath}/mem_info_vram_used`, "utf-8").trim(), 10) /
						1024 /
						1024
				);
				memoryTotal = Math.round(
					parseInt(readFileSync(`${devicePath}/mem_info_vram_total`, "utf-8").trim(), 10) /
						1024 /
						1024
				);
			} catch {}

			let temperature: number | undefined;
			try {
				const hwmons = readdirSync(`${devicePath}/hwmon`);
				for (const hwmon of hwmons) {
					try {
						const temp = parseInt(
							readFileSync(`${devicePath}/hwmon/${hwmon}/temp1_input`, "utf-8").trim(),
							10
						);
						temperature = Math.round(temp / 1000);
						break;
					} catch {}
				}
			} catch {}

			let name = "AMD GPU";
			try {
				const productName = readFileSync(`${devicePath}/product_name`, "utf-8").trim();
				if (productName) name = productName;
			} catch {
				try {
					const uevent = readFileSync(`${devicePath}/uevent`, "utf-8");
					const match = uevent.match(/PCI_SLOT_NAME=(.+)/);
					if (match) name = `AMD GPU (${match[1]})`;
				} catch {}
			}

			return { available: true, name, usage, memoryUsed, memoryTotal, temperature };
		}
	} catch {}
	return null;
}

async function getIntelGpuStats(): Promise<Static<typeof GpuStats> | null> {
	try {
		const cards = readdirSync("/sys/class/drm").filter((d) => /^card\d+$/.test(d));

		for (const card of cards) {
			const devicePath = `/sys/class/drm/${card}/device`;

			try {
				const vendor = readFileSync(`${devicePath}/vendor`, "utf-8").trim();
				if (vendor !== "0x8086") continue;
			} catch {
				continue;
			}

			let temperature: number | undefined;
			try {
				const hwmons = readdirSync(`${devicePath}/hwmon`);
				for (const hwmon of hwmons) {
					try {
						const temp = parseInt(
							readFileSync(`${devicePath}/hwmon/${hwmon}/temp1_input`, "utf-8").trim(),
							10
						);
						temperature = Math.round(temp / 1000);
						break;
					} catch {}
				}
			} catch {}

			let usage: number | undefined;
			try {
				const result = await $`timeout 1 intel_gpu_top -J -s 500`.text();
				const data = JSON.parse(result);
				if (data.engines?.["Render/3D/0"]?.busy) {
					usage = Math.round(data.engines["Render/3D/0"].busy);
				}
			} catch {}

			let name = "Intel GPU";
			try {
				const result = await $`lspci -d 8086: -nn`.text();
				const match = result.match(/VGA.*:\s*(.+?)(?:\s*\[|$)/m);
				if (match) name = match[1].trim();
			} catch {}

			return { available: true, name, usage, temperature };
		}
	} catch {}
	return null;
}

async function getNvidiaGpuStats(): Promise<Static<typeof GpuStats> | null> {
	try {
		const result =
			await $`nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total,temperature.gpu --format=csv,noheader,nounits`.text();
		const parts = result.trim().split(", ");
		if (parts.length >= 5) {
			return {
				available: true,
				name: parts[0].trim(),
				usage: parseInt(parts[1], 10),
				memoryUsed: parseInt(parts[2], 10),
				memoryTotal: parseInt(parts[3], 10),
				temperature: parseInt(parts[4], 10),
			};
		}
	} catch {}
	return null;
}

async function getGpuStats(): Promise<Static<typeof GpuStats>> {
	// Wrap GPU detection with a 3 second timeout to prevent hangs
	const timeoutMs = 3000;
	const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));

	const detectGpu = async (): Promise<Static<typeof GpuStats> | null> => {
		const amdStats = await getAmdGpuStats();
		if (amdStats) return amdStats;

		const intelStats = await getIntelGpuStats();
		if (intelStats) return intelStats;

		const nvidiaStats = await getNvidiaGpuStats();
		if (nvidiaStats) return nvidiaStats;

		return null;
	};

	const result = await Promise.race([detectGpu(), timeoutPromise]);
	if (result) return result;

	return { available: false };
}

function calculateCpuStats(
	current: RawSampleType,
	previous: RawSampleType | null
): Static<typeof CpuStats> {
	const cpus = os.cpus();
	const model = cpus[0]?.model || "Unknown";
	const speed = cpus[0]?.speed || 0;

	const cores: Array<{ core: number; usage: number }> = [];
	let totalUsage = 0;

	for (let i = 0; i < current.cpuTimes.length; i++) {
		const curr = current.cpuTimes[i];
		const prev = previous?.cpuTimes[i];

		let usage = 0;
		if (prev) {
			const currTotal = curr.user + curr.nice + curr.sys + curr.idle + curr.irq;
			const prevTotal = prev.user + prev.nice + prev.sys + prev.idle + prev.irq;
			const totalDelta = currTotal - prevTotal;
			const idleDelta = curr.idle - prev.idle;

			if (totalDelta > 0) {
				usage = Math.round(((totalDelta - idleDelta) / totalDelta) * 100);
			}
		}

		cores.push({ core: i, usage });
		totalUsage += usage;
	}

	return {
		usage: Math.round(totalUsage / cores.length),
		coreCount: cores.length,
		cores,
		model,
		speed,
	};
}

function getMemoryStats(): Static<typeof MemoryStats> {
	let total = 0;
	let available = 0;
	let cached = 0;

	try {
		const meminfo = readFileSync("/proc/meminfo", "utf-8");
		for (const line of meminfo.split("\n")) {
			const [key, value] = line.split(":");
			if (!value) continue;
			const kb = parseInt(value.trim().split(/\s+/)[0], 10);

			if (key === "MemTotal") total = kb;
			else if (key === "MemAvailable") available = kb;
			else if (key === "Cached") cached = kb;
		}
	} catch {
		total = Math.round(os.totalmem() / 1024);
		available = Math.round(os.freemem() / 1024);
	}

	const used = total - available;
	const toGb = (kb: number) => Math.round((kb / 1024 / 1024) * 10) / 10;

	return {
		used: toGb(used),
		total: toGb(total),
		available: toGb(available),
		cached: toGb(cached),
		usagePercent: Math.round((used / total) * 100),
	};
}

function calculateDiskStats(
	current: RawSampleType,
	previous: RawSampleType | null,
	deltaSec: number
): Static<typeof DiskStats> {
	if (!previous || deltaSec <= 0) {
		return { readSpeed: 0, writeSpeed: 0 };
	}

	const readBytes = current.diskReads - previous.diskReads;
	const writeBytes = current.diskWrites - previous.diskWrites;

	return {
		readSpeed: Math.round((readBytes / deltaSec / 1024 / 1024) * 10) / 10,
		writeSpeed: Math.round((writeBytes / deltaSec / 1024 / 1024) * 10) / 10,
	};
}

function calculateNetworkStats(
	current: RawSampleType,
	previous: RawSampleType | null,
	deltaSec: number
): Static<typeof NetworkStats> {
	if (!previous || deltaSec <= 0) {
		return { interfaces: [], totalRxSpeed: 0, totalTxSpeed: 0 };
	}

	const rxBytes = current.netRx - previous.netRx;
	const txBytes = current.netTx - previous.netTx;

	const totalRxSpeed = Math.round((rxBytes / deltaSec / 1024 / 1024) * 10) / 10;
	const totalTxSpeed = Math.round((txBytes / deltaSec / 1024 / 1024) * 10) / 10;

	const interfaces: Array<{ name: string; rxSpeed: number; txSpeed: number }> = [];
	for (const [name, curr] of current.netInterfaces) {
		const prev = previous.netInterfaces.get(name);
		if (prev) {
			const ifaceRx = curr.rx - prev.rx;
			const ifaceTx = curr.tx - prev.tx;
			interfaces.push({
				name,
				rxSpeed: Math.round((ifaceRx / deltaSec / 1024 / 1024) * 100) / 100,
				txSpeed: Math.round((ifaceTx / deltaSec / 1024 / 1024) * 100) / 100,
			});
		}
	}
	interfaces.sort((a, b) => b.rxSpeed + b.txSpeed - (a.rxSpeed + a.txSpeed));

	return { interfaces, totalRxSpeed, totalTxSpeed };
}

function generateLabel(path: string): string {
	if (path === "/") return "System";
	if (path.startsWith("/mnt/")) return path.replace("/mnt/", "").split("/")[0];
	if (path.startsWith("/media/")) return path.replace("/media/", "").split("/")[0];
	const parts = path.split("/").filter(Boolean);
	return parts[parts.length - 1] || "Drive";
}

function formatBytes(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

// === Exported functions ===

export async function getSystemStats(): Promise<Static<typeof SystemStats>> {
	const current = takeSample();
	const previous = lastSample;
	lastSample = current;

	const deltaMs = previous ? current.timestamp - previous.timestamp : 1000;
	const deltaSec = deltaMs / 1000;

	return {
		cpu: calculateCpuStats(current, previous),
		memory: getMemoryStats(),
		disk: calculateDiskStats(current, previous, deltaSec),
		network: calculateNetworkStats(current, previous, deltaSec),
		gpu: await getGpuStats(),
		uptime: getUptime(),
	};
}

export async function scanMounts(): Promise<MountInfoType[]> {
	try {
		// Use timeout to prevent hanging on stale mounts
		const result = await $`timeout 5 df -B G -T -l`.text();
		const lines = result.trim().split("\n").slice(1);
		const mounts: MountInfoType[] = [];

		for (const line of lines) {
			const parts = line.split(/\s+/);
			if (parts.length < 7) continue;

			const [_fs, fsType, totalStr, usedStr, availStr, percentStr, ...mountParts] = parts;
			const mountPoint = mountParts.join(" ");

			if (!ALLOWED_FILESYSTEMS.has(fsType)) continue;
			if (
				mountPoint.startsWith("/snap") ||
				mountPoint.startsWith("/boot/efi") ||
				mountPoint.includes("/docker/")
			)
				continue;

			mounts.push({
				path: mountPoint,
				filesystem: fsType,
				total: parseInt(totalStr.replace("G", ""), 10),
				used: parseInt(usedStr.replace("G", ""), 10),
				available: parseInt(availStr.replace("G", ""), 10),
				usagePercent: parseInt(percentStr.replace("%", ""), 10),
			});
		}
		return mounts;
	} catch (error) {
		logger.error({ error }, "Failed to scan mounts");
		return [];
	}
}

export async function getSuggestedDrives() {
	const mounts = await scanMounts();
	const registeredDrives = await systemInfoDb.select().from(drives);
	const registeredPaths = new Set(registeredDrives.map((d) => d.path));

	return mounts
		.filter((mount) => !registeredPaths.has(mount.path))
		.map((mount) => ({
			path: mount.path,
			suggestedLabel: generateLabel(mount.path),
			total: mount.total,
			filesystem: mount.filesystem,
		}));
}

export async function getMountStats(path: string): Promise<MountInfoType | null> {
	const mounts = await scanMounts();
	return mounts.find((m) => m.path === path) || null;
}

export async function listDrivesWithStats() {
	const registeredDrives = await systemInfoDb.select().from(drives);
	const mounts = await scanMounts();
	const mountMap = new Map(mounts.map((m) => [m.path, m]));

	return registeredDrives.map((drive) => {
		const stats = mountMap.get(drive.path);
		return {
			...drive,
			mounted: !!stats,
			...(stats && {
				used: stats.used,
				total: stats.total,
				available: stats.available,
				usagePercent: stats.usagePercent,
			}),
		};
	});
}

export async function createDrive(data: {
	path: string;
	label: string;
	expectedCapacity?: number;
}) {
	const id = crypto.randomUUID().slice(0, 8);
	const now = new Date();
	const newDrive: DriveRecord = {
		id,
		path: data.path,
		label: data.label,
		expectedCapacity: data.expectedCapacity ?? null,
		createdAt: now,
		updatedAt: now,
	};
	await systemInfoDb.insert(drives).values(newDrive);
	return newDrive;
}

export async function updateDrive(id: string, data: { label?: string; expectedCapacity?: number }) {
	const now = new Date();
	await systemInfoDb
		.update(drives)
		.set({ ...data, updatedAt: now })
		.where(eq(drives.id, id));
	const updated = await systemInfoDb.select().from(drives).where(eq(drives.id, id));
	return updated[0] || null;
}

export async function deleteDrive(id: string) {
	await systemInfoDb.delete(drives).where(eq(drives.id, id));
}

export async function getDrive(id: string) {
	const result = await systemInfoDb.select().from(drives).where(eq(drives.id, id));
	return result[0] || null;
}

export async function getDatabaseInfo(): Promise<Static<typeof DatabaseInfo>[]> {
	// Map Postgres schema names to display domains
	const schemaMap: Record<string, string> = {
		agent: "agent",
		apps: "apps",
		core: "core",
		game_servers: "game-servers",
		ops: "ops",
		system_info: "system-info",
	};

	try {
		// Query Postgres for schema sizes and row counts
		const result = await withDb(async (client) => {
			const rows = await client`
				SELECT
					n.nspname as schema_name,
					COALESCE(SUM(pg_total_relation_size(c.oid)), 0)::bigint as size_bytes,
					COALESCE(SUM(CASE WHEN c.relkind = 'r' THEN c.reltuples ELSE 0 END), 0)::bigint as row_count
				FROM pg_namespace n
				LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relkind IN ('r', 'i', 't')
				WHERE n.nspname IN ('agent', 'apps', 'core', 'game_servers', 'ops', 'system_info')
				GROUP BY n.nspname
				ORDER BY n.nspname
			`;
			return rows as unknown as { schema_name: string; size_bytes: string; row_count: string }[];
		});

		return result.map((row) => ({
			name: schemaMap[row.schema_name] || row.schema_name,
			domain: schemaMap[row.schema_name] || row.schema_name,
			sizeBytes: Number(row.size_bytes),
			sizeFormatted: formatBytes(Number(row.size_bytes)),
			rowCount: Number(row.row_count),
		}));
	} catch (error) {
		logger.error({ error }, "Failed to get database info from Postgres");
		return [];
	}
}

export async function getSystemOverview() {
	const [drivesWithStats, stats, databases] = await Promise.all([
		listDrivesWithStats(),
		getSystemStats(),
		getDatabaseInfo(),
	]);
	return { drives: drivesWithStats, stats, databases };
}

// === AI Tool-exposed functions ===

export const getSystemStatsTool = withTool(
	{
		name: "get_system_stats",
		description: "Get current system statistics including CPU, memory, GPU, network, and disk I/O",
		input: z.object({}),
	},
	async () => {
		const stats = await getSystemStats();
		return {
			cpu: {
				usage: stats.cpu.usage,
				coreCount: stats.cpu.coreCount,
				model: stats.cpu.model,
			},
			memory: {
				used: stats.memory.used,
				total: stats.memory.total,
				usagePercent: stats.memory.usagePercent,
			},
			gpu: stats.gpu.available
				? {
						name: stats.gpu.name,
						usage: stats.gpu.usage,
						temperature: stats.gpu.temperature,
						memoryUsed: stats.gpu.memoryUsed,
						memoryTotal: stats.gpu.memoryTotal,
					}
				: { available: false },
			network: {
				downloadSpeed: stats.network.totalRxSpeed,
				uploadSpeed: stats.network.totalTxSpeed,
			},
			disk: {
				readSpeed: stats.disk.readSpeed,
				writeSpeed: stats.disk.writeSpeed,
			},
			uptime: stats.uptime.formatted,
		};
	}
);

export const getDrivesTool = withTool(
	{
		name: "get_drives",
		description: "Get information about registered storage drives and their usage",
		input: z.object({}),
	},
	async () => {
		const drivesList = await listDrivesWithStats();
		return drivesList.map((d) => ({
			label: d.label,
			path: d.path,
			mounted: d.mounted,
			used: d.used,
			total: d.total,
			usagePercent: d.usagePercent,
		}));
	}
);

// === ZFS helpers ===

function formatBytesZfs(bytes: number): string {
	if (bytes === 0) return "0 B";
	const k = 1024;
	const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`;
}

// === ZFS Pool Functions ===

export async function getZfsPools(): Promise<ZfsPoolType[]> {
	const result = await executeZpool("list -Hp -o name,health,size,alloc,free,frag,cap");
	if (!result.success) {
		logger.error({ error: result.errorMessage, output: result.output }, "Failed to get ZFS pools");
		return [];
	}

	const pools: ZfsPoolType[] = [];
	for (const line of result.output.trim().split("\n")) {
		if (!line.trim()) continue;
		const [name, health, size, allocated, free, frag, cap] = line.split("\t");
		if (!name) continue;

		pools.push({
			name,
			health: health as ZfsPoolType["health"],
			size: parseInt(size, 10),
			allocated: parseInt(allocated, 10),
			free: parseInt(free, 10),
			fragmentation: parseInt(frag, 10),
			capacity: parseInt(cap, 10),
			sizeFormatted: formatBytesZfs(parseInt(size, 10)),
			allocatedFormatted: formatBytesZfs(parseInt(allocated, 10)),
			freeFormatted: formatBytesZfs(parseInt(free, 10)),
		});
	}
	return pools;
}

export async function getZfsPoolStatus(poolName: string): Promise<ZfsPoolStatusType | null> {
	// Validate pool name to prevent injection
	if (!/^[a-zA-Z0-9_-]+$/.test(poolName)) {
		logger.warn({ poolName }, "Invalid pool name");
		return null;
	}

	const result = await executeZpool(`status ${poolName}`);
	if (!result.success) {
		logger.error({ error: result.errorMessage, output: result.output, poolName }, "Failed to get ZFS pool status");
		return null;
	}

	const output = result.output;
	const lines = output.split("\n");

	// Parse basic info
	let state = "UNKNOWN";
	let status: string | undefined;
	let action: string | undefined;
	let errors = "No known data errors";

	const stateMatch = output.match(/state:\s*(\w+)/);
	if (stateMatch) state = stateMatch[1];

	const statusMatch = output.match(/status:\s*(.+?)(?=action:|config:|$)/s);
	if (statusMatch) status = statusMatch[1].trim();

	const actionMatch = output.match(/action:\s*(.+?)(?=see:|config:|$)/s);
	if (actionMatch) action = actionMatch[1].trim();

	const errorsMatch = output.match(/errors:\s*(.+)/);
	if (errorsMatch) errors = errorsMatch[1].trim();

	// Parse scrub status
	const scan: ZfsScrubStatusType = { state: "none", errors: 0 };
	const scanSection = output.match(/scan:\s*(.+?)(?=config:|$)/s);
	if (scanSection) {
		const scanText = scanSection[1];
		if (scanText.includes("scrub in progress")) {
			scan.state = "scrubbing";
			const progressMatch = scanText.match(/([\d.]+)%\s*done/);
			if (progressMatch) scan.progress = parseFloat(progressMatch[1]);
			const speedMatch = scanText.match(/(\d+\.?\d*\s*[KMGT]?B\/s)/);
			if (speedMatch) scan.speed = speedMatch[1];
		} else if (scanText.includes("scrub repaired") || scanText.includes("scrub canceled")) {
			scan.state = "completed";
			const dateMatch = scanText.match(/on\s+(.+)/);
			if (dateMatch) scan.lastCompleted = dateMatch[1].trim();
			const errorsMatch = scanText.match(/(\d+)\s+errors/);
			if (errorsMatch) scan.errors = parseInt(errorsMatch[1], 10);
			const durationMatch = scanText.match(/after\s+([\dhms]+)/);
			if (durationMatch) scan.duration = durationMatch[1];
		}
	}

	// Parse vdevs and drives
	const vdevs: ZfsVdevType[] = [];
	let inConfig = false;
	let currentVdev: ZfsVdevType | null = null;

	for (const line of lines) {
		if (line.includes("NAME") && line.includes("STATE")) {
			inConfig = true;
			continue;
		}
		if (!inConfig || !line.trim()) continue;

		// Detect vdev lines (raidz2, mirror, etc.)
		const vdevMatch = line.match(/^\s+(raidz\d?|mirror|spare|log|cache|special)\s+(\w+)/i);
		if (vdevMatch || line.match(new RegExp(`^\\s+${poolName}\\s+(\\w+)`))) {
			if (currentVdev) vdevs.push(currentVdev);

			if (vdevMatch) {
				currentVdev = { type: vdevMatch[1], state: vdevMatch[2], drives: [] };
			} else {
				// Pool-level line
				const poolMatch = line.match(new RegExp(`^\\s+${poolName}\\s+(\\w+)`));
				if (poolMatch) {
					currentVdev = { type: "pool", state: poolMatch[1], drives: [] };
				}
			}
			continue;
		}

		// Detect drive lines (by-id paths or device names)
		const driveMatch = line.match(
			/^\s{4,}([\w/-]+)\s+(ONLINE|DEGRADED|FAULTED|OFFLINE|UNAVAIL|REMOVED)\s+(\d+)\s+(\d+)\s+(\d+)/
		);
		if (driveMatch && currentVdev) {
			currentVdev.drives.push({
				name: driveMatch[1],
				state: driveMatch[2],
				read: parseInt(driveMatch[3], 10),
				write: parseInt(driveMatch[4], 10),
				cksum: parseInt(driveMatch[5], 10),
			});
		}
	}
	if (currentVdev) vdevs.push(currentVdev);

	return {
		name: poolName,
		state,
		status,
		action,
		scan,
		vdevs,
		errors,
	};
}

// === ZFS Dataset Functions ===

export async function getZfsDatasets(): Promise<ZfsDatasetType[]> {
	const result = await executeZfs("list -Hp -o name,used,avail,refer,compressratio,mountpoint");
	if (!result.success) {
		logger.error({ error: result.errorMessage, output: result.output }, "Failed to get ZFS datasets");
		return [];
	}

	const datasets: ZfsDatasetType[] = [];
	for (const line of result.output.trim().split("\n")) {
		if (!line.trim()) continue;
		const [name, used, avail, refer, ratio, mountpoint] = line.split("\t");
		if (!name) continue;

		const usedBytes = parseInt(used, 10);
		const availBytes = parseInt(avail, 10);

		datasets.push({
			name,
			used: usedBytes,
			available: availBytes,
			referenced: parseInt(refer, 10),
			compressRatio: parseFloat(ratio.replace("x", "")),
			mountpoint: mountpoint || "-",
			usedFormatted: formatBytesZfs(usedBytes),
			availableFormatted: formatBytesZfs(availBytes),
		});
	}
	return datasets;
}

// === ZFS I/O Stats ===

export async function getZfsIostat(poolName: string): Promise<ZfsIostatType | null> {
	// Validate pool name
	if (!/^[a-zA-Z0-9_-]+$/.test(poolName)) {
		logger.warn({ poolName }, "Invalid pool name");
		return null;
	}

	// Get a single iostat sample (get 2 samples, 1 second apart, use the second one for actual throughput)
	const result = await executeZpool(`iostat -Hp ${poolName} 1 2`);
	if (!result.success) {
		logger.error({ error: result.errorMessage, output: result.output, poolName }, "Failed to get ZFS iostat");
		return null;
	}

	// Take the last line (the second sample which reflects actual throughput)
	const lines = result.output.trim().split("\n");
	const line = lines[lines.length - 1];
	if (!line) return null;

	// Format: name alloc free read_ops write_ops read_bw write_bw
	const parts = line.split("\t");
	if (parts.length < 7) return null;

	const readBw = parseInt(parts[5], 10);
	const writeBw = parseInt(parts[6], 10);

	return {
		pool: poolName,
		readOps: parseInt(parts[3], 10),
		writeOps: parseInt(parts[4], 10),
		readBandwidth: readBw,
		writeBandwidth: writeBw,
		readBandwidthFormatted: formatBytesZfs(readBw) + "/s",
		writeBandwidthFormatted: formatBytesZfs(writeBw) + "/s",
	};
}

// === Directory Sizes ===

export async function getDirectorySizes(
	path: string,
	depth = 2
): Promise<DirectorySizeType[]> {
	// Validate path - only allow /tank paths for safety
	if (!path.startsWith("/tank") && !path.startsWith("/srv")) {
		logger.warn({ path }, "Directory sizes only allowed for /tank or /srv");
		return [];
	}
	// Basic path validation
	if (/[;&|`$]/.test(path)) {
		logger.warn({ path }, "Invalid characters in path");
		return [];
	}

	const validDepth = Math.min(Math.max(1, depth), 5); // Clamp to 1-5

	// Use executeSSH directly (no validation) since du needs shell constructs
	// and we've already validated the path above
	const result = await executeSSH(`du -d ${validDepth} -b "${path}" 2>/dev/null`);
	if (!result.success) {
		logger.error({ error: result.errorMessage, path }, "Failed to get directory sizes");
		return [];
	}

	const sizes: DirectorySizeType[] = [];
	for (const line of result.output.trim().split("\n")) {
		if (!line.trim()) continue;
		const match = line.match(/^(\d+)\s+(.+)$/);
		if (!match) continue;

		const sizeBytes = parseInt(match[1], 10);
		sizes.push({
			path: match[2],
			sizeBytes,
			sizeFormatted: formatBytesZfs(sizeBytes),
		});
	}

	// Sort by size descending and limit to 50 results (done in JS instead of shell)
	return sizes.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 50);
}

// === ZFS AI Tools ===

export const getZfsPoolsTool = withTool(
	{
		name: "get_zfs_pools",
		description:
			"Get ZFS pool overview including health status, capacity, and fragmentation. Use when user asks about storage health, pool status, or disk space.",
		input: z.object({}),
	},
	async () => {
		const pools = await getZfsPools();
		return pools.map((p) => ({
			name: p.name,
			health: p.health,
			capacity: `${p.capacity}% used`,
			size: p.sizeFormatted,
			used: p.allocatedFormatted,
			free: p.freeFormatted,
			fragmentation: `${p.fragmentation}%`,
		}));
	}
);

export const getZfsPoolStatusTool = withTool(
	{
		name: "get_zfs_pool_status",
		description:
			"Get detailed ZFS pool status including drive health, scrub status, and errors. Use when investigating storage issues, checking drive health, or monitoring scrub progress.",
		input: z.object({
			pool: z.string().describe("Name of the ZFS pool (e.g., 'tank')"),
		}),
	},
	async ({ pool }) => {
		const status = await getZfsPoolStatus(pool);
		if (!status) {
			return { error: `Pool '${pool}' not found or inaccessible` };
		}

		return {
			name: status.name,
			state: status.state,
			status: status.status,
			action: status.action,
			scrub: {
				state: status.scan.state,
				progress: status.scan.progress ? `${status.scan.progress}%` : undefined,
				lastCompleted: status.scan.lastCompleted,
				errors: status.scan.errors,
				duration: status.scan.duration,
			},
			vdevs: status.vdevs.map((v) => ({
				type: v.type,
				state: v.state,
				drives: v.drives.map((d) => ({
					name: d.name.split("/").pop(), // Shorten disk-by-id paths
					state: d.state,
					errors: d.read + d.write + d.cksum > 0 ? `R:${d.read} W:${d.write} C:${d.cksum}` : "none",
				})),
			})),
			errors: status.errors,
		};
	}
);

export const getZfsDatasetsTool = withTool(
	{
		name: "get_zfs_datasets",
		description:
			"Get ZFS dataset usage including compression ratios. Use when checking storage usage per dataset, seeing what's using space, or monitoring compression effectiveness.",
		input: z.object({}),
	},
	async () => {
		const datasets = await getZfsDatasets();
		return datasets.map((d) => ({
			name: d.name,
			used: d.usedFormatted,
			available: d.availableFormatted,
			compression: `${d.compressRatio}x`,
			mountpoint: d.mountpoint,
		}));
	}
);

export const getZfsIostatTool = withTool(
	{
		name: "get_zfs_iostat",
		description:
			"Get current ZFS pool I/O statistics including read/write operations and bandwidth. Use when monitoring storage performance or investigating slow I/O.",
		input: z.object({
			pool: z.string().describe("Name of the ZFS pool (e.g., 'tank')"),
		}),
	},
	async ({ pool }) => {
		const iostat = await getZfsIostat(pool);
		if (!iostat) {
			return { error: `Pool '${pool}' not found or inaccessible` };
		}

		return {
			pool: iostat.pool,
			operations: {
				read: `${iostat.readOps}/s`,
				write: `${iostat.writeOps}/s`,
			},
			bandwidth: {
				read: iostat.readBandwidthFormatted,
				write: iostat.writeBandwidthFormatted,
			},
		};
	}
);

export const getDirectorySizesTool = withTool(
	{
		name: "get_directory_sizes",
		description:
			"Get sizes of directories within a path (like 'du -sh'). Use when checking what's using space in /tank or /srv, finding large directories, or investigating disk usage.",
		input: z.object({
			path: z.string().describe("Path to analyze (must start with /tank or /srv)"),
			depth: z.number().optional().describe("Directory depth to scan (1-5, default: 2)"),
		}),
	},
	async ({ path, depth = 2 }) => {
		const sizes = await getDirectorySizes(path, depth);
		if (sizes.length === 0) {
			return { error: `No data for path '${path}' or path not allowed` };
		}

		return sizes.map((s) => ({
			path: s.path,
			size: s.sizeFormatted,
		}));
	}
);

export const zfsTools = [
	getZfsPoolsTool.tool,
	getZfsPoolStatusTool.tool,
	getZfsDatasetsTool.tool,
	getZfsIostatTool.tool,
	getDirectorySizesTool.tool,
];

export const systemInfoTools = [getSystemStatsTool.tool, getDrivesTool.tool, ...zfsTools];
