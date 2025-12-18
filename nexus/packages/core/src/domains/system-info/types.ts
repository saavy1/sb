import { t } from "elysia";

// === Internal schemas (not exposed via API) ===

export const CpuTimes = t.Object({
	user: t.Number(),
	nice: t.Number(),
	sys: t.Number(),
	idle: t.Number(),
	irq: t.Number(),
});
export type CpuTimesType = typeof CpuTimes.static;

export const NetInterfaceSample = t.Object({
	rx: t.Number(),
	tx: t.Number(),
});
export type NetInterfaceSampleType = typeof NetInterfaceSample.static;

export const RawSample = t.Object({
	timestamp: t.Number(),
	cpuTimes: t.Array(CpuTimes),
	diskReads: t.Number(),
	diskWrites: t.Number(),
	netRx: t.Number(),
	netTx: t.Number(),
});
export type RawSampleType = typeof RawSample.static & {
	netInterfaces: Map<string, NetInterfaceSampleType>;
};

export const MountInfo = t.Object({
	path: t.String(),
	filesystem: t.String(),
	total: t.Number(),
	used: t.Number(),
	available: t.Number(),
	usagePercent: t.Number(),
});
export type MountInfoType = typeof MountInfo.static;

// === API schemas (shared with frontend via Eden Treaty) ===
export const Drive = t.Object({
	id: t.String(),
	path: t.String(),
	label: t.String(),
	expectedCapacity: t.Nullable(t.Number()),
	createdAt: t.Date(),
	updatedAt: t.Date(),
});

export const DriveWithStats = t.Object({
	id: t.String(),
	path: t.String(),
	label: t.String(),
	expectedCapacity: t.Nullable(t.Number()),
	createdAt: t.Date(),
	updatedAt: t.Date(),
	// Current stats (only present if drive is mounted)
	mounted: t.Boolean(),
	used: t.Optional(t.Number()), // GB
	total: t.Optional(t.Number()), // GB
	available: t.Optional(t.Number()), // GB
	usagePercent: t.Optional(t.Number()),
});

export const CpuCore = t.Object({
	core: t.Number(),
	usage: t.Number(), // percentage 0-100
});

export const CpuStats = t.Object({
	usage: t.Number(), // overall percentage
	coreCount: t.Number(),
	cores: t.Array(CpuCore),
	model: t.String(),
	speed: t.Number(), // current MHz
});

export const MemoryStats = t.Object({
	used: t.Number(), // GB
	total: t.Number(), // GB
	available: t.Number(), // GB
	cached: t.Number(), // GB
	usagePercent: t.Number(),
});

export const DiskStats = t.Object({
	readSpeed: t.Number(), // MB/s
	writeSpeed: t.Number(), // MB/s
});

export const NetworkInterface = t.Object({
	name: t.String(),
	rxSpeed: t.Number(), // MB/s download
	txSpeed: t.Number(), // MB/s upload
});

export const NetworkStats = t.Object({
	interfaces: t.Array(NetworkInterface),
	totalRxSpeed: t.Number(), // MB/s
	totalTxSpeed: t.Number(), // MB/s
});

export const GpuStats = t.Object({
	available: t.Boolean(),
	name: t.Optional(t.String()),
	usage: t.Optional(t.Number()), // percentage 0-100
	memoryUsed: t.Optional(t.Number()), // MB
	memoryTotal: t.Optional(t.Number()), // MB
	temperature: t.Optional(t.Number()), // Celsius
});

export const SystemStats = t.Object({
	cpu: CpuStats,
	memory: MemoryStats,
	disk: DiskStats,
	network: NetworkStats,
	gpu: GpuStats,
	uptime: t.Object({
		seconds: t.Number(),
		formatted: t.String(),
	}),
});

export const DatabaseInfo = t.Object({
	name: t.String(),
	domain: t.String(),
	sizeBytes: t.Number(),
	sizeFormatted: t.String(),
	rowCount: t.Number(),
});

export const SystemOverview = t.Object({
	drives: t.Array(DriveWithStats),
	stats: SystemStats,
	databases: t.Array(DatabaseInfo),
});

export const CreateDriveRequest = t.Object({
	path: t.String(),
	label: t.String(),
	expectedCapacity: t.Optional(t.Number()),
});

