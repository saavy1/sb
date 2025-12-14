import type { GameServerType } from "@nexus/domains/game-servers/types";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Database,
	HardDrive,
	Play,
	Plus,
	RefreshCw,
	Square,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Panel, SkeletonStats, Sparkline, StatusDot } from "../components/ui";
import { client } from "../lib/api";
import { useConnection } from "../lib/ConnectionContext";

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

	useEffect(() => {
		fetchServers();
		fetchSuggestions();
	}, [fetchServers, fetchSuggestions]);

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

				{/* Databases Panel */}
				<Panel
					title={`Databases${totalDbSize > 0 ? ` (${formatBytes(totalDbSize)})` : ""}`}
					className="lg:col-span-2"
				>
					{databases.length > 0 ? (
						<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
							{databases.map((db) => (
								<div
									key={db.name}
									className="flex items-center gap-2 py-2 px-3 bg-surface-elevated/30 rounded"
								>
									<Database size={14} className="text-text-tertiary" />
									<div className="min-w-0">
										<div className="text-sm truncate">{db.domain}</div>
										<div className="text-xs text-text-tertiary tabular-nums">
											{db.sizeFormatted}
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
