import type { GameServerType } from "@nexus/core/domains/game-servers";
import type {
	DirectorySizeType,
	QdrantInfoType,
	ZfsPoolStatusType,
	ZfsPoolType,
} from "@nexus/core/domains/system-info";
import type { MinecraftStatusPayloadType } from "@nexus/core/infra/events";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	Boxes,
	CheckCircle2,
	ChevronDown,
	ChevronUp,
	Database,
	Folder,
	HardDrive,
	Loader2,
	Play,
	Plus,
	RefreshCw,
	Server,
	Square,
	Trash2,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Panel, SkeletonStats, Sparkline, StatusDot } from "../components/ui";
import { client } from "../lib/api";
import { useConnection } from "../lib/ConnectionContext";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/")({
	component: HomePage,
});

// Drive suggestions don't have a shared type yet, so extract from API
type SuggestedDrive = Awaited<
	ReturnType<typeof client.api.systemInfo.drives.suggestions.get>
>["data"];

function HomePage() {
	const { connected, systemInfo, cpuHistory, memHistory } = useConnection();
	const [servers, setServers] = useState<GameServerType[]>([]);
	const [suggestions, setSuggestions] = useState<NonNullable<SuggestedDrive>>([]);
	const [showNetDetails, setShowNetDetails] = useState(false);
	const [currentTime, setCurrentTime] = useState(new Date());
	const [mcStatus, setMcStatus] = useState<MinecraftStatusPayloadType | null>(null);
	const [zfsPools, setZfsPools] = useState<ZfsPoolType[]>([]);
	const [zfsPoolStatus, setZfsPoolStatus] = useState<ZfsPoolStatusType | null>(null);
	const [directorySizes, setDirectorySizes] = useState<DirectorySizeType[]>([]);
	const [qdrantInfo, setQdrantInfo] = useState<QdrantInfoType | null>(null);

	// Subscribe to Minecraft status events via WebSocket
	useEvents("minecraft:status", (payload) => {
		setMcStatus(payload);
	});

	// Update clock every second
	useEffect(() => {
		const interval = setInterval(() => setCurrentTime(new Date()), 1000);
		return () => clearInterval(interval);
	}, []);

	const fetchServers = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.get();
			if (Array.isArray(data)) setServers(data);
		} catch (error) {
			console.error("Failed to fetch servers:", error);
		}
	}, []);

	const fetchSuggestions = useCallback(async () => {
		try {
			const res = await client.api.systemInfo.drives.suggestions.get();
			if (Array.isArray(res.data)) setSuggestions(res.data);
		} catch (error) {
			console.error("Failed to fetch drive suggestions:", error);
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

	const fetchZfsPools = useCallback(async () => {
		try {
			const { data } = await client.api.systemInfo.zfs.pools.get();
			if (Array.isArray(data)) {
				setZfsPools(data);
				// Fetch detailed status for the first pool (usually "tank")
				if (data.length > 0) {
					const { data: status } = await client.api.systemInfo.zfs
						.pools({ name: data[0].name })
						.status.get();
					setZfsPoolStatus(status);
				}
			}
		} catch (error) {
			console.error("Failed to fetch ZFS pools:", error);
		}
	}, []);

	const fetchDirectorySizes = useCallback(async () => {
		try {
			const { data } = await client.api.systemInfo.zfs.directories.get({
				query: { path: "/tank", depth: "2" },
			});
			if (Array.isArray(data)) {
				setDirectorySizes(data);
			}
		} catch (error) {
			console.error("Failed to fetch directory sizes:", error);
		}
	}, []);

	const fetchQdrantInfo = useCallback(async () => {
		try {
			const { data } = await client.api.systemInfo.qdrant.get();
			if (data) {
				setQdrantInfo(data);
			}
		} catch (error) {
			console.error("Failed to fetch Qdrant info:", error);
		}
	}, []);

	useEffect(() => {
		fetchServers();
		fetchSuggestions();
		fetchMinecraftStatus(); // Initial fetch, then WebSocket takes over
		fetchZfsPools();
		fetchDirectorySizes();
		fetchQdrantInfo();
	}, [
		fetchServers,
		fetchSuggestions,
		fetchMinecraftStatus,
		fetchZfsPools,
		fetchDirectorySizes,
		fetchQdrantInfo,
	]);

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

	const handleRegisterDrive = async (path: string, label: string) => {
		await client.api.systemInfo.drives.post({ path, label });
		toast.success(`Drive "${label}" registered`);
		fetchSuggestions();
	};

	const handleDeleteDrive = async (id: string) => {
		if (!confirm("Remove drive?")) return;
		await client.api.systemInfo.drives({ id }).delete();
		toast.success("Drive removed");
		fetchSuggestions();
	};

	const stats = systemInfo?.stats;
	const drives = systemInfo?.drives ?? [];
	const databases = systemInfo?.databases ?? [];

	// Alert conditions
	const cpuAlert = stats && stats.cpu.usage > 90;
	const memAlert = stats && stats.memory.usagePercent > 90;
	const driveAlert = drives.some((d) => d.mounted && (d.usagePercent ?? 0) > 85);
	const hasAlerts = cpuAlert || memAlert || driveAlert;

	// Total database size
	const totalDbSize = databases.reduce((sum, db) => sum + db.sizeBytes, 0);
	const formatBytes = (bytes: number) => {
		if (bytes === 0) return "0 B";
		const k = 1024;
		const sizes = ["B", "KB", "MB", "GB"];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
	};

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
				{/* Network interface details */}
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
				{/* Game Servers Panel */}
				<Panel
					title="Game Servers"
					actions={
						<>
							<button
								type="button"
								onClick={fetchServers}
								className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
								title="Refresh (r)"
							>
								<RefreshCw size={12} />
							</button>
							<Link to="/servers/new">
								<button
									type="button"
									className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
									title="Create (c)"
								>
									<Plus size={12} />
								</button>
							</Link>
						</>
					}
				>
					{servers.length > 0 ? (
						<div className="space-y-1">
							{servers.map((server) => (
								<div
									key={server.id}
									className="flex items-center justify-between py-1.5 px-2 -mx-2 rounded hover:bg-surface-elevated/50 group"
								>
									<div className="flex items-center gap-2 min-w-0">
										<StatusDot status={server.status} size="sm" />
										<span className="text-sm truncate">{server.name}</span>
										<span className="text-xs text-text-tertiary hidden sm:inline">
											{server.modpack || server.gameType}
										</span>
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
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-6 text-text-tertiary text-sm">
							No servers configured
							<div className="mt-1">
								<Link to="/servers/new" className="text-accent hover:underline text-xs">
									Create one
								</Link>
							</div>
						</div>
					)}

					{/* Minecraft Live Status */}
					{mcStatus && (
						<div className="mt-3 pt-3 border-t border-border">
							<div className="flex items-center justify-between text-sm">
								<div className="flex items-center gap-2">
									<span
										className={`w-2 h-2 rounded-full ${mcStatus.online ? "bg-success animate-pulse" : "bg-text-tertiary"}`}
									/>
									<span className="text-text-secondary">Minecraft</span>
									{mcStatus.version && (
										<span className="text-xs text-text-tertiary">{mcStatus.version}</span>
									)}
								</div>
								{mcStatus.online && mcStatus.players && (
									<div className="flex items-center gap-1.5 text-text-tertiary">
										<Users size={12} />
										<span className="tabular-nums">
											{mcStatus.players.online}/{mcStatus.players.max}
										</span>
									</div>
								)}
							</div>
							{mcStatus.online && mcStatus.players && mcStatus.players.list.length > 0 && (
								<div className="mt-2 flex flex-wrap gap-1">
									{mcStatus.players.list.map((player) => (
										<span
											key={player}
											className="px-1.5 py-0.5 text-xs bg-success-bg text-success rounded"
										>
											{player}
										</span>
									))}
								</div>
							)}
							{mcStatus.latency !== undefined && (
								<div className="mt-1 text-xs text-text-tertiary">{mcStatus.latency}ms latency</div>
							)}
						</div>
					)}
				</Panel>

				{/* Storage & Databases */}
				<Panel title="Storage">
					{drives.length > 0 || suggestions.length > 0 ? (
						<div className="space-y-2">
							{drives.map((drive) => (
								<div key={drive.id} className="group">
									<div className="flex items-center justify-between text-sm">
										<div className="flex items-center gap-2">
											<HardDrive size={12} className="text-text-tertiary" />
											<span>{drive.label}</span>
										</div>
										<div className="flex items-center gap-2">
											{drive.mounted ? (
												<span className="text-xs text-text-tertiary tabular-nums">
													{drive.used}/{drive.total}G
												</span>
											) : (
												<span className="text-xs text-error">unmounted</span>
											)}
											<button
												type="button"
												onClick={() => handleDeleteDrive(drive.id)}
												className="p-0.5 rounded text-text-tertiary hover:text-error hover:bg-error-bg opacity-0 group-hover:opacity-100 transition-opacity"
												title="Remove"
											>
												<Trash2 size={10} />
											</button>
										</div>
									</div>
									{drive.mounted && (
										<div className="mt-1 h-1 bg-border rounded-full overflow-hidden">
											<div
												className="h-full transition-all"
												style={{
													width: `${drive.usagePercent}%`,
													backgroundColor:
														(drive.usagePercent ?? 0) > 90
															? "var(--error)"
															: (drive.usagePercent ?? 0) > 70
																? "var(--warning)"
																: "var(--accent)",
												}}
											/>
										</div>
									)}
								</div>
							))}
							{suggestions.map((s) => (
								<div
									key={s.path}
									className="flex items-center justify-between py-1 px-2 -mx-2 bg-surface-elevated/30 rounded text-sm"
								>
									<div className="flex items-center gap-2 min-w-0">
										<HardDrive size={12} className="text-text-tertiary" />
										<span className="truncate">{s.suggestedLabel}</span>
										<span className="text-xs text-text-tertiary">{s.total}G</span>
									</div>
									<Button
										size="sm"
										variant="ghost"
										onClick={() => handleRegisterDrive(s.path, s.suggestedLabel)}
										className="h-5 px-1.5 text-xs"
									>
										<Plus size={10} />
										Add
									</Button>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-6 text-text-tertiary text-sm">No drives registered</div>
					)}
				</Panel>

				{/* ZFS Storage Panel */}
				<Panel
					title="ZFS Storage"
					actions={
						<button
							type="button"
							onClick={fetchZfsPools}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} />
						</button>
					}
				>
					{zfsPools.length > 0 ? (
						<div className="space-y-3">
							{zfsPools.map((pool) => {
								const isHealthy = pool.health === "ONLINE";
								const isDegraded = pool.health === "DEGRADED";
								return (
									<div key={pool.name} className="space-y-2">
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<Server size={14} className="text-text-tertiary" />
												<span className="text-sm font-medium">{pool.name}</span>
												<span
													className={`text-xs px-1.5 py-0.5 rounded ${
														isHealthy
															? "bg-success-bg text-success"
															: isDegraded
																? "bg-warning-bg text-warning"
																: "bg-error-bg text-error"
													}`}
												>
													{pool.health}
												</span>
											</div>
											<span className="text-xs text-text-tertiary tabular-nums">
												{pool.allocatedFormatted} / {pool.sizeFormatted}
											</span>
										</div>
										{/* Capacity bar */}
										<div className="h-1.5 bg-border rounded-full overflow-hidden">
											<div
												className="h-full transition-all"
												style={{
													width: `${pool.capacity}%`,
													backgroundColor:
														pool.capacity > 90
															? "var(--error)"
															: pool.capacity > 70
																? "var(--warning)"
																: "var(--accent)",
												}}
											/>
										</div>
										<div className="flex items-center justify-between text-xs text-text-tertiary">
											<span>{pool.capacity}% used</span>
											<span>{pool.fragmentation}% frag</span>
										</div>
									</div>
								);
							})}
							{/* Scrub status */}
							{zfsPoolStatus?.scan && (
								<div className="pt-2 border-t border-border">
									<div className="flex items-center gap-2 text-xs">
										{zfsPoolStatus.scan.state === "scrubbing" ? (
											<>
												<Loader2 size={12} className="animate-spin text-accent" />
												<span className="text-text-secondary">
													Scrub in progress: {zfsPoolStatus.scan.progress}%
												</span>
											</>
										) : zfsPoolStatus.scan.state === "completed" ? (
											<>
												<CheckCircle2 size={12} className="text-success" />
												<span className="text-text-tertiary">
													Last scrub: {zfsPoolStatus.scan.lastCompleted}
												</span>
											</>
										) : (
											<span className="text-text-tertiary">No scrub data</span>
										)}
									</div>
								</div>
							)}
						</div>
					) : (
						<div className="text-center py-6 text-text-tertiary text-sm">No ZFS pools detected</div>
					)}
				</Panel>

				{/* Databases Panel */}
				<Panel title={`Databases${totalDbSize > 0 ? ` (${formatBytes(totalDbSize)})` : ""}`}>
					{databases.length > 0 ? (
						<div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
							{databases.map((db) => (
								<div
									key={db.name}
									className="flex items-center gap-2 py-2 px-3 bg-surface-elevated/30 rounded"
								>
									<Database size={14} className="text-text-tertiary" />
									<div className="min-w-0 flex-1">
										<div className="text-sm truncate">{db.domain}</div>
										<div className="text-xs text-text-tertiary tabular-nums flex gap-2">
											<span>{db.sizeFormatted}</span>
											<span>•</span>
											<span>{db.rowCount?.toLocaleString() ?? 0} rows</span>
										</div>
									</div>
								</div>
							))}
						</div>
					) : (
						<div className="text-center py-4 text-text-tertiary text-sm">
							No database info available
						</div>
					)}
				</Panel>

				{/* Directory Sizes Panel */}
				<Panel
					title="Directory Sizes"
					actions={
						<button
							type="button"
							onClick={fetchDirectorySizes}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} />
						</button>
					}
				>
					{directorySizes.length > 0 ? (
						<div className="space-y-1 text-sm max-h-64 overflow-y-auto">
							{directorySizes.map((dir) => {
								const depth = dir.path.split("/").length - 2; // /tank = 0, /tank/foo = 1
								const name = dir.path.split("/").pop() || dir.path;
								const isRoot = dir.path === "/tank";
								return (
									<div
										key={dir.path}
										className="flex items-center justify-between py-0.5 hover:bg-surface-elevated/50 rounded px-1"
										style={{ paddingLeft: `${depth * 12 + 4}px` }}
									>
										<div className="flex items-center gap-1.5 min-w-0">
											<Folder size={12} className={isRoot ? "text-accent" : "text-text-tertiary"} />
											<span className={`truncate ${isRoot ? "font-medium" : ""}`}>{name}</span>
										</div>
										<span className="text-xs text-text-tertiary tabular-nums ml-2">
											{dir.sizeFormatted}
										</span>
									</div>
								);
							})}
						</div>
					) : (
						<div className="text-center py-4 text-text-tertiary text-sm">
							No directory data available
						</div>
					)}
				</Panel>

				{/* Qdrant (Vector DB) Panel */}
				<Panel
					title={`Qdrant${qdrantInfo?.totalPoints ? ` (${qdrantInfo.totalPoints.toLocaleString()} vectors)` : ""}`}
					actions={
						<button
							type="button"
							onClick={fetchQdrantInfo}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={12} />
						</button>
					}
				>
					{qdrantInfo ? (
						<div className="space-y-2">
							<div className="flex items-center gap-2 text-sm">
								<span
									className={`w-2 h-2 rounded-full ${qdrantInfo.healthy ? "bg-success" : "bg-error"}`}
								/>
								<span className="text-text-secondary">
									{qdrantInfo.healthy ? "Connected" : "Disconnected"}
								</span>
								{qdrantInfo.totalDiskSizeFormatted && (
									<span className="text-xs text-text-tertiary ml-auto">
										~{qdrantInfo.totalDiskSizeFormatted}
									</span>
								)}
							</div>
							{qdrantInfo.collections.length > 0 ? (
								<div className="space-y-1">
									{qdrantInfo.collections.map((col) => (
										<div
											key={col.name}
											className="flex items-center justify-between py-1.5 px-2 -mx-2 bg-surface-elevated/30 rounded"
										>
											<div className="flex items-center gap-2">
												<Boxes size={12} className="text-text-tertiary" />
												<span className="text-sm">{col.name}</span>
												<span
													className={`text-xs px-1 py-0.5 rounded ${
														col.status === "green"
															? "bg-success-bg text-success"
															: "bg-warning-bg text-warning"
													}`}
												>
													{col.status}
												</span>
											</div>
											<div className="text-xs text-text-tertiary tabular-nums">
												{col.pointsCount.toLocaleString()} pts
											</div>
										</div>
									))}
								</div>
							) : (
								<div className="text-xs text-text-tertiary">No collections</div>
							)}
						</div>
					) : (
						<div className="text-center py-4 text-text-tertiary text-sm">
							Loading Qdrant info...
						</div>
					)}
				</Panel>
			</div>
		</div>
	);
}

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