export const UpdateDriveRequest = t.Object({
	label: t.Optional(t.String()),
	expectedCapacity: t.Optional(t.Number()),
});

export const DriveIdParam = t.Object({
	id: t.String(),
});

export const SuggestedDrive = t.Object({
	path: t.String(),
	suggestedLabel: t.String(),
	total: t.Number(), // GB
	filesystem: t.String(),
});

export const ApiError = t.Object({
	error: t.String(),
});

// === ZFS schemas ===

export const ZfsPoolHealth = t.Union([
	t.Literal("ONLINE"),
	t.Literal("DEGRADED"),
	t.Literal("FAULTED"),
	t.Literal("OFFLINE"),
	t.Literal("UNAVAIL"),
	t.Literal("REMOVED"),
]);
export type ZfsPoolHealthType = typeof ZfsPoolHealth.static;

export const ZfsPool = t.Object({
	name: t.String(),
	health: ZfsPoolHealth,
	size: t.Number(), // bytes
	allocated: t.Number(), // bytes
	free: t.Number(), // bytes
	fragmentation: t.Number(), // percentage
	capacity: t.Number(), // percentage used
	sizeFormatted: t.String(),
	allocatedFormatted: t.String(),
	freeFormatted: t.String(),
});
export type ZfsPoolType = typeof ZfsPool.static;

export const ZfsDriveStatus = t.Object({
	name: t.String(),
	state: t.String(), // ONLINE, DEGRADED, FAULTED, etc.
	read: t.Number(), // error count
	write: t.Number(), // error count
	cksum: t.Number(), // checksum error count
});
export type ZfsDriveStatusType = typeof ZfsDriveStatus.static;

export const ZfsVdev = t.Object({
	type: t.String(), // raidz2, mirror, etc.
	state: t.String(),
	drives: t.Array(ZfsDriveStatus),
});
export type ZfsVdevType = typeof ZfsVdev.static;

export const ZfsScrubStatus = t.Object({
	state: t.Union([t.Literal("none"), t.Literal("scrubbing"), t.Literal("completed")]),
	progress: t.Optional(t.Number()), // percentage if scrubbing
	scanned: t.Optional(t.String()),
	issued: t.Optional(t.String()),
	speed: t.Optional(t.String()),
	errors: t.Number(),
	lastCompleted: t.Optional(t.String()), // date string
	duration: t.Optional(t.String()),
});
export type ZfsScrubStatusType = typeof ZfsScrubStatus.static;

export const ZfsPoolStatus = t.Object({
	name: t.String(),
	state: t.String(),
	status: t.Optional(t.String()), // status message if any
	action: t.Optional(t.String()), // recommended action if any
	scan: ZfsScrubStatus,
	vdevs: t.Array(ZfsVdev),
	errors: t.String(), // "No known data errors" or error description
});
export type ZfsPoolStatusType = typeof ZfsPoolStatus.static;

export const ZfsDataset = t.Object({
	name: t.String(),
	used: t.Number(), // bytes
	available: t.Number(), // bytes
	referenced: t.Number(), // bytes
	compressRatio: t.Number(), // e.g., 1.5 means 1.5x compression
	mountpoint: t.String(),
	usedFormatted: t.String(),
	availableFormatted: t.String(),
});
export type ZfsDatasetType = typeof ZfsDataset.static;

export const ZfsIostat = t.Object({
	pool: t.String(),
	readOps: t.Number(), // operations per second
	writeOps: t.Number(),
	readBandwidth: t.Number(), // bytes per second
	writeBandwidth: t.Number(),
	readBandwidthFormatted: t.String(),
	writeBandwidthFormatted: t.String(),
});
export type ZfsIostatType = typeof ZfsIostat.static;

export const DirectorySize = t.Object({
	path: t.String(),
	sizeBytes: t.Number(),
	sizeFormatted: t.String(),
});
export type DirectorySizeType = typeof DirectorySize.static;

export const DriveSmartStatus = t.Object({
	device: t.String(),
	model: t.String(),
	serial: t.String(),
	healthy: t.Boolean(),
	temperature: t.Optional(t.Number()), // Celsius
	powerOnHours: t.Optional(t.Number()),
	reallocatedSectors: t.Optional(t.Number()),
	pendingSectors: t.Optional(t.Number()),
	uncorrectableSectors: t.Optional(t.Number()),
});
