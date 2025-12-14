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
	createdAt: t.String(),
	updatedAt: t.String(),
});

export const DriveWithStats = t.Object({
	id: t.String(),
	path: t.String(),
	label: t.String(),
	expectedCapacity: t.Nullable(t.Number()),
	createdAt: t.String(),
	updatedAt: t.String(),
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
