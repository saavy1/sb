import { readFileSync } from "node:fs";
import os from "node:os";
import { $ } from "bun";
import { eq } from "drizzle-orm";
import type { Static } from "elysia";
import logger from "logger";
import { systemInfoDb } from "../../infra/db";
import type { DriveRecord } from "./schema";
import { drives } from "./schema";
import type {
	CpuStats,
	DiskStats,
	GpuStats,
	MemoryStats,
	NetworkStats,
	SystemStats,
} from "./types";

interface MountInfo {
	path: string;
	filesystem: string;
	total: number;
	used: number;
	available: number;
	usagePercent: number;
}

// Raw sample for delta calculations
interface RawSample {
	timestamp: number;
	cpuTimes: Array<{ user: number; nice: number; sys: number; idle: number; irq: number }>;
	diskReads: number;
	diskWrites: number;
	netRx: number;
	netTx: number;
}

class SystemInfoService {
	private static ALLOWED_FILESYSTEMS = new Set([
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

	// Rolling previous sample for delta calculations
	private lastSample: RawSample | null = null;

	/**
	 * Take a raw sample of system metrics
	 */
	private takeSample(): RawSample {
		const cpus = os.cpus();
		const cpuTimes = cpus.map((cpu) => cpu.times);

		// Read disk stats from /proc/diskstats
		let diskReads = 0;
		let diskWrites = 0;
		try {
			const diskstats = readFileSync("/proc/diskstats", "utf-8");
			for (const line of diskstats.split("\n")) {
				const parts = line.trim().split(/\s+/);
				if (parts.length < 14) continue;
				const device = parts[2];
				// Only count real disks (sda, nvme0n1, etc), not partitions
				if (/^(sd[a-z]|nvme\d+n\d+|vd[a-z])$/.test(device)) {
					diskReads += parseInt(parts[5], 10) * 512; // sectors read * 512 bytes
					diskWrites += parseInt(parts[9], 10) * 512; // sectors written * 512 bytes
				}
			}
		} catch {
			// /proc/diskstats not available (e.g., macOS)
		}

		// Read network stats from /proc/net/dev
		let netRx = 0;
		let netTx = 0;
		try {
			const netdev = readFileSync("/proc/net/dev", "utf-8");
			for (const line of netdev.split("\n").slice(2)) {
				const parts = line.trim().split(/\s+/);
				if (parts.length < 10) continue;
				const iface = parts[0].replace(":", "");
				// Skip loopback
				if (iface === "lo") continue;
				netRx += parseInt(parts[1], 10);
				netTx += parseInt(parts[9], 10);
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
		};
	}

	/**
	 * Get system stats with delta-based calculations
	 */
	async getSystemStats(): Promise<Static<typeof SystemStats>> {
		const current = this.takeSample();
		const previous = this.lastSample;
		this.lastSample = current;

		const deltaMs = previous ? current.timestamp - previous.timestamp : 1000;
		const deltaSec = deltaMs / 1000;

		return {
			cpu: this.calculateCpuStats(current, previous),
			memory: this.getMemoryStats(),
			disk: this.calculateDiskStats(current, previous, deltaSec),
			network: this.calculateNetworkStats(current, previous, deltaSec),
			gpu: await this.getGpuStats(),
		};
	}

	private async getGpuStats(): Promise<Static<typeof GpuStats>> {
		// Try AMD GPU first (via sysfs)
		const amdStats = await this.getAmdGpuStats();
		if (amdStats) return amdStats;

		// Try Intel GPU
		const intelStats = await this.getIntelGpuStats();
		if (intelStats) return intelStats;

		// Try NVIDIA GPU
		const nvidiaStats = await this.getNvidiaGpuStats();
		if (nvidiaStats) return nvidiaStats;

		return { available: false };
	}

	private async getAmdGpuStats(): Promise<Static<typeof GpuStats> | null> {
		try {
			const { readdirSync, readFileSync: readSync } = await import("node:fs");
			const cards = readdirSync("/sys/class/drm").filter((d) => /^card\d+$/.test(d));

			for (const card of cards) {
				const devicePath = `/sys/class/drm/${card}/device`;

				// Check if it's an AMD GPU
				try {
					const vendor = readSync(`${devicePath}/vendor`, "utf-8").trim();
					if (vendor !== "0x1002") continue; // 0x1002 = AMD
				} catch {
					continue;
				}

				// Get GPU usage
				let usage: number | undefined;
				try {
					usage = parseInt(readSync(`${devicePath}/gpu_busy_percent`, "utf-8").trim(), 10);
				} catch {}

				// Get VRAM usage
				let memoryUsed: number | undefined;
				let memoryTotal: number | undefined;
				try {
					memoryUsed = Math.round(
						parseInt(readSync(`${devicePath}/mem_info_vram_used`, "utf-8").trim(), 10) / 1024 / 1024
					);
					memoryTotal = Math.round(
						parseInt(readSync(`${devicePath}/mem_info_vram_total`, "utf-8").trim(), 10) /
							1024 /
							1024
					);
				} catch {}

				// Get temperature from hwmon
				let temperature: number | undefined;
				try {
					const hwmons = readdirSync(`${devicePath}/hwmon`);
					for (const hwmon of hwmons) {
						try {
							const temp = parseInt(
								readSync(`${devicePath}/hwmon/${hwmon}/temp1_input`, "utf-8").trim(),
								10
							);
							temperature = Math.round(temp / 1000);
							break;
						} catch {}
					}
				} catch {}

				// Get GPU name
				let name = "AMD GPU";
				try {
					const productName = readSync(`${devicePath}/product_name`, "utf-8").trim();
					if (productName) name = productName;
				} catch {
					try {
						// Try reading from uevent
						const uevent = readSync(`${devicePath}/uevent`, "utf-8");
						const match = uevent.match(/PCI_SLOT_NAME=(.+)/);
						if (match) name = `AMD GPU (${match[1]})`;
					} catch {}
				}

				return {
					available: true,
					name,
					usage,
					memoryUsed,
					memoryTotal,
					temperature,
				};
			}
		} catch {}
		return null;
	}

	private async getIntelGpuStats(): Promise<Static<typeof GpuStats> | null> {
		try {
			const { readdirSync, readFileSync: readSync } = await import("node:fs");
			const cards = readdirSync("/sys/class/drm").filter((d) => /^card\d+$/.test(d));

			for (const card of cards) {
				const devicePath = `/sys/class/drm/${card}/device`;

				// Check if it's an Intel GPU
				try {
					const vendor = readSync(`${devicePath}/vendor`, "utf-8").trim();
					if (vendor !== "0x8086") continue; // 0x8086 = Intel
				} catch {
					continue;
				}

				// Get temperature from hwmon
				let temperature: number | undefined;
				try {
					const hwmons = readdirSync(`${devicePath}/hwmon`);
					for (const hwmon of hwmons) {
						try {
							const temp = parseInt(
								readSync(`${devicePath}/hwmon/${hwmon}/temp1_input`, "utf-8").trim(),
								10
							);
							temperature = Math.round(temp / 1000);
							break;
						} catch {}
					}
				} catch {}

				// Intel doesn't expose usage easily via sysfs, try intel_gpu_top
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
					// Try to get a better name from lspci or similar
					const result = await $`lspci -d 8086: -nn`.text();
					const match = result.match(/VGA.*:\s*(.+?)(?:\s*\[|$)/m);
					if (match) name = match[1].trim();
				} catch {}

				return {
					available: true,
					name,
					usage,
					temperature,
				};
			}
		} catch {}
		return null;
	}

	private async getNvidiaGpuStats(): Promise<Static<typeof GpuStats> | null> {
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

	private calculateCpuStats(
		current: RawSample,
		previous: RawSample | null
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

	private getMemoryStats(): Static<typeof MemoryStats> {
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
			// Fallback to os module
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

	private calculateDiskStats(
		current: RawSample,
		previous: RawSample | null,
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

	private calculateNetworkStats(
		current: RawSample,
		previous: RawSample | null,
		deltaSec: number
	): Static<typeof NetworkStats> {
		if (!previous || deltaSec <= 0) {
			return { interfaces: [], totalRxSpeed: 0, totalTxSpeed: 0 };
		}

		const rxBytes = current.netRx - previous.netRx;
		const txBytes = current.netTx - previous.netTx;

		const totalRxSpeed = Math.round((rxBytes / deltaSec / 1024 / 1024) * 10) / 10;
		const totalTxSpeed = Math.round((txBytes / deltaSec / 1024 / 1024) * 10) / 10;

		// For now, just report totals - could expand to per-interface later
		return {
			interfaces: [],
			totalRxSpeed,
			totalTxSpeed,
		};
	}

	// === Drive management methods (unchanged) ===

	async scanMounts(): Promise<MountInfo[]> {
		try {
			const result = await $`df -B G -T -l`.text();
			const lines = result.trim().split("\n").slice(1);
			const mounts: MountInfo[] = [];

			for (const line of lines) {
				const parts = line.split(/\s+/);
				if (parts.length < 7) continue;

				const [_fs, fsType, totalStr, usedStr, availStr, percentStr, ...mountParts] = parts;
				const mountPoint = mountParts.join(" ");

				if (!SystemInfoService.ALLOWED_FILESYSTEMS.has(fsType)) continue;
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

	async getSuggestedDrives() {
		const mounts = await this.scanMounts();
		const registeredDrives = await systemInfoDb.select().from(drives);
		const registeredPaths = new Set(registeredDrives.map((d) => d.path));

		return mounts
			.filter((mount) => !registeredPaths.has(mount.path))
			.map((mount) => ({
				path: mount.path,
				suggestedLabel: this.generateLabel(mount.path),
				total: mount.total,
				filesystem: mount.filesystem,
			}));
	}

	private generateLabel(path: string): string {
		if (path === "/") return "System";
		if (path.startsWith("/mnt/")) return path.replace("/mnt/", "").split("/")[0];
		if (path.startsWith("/media/")) return path.replace("/media/", "").split("/")[0];
		const parts = path.split("/").filter(Boolean);
		return parts[parts.length - 1] || "Drive";
	}

	async getMountStats(path: string): Promise<MountInfo | null> {
		const mounts = await this.scanMounts();
		return mounts.find((m) => m.path === path) || null;
	}

	async listDrivesWithStats() {
		const registeredDrives = await systemInfoDb.select().from(drives);
		const mounts = await this.scanMounts();
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

	async createDrive(data: { path: string; label: string; expectedCapacity?: number }) {
		const id = crypto.randomUUID().slice(0, 8);
		const now = new Date().toISOString();
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

	async updateDrive(id: string, data: { label?: string; expectedCapacity?: number }) {
		const now = new Date().toISOString();
		await systemInfoDb
			.update(drives)
			.set({ ...data, updatedAt: now })
			.where(eq(drives.id, id));
		const updated = await systemInfoDb.select().from(drives).where(eq(drives.id, id));
		return updated[0] || null;
	}

	async deleteDrive(id: string) {
		await systemInfoDb.delete(drives).where(eq(drives.id, id));
	}

	async getDrive(id: string) {
		const result = await systemInfoDb.select().from(drives).where(eq(drives.id, id));
		return result[0] || null;
	}

	async getSystemOverview() {
		const [drivesWithStats, stats] = await Promise.all([
			this.listDrivesWithStats(),
			this.getSystemStats(),
		]);
		return { drives: drivesWithStats, stats };
	}
}

export const systemInfoService = new SystemInfoService();
