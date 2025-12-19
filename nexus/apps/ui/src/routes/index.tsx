import type { GameServerType } from "@nexus/core/domains/game-servers";
import type {
	QdrantInfoType,
	StorageEntryType,
	StorageRootTypeT,
	ZfsPoolStatusType,
} from "@nexus/core/domains/system-info";
import type { MinecraftStatusPayloadType } from "@nexus/core/infra/events";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	AlertTriangle,
	Boxes,
	CheckCircle,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	Clock,
	Database,
	Folder,
	HardDrive,
	Loader2,
	Play,
	Plus,
	RefreshCw,
	Server,
	Shield,
	Square,
	Trash2,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CreateServerDialog } from "../components/CreateServerDialog";
import { Panel, SkeletonStats, Sparkline, StatusDot } from "../components/ui";
import { client } from "../lib/api";
import { useConnection } from "../lib/ConnectionContext";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/")({
	component: HomePage,
});

type QueueStats = {
	name: string;
	queue?: string;
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
};

function HomePage() {
	const { connected, systemInfo, cpuHistory, memHistory } = useConnection();
	const [currentTime, setCurrentTime] = useState(new Date());

	// Game Servers
	const [servers, setServers] = useState<GameServerType[]>([]);
	const [mcStatus, setMcStatus] = useState<MinecraftStatusPayloadType | null>(null);
	const [showCreateDialog, setShowCreateDialog] = useState(false);

	// Storage - new unified API
	const [storageRoots, setStorageRoots] = useState<StorageRootTypeT[]>([]);
	const [storageLoading, setStorageLoading] = useState(true);
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());
	const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set());
	const [showNetDetails, setShowNetDetails] = useState(false);

	// Data Stores
	const [qdrantInfo, setQdrantInfo] = useState<QdrantInfoType | null>(null);
	const [expandedDataStores, setExpandedDataStores] = useState(false);

	// ZFS Health
	const [zfsPoolStatus, setZfsPoolStatus] = useState<ZfsPoolStatusType | null>(null);
	const [zfsLoading, setZfsLoading] = useState(true);

	// Queues
	const [queues, setQueues] = useState<QueueStats[]>([]);
	const [expandedQueue, setExpandedQueue] = useState<string | null>(null);

	// Refs for WebSocket callbacks
	const fetchQueuesRef = useRef<() => void>(undefined);

	// WebSocket subscriptions
	useEvents("minecraft:status", (payload) => setMcStatus(payload));
	useEvents("queue:stats:updated", (stats) => {
		const queueName = stats.queue;
		setQueues((prev) => {
			const exists = prev.some((q) => q.name === queueName);
			if (exists) {
				return prev.map((q) => (q.name === queueName ? { ...stats, name: queueName } : q));
			}
			return [...prev, { ...stats, name: queueName }];
		});
	});

	// Clock update
	useEffect(() => {
		const interval = setInterval(() => setCurrentTime(new Date()), 1000);
		return () => clearInterval(interval);
	}, []);

	// Fetch functions
	const fetchServers = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.get();
			if (Array.isArray(data)) setServers(data);
		} catch (error) {
			console.error("Failed to fetch servers:", error);
		}
	}, []);

	const fetchMinecraftStatus = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.minecraft.status.get();
			if (data) setMcStatus(data as MinecraftStatusPayloadType);
		} catch (error) {
			console.error("Failed to fetch Minecraft status:", error);
		}
	}, []);

	const fetchStorage = useCallback(async () => {
		setStorageLoading(true);
		try {
			const { data } = await client.api.systemInfo.storage.get({ query: { depth: "3" } });
			if (data?.roots) setStorageRoots(data.roots as StorageRootTypeT[]);
		} catch (error) {
			console.error("Failed to fetch storage:", error);
		} finally {
			setStorageLoading(false);
		}
	}, []);

	const fetchQdrantInfo = useCallback(async () => {
		try {
			const { data } = await client.api.systemInfo.qdrant.get();
			if (data) setQdrantInfo(data);
		} catch (error) {
			console.error("Failed to fetch Qdrant info:", error);
		}
	}, []);

	const fetchZfsHealth = useCallback(async () => {
		setZfsLoading(true);
		try {
			// Get pool status for "tank" - could make this dynamic later
			const { data } = await client.api.systemInfo.zfs.pools({ name: "tank" }).status.get();
			if (data && "name" in data) setZfsPoolStatus(data as ZfsPoolStatusType);
		} catch (error) {
			console.error("Failed to fetch ZFS health:", error);
		} finally {
			setZfsLoading(false);
		}
	}, []);

	const fetchQueues = useCallback(async () => {
		try {
			const { data, error } = await client.api.debug.queues.get();
			if (error) throw error;
			if (data?.queues) setQueues(data.queues);
		} catch {
			console.error("Failed to fetch queues");
		}
	}, []);

	useEffect(() => {
		fetchQueuesRef.current = fetchQueues;
	}, [fetchQueues]);

	// Initial fetch
	useEffect(() => {
		fetchServers();
		fetchMinecraftStatus();
		fetchStorage();
		fetchQdrantInfo();
		fetchZfsHealth();
		fetchQueues();
	}, [
		fetchServers,
		fetchMinecraftStatus,
		fetchStorage,
		fetchQdrantInfo,
		fetchZfsHealth,
		fetchQueues,
	]);

	// Lazy-load deeper storage paths
	const loadStoragePath = useCallback(
		async (path: string) => {
			if (loadingPaths.has(path)) return;

			setLoadingPaths((prev) => new Set(prev).add(path));
			try {
				const { data } = await client.api.systemInfo.storage.explore.get({
					query: { path, depth: "2" },
				});

				if (data?.children) {
					// Update the tree with new children
					setStorageRoots((roots) =>
						roots.map((root) => updateTreeChildren(root, path, data.children as StorageEntryType[]))
					);
				}
			} catch (error) {
				console.error("Failed to load path:", path, error);
			} finally {
				setLoadingPaths((prev) => {
					const next = new Set(prev);
					next.delete(path);
					return next;
				});
			}
		},
		[loadingPaths]
	);

	// Toggle path expansion
	const togglePath = useCallback(
		(path: string, hasPreloadedChildren: boolean) => {
			setExpandedPaths((prev) => {
				const next = new Set(prev);
				if (next.has(path)) {
					next.delete(path);
				} else {
					next.add(path);
					// Fetch deeper children if not preloaded
					if (!hasPreloadedChildren) {
						loadStoragePath(path);
					}
				}
				return next;
			});
		},
		[loadStoragePath]
	);

	// Server actions
	const handleStart = async (name: string) => {
		toast.promise(client.api.gameServers({ name }).start.post(), {
			loading: `Starting ${name}...`,
			success: `${name} started`,
			error: `Failed to start ${name}`,
		});
		setTimeout(fetchServers, 500);
	};

	const handleStop = async (name: string) => {
		toast.promise(client.api.gameServers({ name }).stop.post(), {
			loading: `Stopping ${name}...`,
			success: `${name} stopped`,
			error: `Failed to stop ${name}`,
		});
		setTimeout(fetchServers, 500);
	};

	const handleDeleteServer = async (name: string) => {
		if (!confirm(`Delete server "${name}"?`)) return;
		toast.promise(client.api.gameServers({ name }).delete(), {
			loading: `Deleting ${name}...`,
			success: `${name} deleted`,
			error: `Failed to delete ${name}`,
		});
		setTimeout(fetchServers, 500);
	};

	const stats = systemInfo?.stats;
	const databases = systemInfo?.databases ?? [];

	// Alert conditions
	const cpuAlert = stats && stats.cpu.usage > 90;
	const memAlert = stats && stats.memory.usagePercent > 90;
	const storageAlert = storageRoots.some((r) => r.usagePercent > 85);
	const hasAlerts = cpuAlert || memAlert || storageAlert;

	// Helpers
	const formatBytes = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
	};

	const totalDbSize = databases.reduce((sum, db) => sum + db.sizeBytes, 0);
	const runningServers = servers.filter((s) => s.status === "running").length;
	const totalQueueJobs = queues.reduce((sum, q) => sum + q.waiting + q.active + q.delayed, 0);
	const failedJobs = queues.reduce((sum, q) => sum + q.failed, 0);

	return (
		<div className="space-y-4">
			{/* System Stats Strip */}
			<div className="bg-surface border border-border rounded text-xs">
				<div className="flex items-center justify-between px-3 py-2">
					<div className="flex items-center gap-4 md:gap-6 flex-wrap">
						{stats ? (
							<>
								<StatWithGraph
									label="CPU"
									value={stats.cpu.usage}
									history={cpuHistory}
									alert={cpuAlert}
								/>
								{stats.gpu?.available && stats.gpu.usage !== undefined && (
									<Stat label="GPU" value={`${stats.gpu.usage}%`} />
								)}
								<StatWithGraph
									label="MEM"
									value={stats.memory.usagePercent}
									history={memHistory}
									alert={memAlert}
								/>
								<Stat
									label="DISK"
									value={`↓${stats.disk.readSpeed} ↑${stats.disk.writeSpeed} MB/s`}
									mono
								/>
								<button
									type="button"
									onClick={() => setShowNetDetails(!showNetDetails)}
									className="flex items-center gap-1 hover:text-accent transition-colors"
								>
									<Stat
										label="NET"
										value={`↓${stats.network.totalRxSpeed} ↑${stats.network.totalTxSpeed} MB/s`}
										mono
									/>
									{stats.network.interfaces.length > 0 &&
										(showNetDetails ? <ChevronUp size={10} /> : <ChevronDown size={10} />)}
								</button>
								<Stat label="UP" value={stats.uptime.formatted} />
							</>
						) : (
							<SkeletonStats />
						)}
					</div>
					<div className="flex items-center gap-3">
						{hasAlerts && (
							<span className="text-warning flex items-center gap-1" title="System alert">
								<AlertTriangle size={12} />
							</span>
						)}
						<span className="text-text-tertiary tabular-nums hidden sm:inline">
							{currentTime.toLocaleTimeString("en-US", { hour12: false })}
						</span>
						<div className="flex items-center gap-1.5">
							<span
								className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-success" : "bg-text-tertiary"}`}
							/>
							<span className={connected ? "text-success" : "text-text-tertiary"}>
								{connected ? "live" : "offline"}
							</span>
						</div>
					</div>
				</div>
				{showNetDetails && stats?.network.interfaces && stats.network.interfaces.length > 0 && (
					<div className="border-t border-border px-3 py-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
						{stats.network.interfaces.map((iface) => (
							<div
								key={iface.name}
								className="flex items-center justify-between text-text-secondary"
							>
								<span className="truncate">{iface.name}</span>
								<span className="text-text-tertiary tabular-nums ml-2">
									↓{iface.rxSpeed} ↑{iface.txSpeed}
								</span>
							</div>
						))}
					</div>
				)}
			</div>

			{/* Main Grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Storage Panel - New Unified Tree */}
				<Panel
					title="Storage"
					actions={
						<button
							type="button"
							onClick={fetchStorage}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} className={storageLoading ? "animate-spin" : ""} />
						</button>
					}
				>
					{storageLoading && storageRoots.length === 0 ? (
						<div className="text-center py-4 text-text-tertiary text-sm">Loading storage...</div>
					) : storageRoots.length === 0 ? (
						<div className="text-center py-4 text-text-tertiary text-sm">No storage detected</div>
					) : (
						<div className="space-y-2">
							{storageRoots.map((root) => (
								<StorageRootItem
									key={root.path}
									root={root}
									expandedPaths={expandedPaths}
									loadingPaths={loadingPaths}
									onToggle={togglePath}
								/>
							))}
						</div>
					)}
				</Panel>

				{/* ZFS Health Panel */}
				<Panel
					title="ZFS Health"
					actions={
						<button
							type="button"
							onClick={fetchZfsHealth}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} className={zfsLoading ? "animate-spin" : ""} />
						</button>
					}
				>
					{zfsLoading && !zfsPoolStatus ? (
						<div className="text-center py-4 text-text-tertiary text-sm">Loading...</div>
					) : !zfsPoolStatus ? (
						<div className="text-center py-4 text-text-tertiary text-sm">No ZFS pools found</div>
					) : (
						<div className="space-y-3">
							{/* Pool Status Header */}
							<div className="flex items-center justify-between">
								<div className="flex items-center gap-2">
									<Shield size={14} className="text-text-tertiary" />
									<span className="text-sm font-medium">{zfsPoolStatus.name}</span>
									<span
										className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
											zfsPoolStatus.state === "ONLINE"
												? "bg-success-bg text-success"
												: zfsPoolStatus.state === "DEGRADED"
													? "bg-warning-bg text-warning"
													: "bg-error-bg text-error"
										}`}
									>
										{zfsPoolStatus.state}
									</span>
								</div>
							</div>

							{/* Scrub Status */}
							<div className="text-xs space-y-1">
								<div className="flex items-center justify-between text-text-secondary">
									<span>Last Scrub</span>
									<span className="text-text-tertiary">
										{zfsPoolStatus.scan.state === "scrubbing" ? (
											<span className="text-accent">
												In progress {zfsPoolStatus.scan.progress?.toFixed(1)}%
											</span>
										) : zfsPoolStatus.scan.lastCompleted ? (
											zfsPoolStatus.scan.lastCompleted
										) : (
											"Never"
										)}
									</span>
								</div>
								{zfsPoolStatus.scan.errors > 0 && (
									<div className="flex items-center justify-between text-error">
										<span>Scrub Errors</span>
										<span>{zfsPoolStatus.scan.errors}</span>
									</div>
								)}
							</div>

							{/* Drive Status */}
							{zfsPoolStatus.vdevs.length > 0 && (
								<div className="pt-2 border-t border-border">
									<div className="text-xs text-text-tertiary mb-2">Drives</div>
									<div className="space-y-1">
										{zfsPoolStatus.vdevs.map((vdev, i) => (
											<div key={i} className="text-xs">
												{vdev.type !== "pool" && (
													<div className="text-text-secondary mb-1">
														{vdev.type} - {vdev.state}
													</div>
												)}
												<div className="ml-2 space-y-0.5">
													{vdev.drives.map((drive) => {
														const hasErrors = drive.read + drive.write + drive.cksum > 0;
														return (
															<div
																key={drive.name}
																className={`flex items-center justify-between ${hasErrors ? "text-warning" : "text-text-secondary"}`}
															>
																<span className="truncate max-w-[200px]" title={drive.name}>
																	{drive.name.split("/").pop()}
																</span>
																<span className="text-text-tertiary">
																	{hasErrors
																		? `R:${drive.read} W:${drive.write} C:${drive.cksum}`
																		: drive.state}
																</span>
															</div>
														);
													})}
												</div>
											</div>
										))}
									</div>
								</div>
							)}

							{/* Errors */}
							{zfsPoolStatus.errors !== "No known data errors" && (
								<div className="pt-2 border-t border-border text-xs text-error">
									{zfsPoolStatus.errors}
								</div>
							)}
						</div>
					)}
				</Panel>

				{/* Game Servers Panel */}
				<Panel
					title={`Game Servers${servers.length > 0 ? ` (${runningServers}/${servers.length})` : ""}`}
					actions={
						<>
							<button
								type="button"
								onClick={fetchServers}
								className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
								title="Refresh"
							>
								<RefreshCw size={12} />
							</button>
							<button
								type="button"
								onClick={() => setShowCreateDialog(true)}
								className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
								title="New Server"
							>
								<Plus size={12} />
							</button>
						</>
					}
				>
					{servers.length > 0 ? (
						<div className="space-y-1">
							{servers.map((server) => {
								// Check if this server has MC status
								const isMinecraft = server.gameType === "minecraft" || server.modpack;
								const serverMcStatus = isMinecraft && server.status === "running" ? mcStatus : null;

								return (
									<div
										key={server.id}
										className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded hover:bg-surface-elevated/50 group"
									>
										<div className="flex items-center gap-2 min-w-0 flex-1">
											<StatusDot status={server.status} size="sm" />
											<span className="text-sm truncate">{server.name}</span>
											<span className="text-xs text-text-tertiary hidden sm:inline">
												{server.modpack || server.gameType}
											</span>
											{/* Inline MC status */}
											{serverMcStatus?.online && serverMcStatus.players && (
												<span className="text-xs text-success flex items-center gap-1 ml-auto mr-2">
													<Users size={10} />
													{serverMcStatus.players.online}/{serverMcStatus.players.max}
												</span>
											)}
										</div>
										<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
											{server.status === "stopped" ? (
												<button
													type="button"
													onClick={() => handleStart(server.name)}
													className="p-1 rounded text-success hover:bg-success-bg"
													title="Start"
												>
													<Play size={12} />
												</button>
											) : (
												<button
													type="button"
													onClick={() => handleStop(server.name)}
													className="p-1 rounded text-warning hover:bg-warning-bg"
													title="Stop"
												>
													<Square size={12} />
												</button>
											)}
											<button
												type="button"
												onClick={() => handleDeleteServer(server.name)}
												className="p-1 rounded text-text-tertiary hover:text-error hover:bg-error-bg"
												title="Delete"
											>
												<Trash2 size={12} />
											</button>
										</div>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-center py-4 text-text-tertiary text-sm">
							No servers configured
							<div className="mt-1">
								<button
									type="button"
									onClick={() => setShowCreateDialog(true)}
									className="text-accent hover:underline text-xs"
								>
									Create one
								</button>
							</div>
						</div>
					)}
				</Panel>

				{/* Data Stores Panel */}
				<Panel
					title="Data Stores"
					actions={
						<button
							type="button"
							onClick={() => setExpandedDataStores(!expandedDataStores)}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
						>
							{expandedDataStores ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
						</button>
					}
				>
					<div className="space-y-2">
						{/* Postgres Summary */}
						<div>
							<button
								type="button"
								onClick={() => setExpandedDataStores(!expandedDataStores)}
								className="w-full flex items-center justify-between py-1 hover:text-accent transition-colors"
							>
								<div className="flex items-center gap-2">
									<Database size={14} className="text-text-tertiary" />
									<span className="text-sm">PostgreSQL</span>
									<span className="text-xs text-text-tertiary">{databases.length} dbs</span>
								</div>
								<span className="text-xs text-text-tertiary tabular-nums">
									{formatBytes(totalDbSize)}
								</span>
							</button>
							{expandedDataStores && databases.length > 0 && (
								<div className="mt-2 ml-6 space-y-1">
									{databases.map((db) => (
										<div
											key={db.name}
											className="flex items-center justify-between text-xs text-text-secondary"
										>
											<span>{db.domain}</span>
											<span className="text-text-tertiary tabular-nums">
												{db.sizeFormatted} · {db.rowCount?.toLocaleString() ?? 0} rows
											</span>
										</div>
									))}
								</div>
							)}
						</div>

						{/* Qdrant Summary */}
						{qdrantInfo && (
							<div className="pt-2 border-t border-border">
								<div className="flex items-center justify-between py-1">
									<div className="flex items-center gap-2">
										<Boxes size={14} className="text-text-tertiary" />
										<span className="text-sm">Qdrant</span>
										<span
											className={`w-1.5 h-1.5 rounded-full ${qdrantInfo.healthy ? "bg-success" : "bg-error"}`}
										/>
									</div>
									<span className="text-xs text-text-tertiary tabular-nums">
										{qdrantInfo.totalPoints?.toLocaleString() ?? 0} vectors
									</span>
								</div>
								{expandedDataStores && qdrantInfo.collections.length > 0 && (
									<div className="mt-2 ml-6 space-y-1">
										{qdrantInfo.collections.map((col) => (
											<div
												key={col.name}
												className="flex items-center justify-between text-xs text-text-secondary"
											>
												<span>{col.name}</span>
												<span className="text-text-tertiary tabular-nums">
													{col.pointsCount.toLocaleString()} pts
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
				</Panel>

				{/* Queues Panel */}
				<Panel
					title={`Queues${queues.length > 0 ? ` (${totalQueueJobs} jobs${failedJobs > 0 ? `, ${failedJobs} failed` : ""})` : ""}`}
					actions={
						<button
							type="button"
							onClick={fetchQueues}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} />
						</button>
					}
				>
					{queues.length > 0 ? (
						<div className="space-y-1">
							{queues.map((queue) => (
								<div key={queue.name}>
									<button
										type="button"
										onClick={() =>
											setExpandedQueue(expandedQueue === queue.name ? null : queue.name)
										}
										className="w-full flex items-center justify-between py-1.5 px-2 -mx-2 rounded hover:bg-surface-elevated/50 transition-colors"
									>
										<div className="flex items-center gap-2">
											{expandedQueue === queue.name ? (
												<ChevronDown size={12} />
											) : (
												<ChevronRight size={12} />
											)}
											<span className="text-sm font-mono">{queue.name}</span>
										</div>
										<div className="flex items-center gap-3 text-xs">
											{queue.delayed > 0 && (
												<span className="flex items-center gap-1 text-warning">
													<Clock size={10} />
													{queue.delayed}
												</span>
											)}
											{queue.waiting > 0 && (
												<span className="flex items-center gap-1 text-info">
													<Loader2 size={10} />
													{queue.waiting}
												</span>
											)}
											{queue.active > 0 && (
												<span className="flex items-center gap-1 text-accent">
													<Play size={10} />
													{queue.active}
												</span>
											)}
											{queue.failed > 0 && (
												<span className="flex items-center gap-1 text-error">
													<AlertCircle size={10} />
													{queue.failed}
												</span>
											)}
											{queue.completed > 0 && (
												<span className="flex items-center gap-1 text-success">
													<CheckCircle size={10} />
													{queue.completed}
												</span>
											)}
										</div>
									</button>
									{expandedQueue === queue.name && (
										<div className="ml-6 py-2 grid grid-cols-5 gap-2 text-xs">
											<div className="text-center">
												<div className="text-warning font-bold">{queue.delayed}</div>
												<div className="text-text-tertiary">delayed</div>
											</div>
											<div className="text-center">
												<div className="text-info font-bold">{queue.waiting}</div>
												<div className="text-text-tertiary">waiting</div>
											</div>
											<div className="text-center">
												<div className="text-accent font-bold">{queue.active}</div>
												<div className="text-text-tertiary">active</div>
											</div>
											<div className="text-center">
												<div className="text-success font-bold">{queue.completed}</div>
												<div className="text-text-tertiary">done</div>
											</div>
											<div className="text-center">
												<div className="text-error font-bold">{queue.failed}</div>
												<div className="text-text-tertiary">failed</div>
											</div>
										</div>
									)}
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-4 text-text-tertiary text-sm">No queues</div>
					)}
				</Panel>
			</div>

			{/* Create Server Dialog */}
			<CreateServerDialog
				open={showCreateDialog}
				onClose={() => setShowCreateDialog(false)}
				onCreated={fetchServers}
			/>
		</div>
	);
}

// Storage tree components
function StorageRootItem({
	root,
	expandedPaths,
	loadingPaths,
	onToggle,
}: {
	root: StorageRootTypeT;
	expandedPaths: Set<string>;
	loadingPaths: Set<string>;
	onToggle: (path: string, hasChildren: boolean) => void;
}) {
	const isExpanded = expandedPaths.has(root.path);
	const hasChildren = root.children && root.children.length > 0;
	const isLoading = loadingPaths.has(root.path);

	return (
		<div className="space-y-1">
			{/* Root header */}
			<div className="flex items-center justify-between">
				<button
					type="button"
					onClick={() => onToggle(root.path, !!hasChildren)}
					className="flex items-center gap-2 hover:text-accent transition-colors"
				>
					{isLoading ? (
						<Loader2 size={12} className="animate-spin" />
					) : isExpanded ? (
						<ChevronDown size={12} />
					) : (
						<ChevronRight size={12} />
					)}
					{root.type === "zfs" ? (
						<Server size={14} className="text-text-tertiary" />
					) : (
						<HardDrive size={14} className="text-text-tertiary" />
					)}
					<span className="text-sm font-medium">{root.name}</span>
					{root.health && (
						<span
							className={`text-[10px] px-1 py-0.5 rounded ${
								root.health === "ONLINE"
									? "bg-success-bg text-success"
									: "bg-warning-bg text-warning"
							}`}
						>
							{root.health}
						</span>
					)}
				</button>
				<span className="text-xs text-text-tertiary tabular-nums">
					{root.usedFormatted} / {root.sizeFormatted}
				</span>
			</div>

			{/* Progress bar */}
			<div className="h-1 bg-border rounded-full overflow-hidden">
				<div
					className="h-full transition-all"
					style={{
						width: `${root.usagePercent}%`,
						backgroundColor:
							root.usagePercent > 90
								? "var(--error)"
								: root.usagePercent > 70
									? "var(--warning)"
									: "var(--accent)",
					}}
				/>
			</div>

			{/* Children */}
			{isExpanded && hasChildren && (
				<div className="ml-4 mt-1 space-y-0.5">
					{root.children!.map((child) => (
						<StorageEntryItem
							key={child.path}
							entry={child}
							depth={1}
							expandedPaths={expandedPaths}
							loadingPaths={loadingPaths}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}
		</div>
	);
}

function StorageEntryItem({
	entry,
	depth,
	expandedPaths,
	loadingPaths,
	onToggle,
}: {
	entry: StorageEntryType;
	depth: number;
	expandedPaths: Set<string>;
	loadingPaths: Set<string>;
	onToggle: (path: string, hasChildren: boolean) => void;
}) {
	const isExpanded = expandedPaths.has(entry.path);
	const hasChildren = entry.children && entry.children.length > 0;
	const isLoading = loadingPaths.has(entry.path);
	const canExpand = depth < 5; // Limit depth

	return (
		<div>
			<div
				className="flex items-center justify-between py-0.5 text-sm text-text-secondary hover:text-text-primary transition-colors"
				style={{ paddingLeft: `${depth * 8}px` }}
			>
				{canExpand ? (
					<button
						type="button"
						onClick={() => onToggle(entry.path, !!hasChildren)}
						className="flex items-center gap-1.5 min-w-0"
					>
						{isLoading ? (
							<Loader2 size={10} className="animate-spin shrink-0" />
						) : isExpanded ? (
							<ChevronDown size={10} className="shrink-0" />
						) : (
							<ChevronRight size={10} className="shrink-0" />
						)}
						<Folder size={10} className="text-text-tertiary shrink-0" />
						<span className="truncate">{entry.name}</span>
					</button>
				) : (
					<div className="flex items-center gap-1.5 min-w-0">
						<span className="w-[10px]" />
						<Folder size={10} className="text-text-tertiary shrink-0" />
						<span className="truncate">{entry.name}</span>
					</div>
				)}
				<span className="text-xs text-text-tertiary tabular-nums ml-2 shrink-0">
					{entry.sizeFormatted}
				</span>
			</div>

			{isExpanded && hasChildren && (
				<div className="space-y-0.5">
					{entry.children!.map((child) => (
						<StorageEntryItem
							key={child.path}
							entry={child}
							depth={depth + 1}
							expandedPaths={expandedPaths}
							loadingPaths={loadingPaths}
							onToggle={onToggle}
						/>
					))}
				</div>
			)}
		</div>
	);
}

// Helper to update tree children at a specific path
function updateTreeChildren(
	root: StorageRootTypeT,
	targetPath: string,
	newChildren: StorageEntryType[]
): StorageRootTypeT {
	if (root.path === targetPath) {
		return { ...root, children: newChildren };
	}

	if (!root.children) return root;

	return {
		...root,
		children: root.children.map((child) => updateEntryChildren(child, targetPath, newChildren)),
	};
}

function updateEntryChildren(
	entry: StorageEntryType,
	targetPath: string,
	newChildren: StorageEntryType[]
): StorageEntryType {
	if (entry.path === targetPath) {
		return { ...entry, children: newChildren };
	}

	if (!entry.children) return entry;

	return {
		...entry,
		children: entry.children.map((child) => updateEntryChildren(child, targetPath, newChildren)),
	};
}

// Helper components
function Stat({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
	return (
		<div className="flex items-center gap-1.5">
			<span className="text-text-tertiary">{label}</span>
			<span className={`tabular-nums ${mono ? "font-mono text-[11px]" : ""}`}>{value}</span>
		</div>
	);
}

function StatWithGraph({
	label,
	value,
	history,
	alert,
}: {
	label: string;
	value: number;
	history: number[];
	alert?: boolean;
}) {
	const color = value > 90 ? "var(--error)" : value > 70 ? "var(--warning)" : "var(--accent)";
	return (
		<div className={`flex items-center gap-2 ${alert ? "text-error" : ""}`}>
			<span className={alert ? "text-error" : "text-text-tertiary"}>{label}</span>
			<span className={`tabular-nums w-8 ${alert ? "text-error font-semibold" : ""}`}>
				{value}%
			</span>
			{history.length > 1 && <Sparkline data={history} width={40} height={14} color={color} />}
		</div>
	);
}
