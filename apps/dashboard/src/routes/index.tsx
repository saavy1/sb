import { createFileRoute, Link } from "@tanstack/react-router";
import { HardDrive, Play, Plus, RefreshCw, Square, Trash2, Wifi, WifiOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, StatusDot } from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/")({
	component: HomePage,
});

type ServersResponse = Awaited<ReturnType<typeof client.api.gameServers.get>>["data"];
type SystemOverview = Awaited<ReturnType<typeof client.api.systemInfo.overview.get>>["data"];
type SuggestedDrive = Awaited<
	ReturnType<typeof client.api.systemInfo.drives.suggestions.get>
>["data"];

const WS_URL =
	import.meta.env.VITE_API_URL?.replace(/^http/, "ws") ||
	(import.meta.env.MODE === "production" ? `ws://${window.location.host}` : "ws://localhost:3000");

function HomePage() {
	const [servers, setServers] = useState<NonNullable<ServersResponse>>([]);
	const [systemInfo, setSystemInfo] = useState<NonNullable<SystemOverview> | null>(null);
	const [suggestions, setSuggestions] = useState<NonNullable<SuggestedDrive>>([]);
	const [connected, setConnected] = useState(false);
	const [loading, setLoading] = useState(true);
	const wsRef = useRef<WebSocket | null>(null);

	const fetchServers = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.get();
			if (data) setServers(data);
		} catch (error) {
			console.error("Failed to fetch servers:", error);
		}
	}, []);

	const fetchSuggestions = useCallback(async () => {
		try {
			const res = await client.api.systemInfo.drives.suggestions.get();
			if (res.data) setSuggestions(res.data);
		} catch (error) {
			console.error("Failed to fetch drive suggestions:", error);
		}
	}, []);

	// WebSocket connection - no dependencies to avoid reconnection loops
	useEffect(() => {
		const connect = () => {
			const ws = new WebSocket(`${WS_URL}/api/systemInfo/live`);
			wsRef.current = ws;
			ws.onopen = () => {
				setConnected(true);
				setLoading(false);
			};
			ws.onmessage = (e) => {
				try {
					setSystemInfo(JSON.parse(e.data));
				} catch (error) {
					console.error("Failed to parse system info:", error);
				}
			};
			ws.onclose = () => {
				setConnected(false);
				setTimeout(connect, 2000);
			};
			ws.onerror = () => ws.close();
		};
		connect();
		return () => {
			wsRef.current?.close();
		};
	}, []);

	// Initial data fetch
	useEffect(() => {
		fetchServers();
		fetchSuggestions();
	}, [fetchServers, fetchSuggestions]);

	const handleStart = async (name: string) => {
		await client.api.gameServers({ name }).start.post();
		fetchServers();
	};

	const handleStop = async (name: string) => {
		await client.api.gameServers({ name }).stop.post();
		fetchServers();
	};

	const handleRegisterDrive = async (path: string, label: string) => {
		await client.api.systemInfo.drives.post({ path, label });
		fetchSuggestions();
	};

	const handleDeleteDrive = async (id: string) => {
		if (!confirm("Remove drive?")) return;
		await client.api.systemInfo.drives({ id }).delete();
		fetchSuggestions();
	};

	const stats = systemInfo?.stats;
	const drives = systemInfo?.drives ?? [];

	return (
		<div className="max-w-xl space-y-4">
			{/* Header with connection status */}
			<div className="flex items-center justify-between">
				<h1 className="text-xl font-semibold">Dashboard</h1>
				<span
					className={`flex items-center gap-1 text-xs ${connected ? "text-success" : "text-text-tertiary"}`}
				>
					{connected ? <Wifi size={12} /> : <WifiOff size={12} />}
					{connected ? "Live" : "..."}
				</span>
			</div>

			{/* System Stats Bar */}
			{stats && (
				<div className="flex items-center gap-4 text-sm py-2 px-3 bg-surface rounded-md">
					<div className="flex items-center gap-1.5">
						<span className="text-text-tertiary">CPU</span>
						<span className="font-medium tabular-nums">{stats.cpu.usage}%</span>
					</div>
					{stats.gpu?.available && (
						<div className="flex items-center gap-1.5">
							<span className="text-text-tertiary">GPU</span>
							<span className="font-medium tabular-nums">{stats.gpu.usage}%</span>
						</div>
					)}
					<div className="flex items-center gap-1.5">
						<span className="text-text-tertiary">Mem</span>
						<span className="font-medium tabular-nums">{stats.memory.usagePercent}%</span>
					</div>
					<div className="flex items-center gap-1.5 text-xs">
						<span className="text-text-tertiary">Net</span>
						<span className="font-mono tabular-nums">
							↓{stats.network.totalRxSpeed} ↑{stats.network.totalTxSpeed}
						</span>
					</div>
				</div>
			)}

			{loading && !stats && <div className="py-4 text-sm text-text-tertiary">Loading...</div>}

			{/* Servers */}
			<section className="border border-border rounded-lg">
				<div className="flex items-center justify-between px-3 py-2 border-b border-border">
					<h2 className="text-sm font-medium">Servers</h2>
					<div className="flex items-center gap-1">
						<button
							type="button"
							onClick={fetchServers}
							className="p-1.5 rounded hover:bg-surface-elevated text-text-tertiary"
							title="Refresh"
						>
							<RefreshCw size={14} />
						</button>
						<Link to="/servers/new">
							<Button size="sm" variant="ghost" className="h-7 px-2">
								<Plus size={14} />
							</Button>
						</Link>
					</div>
				</div>

				{servers.length > 0 ? (
					<div className="divide-y divide-border">
						{servers.map((server) => (
							<div key={server.id} className="flex items-center justify-between px-3 py-2.5">
								<div className="flex items-center gap-2.5 min-w-0">
									<StatusDot
										status={server.status}
									/>
									<div className="min-w-0">
										<div className="font-medium text-sm truncate">{server.name}</div>
										<div className="text-xs text-text-tertiary truncate">
											{server.gameType}
											{server.modpack ? ` · ${server.modpack}` : ""}
										</div>
									</div>
								</div>
								{server.status === "stopped" ? (
									<button
										type="button"
										onClick={() => handleStart(server.name)}
										className="p-1.5 rounded hover:bg-success-bg text-success"
										title="Start"
									>
										<Play size={16} />
									</button>
								) : (
									<button
										type="button"
										onClick={() => handleStop(server.name)}
										className="p-1.5 rounded hover:bg-warning-bg text-warning"
										title="Stop"
									>
										<Square size={16} />
									</button>
								)}
							</div>
						))}
					</div>
				) : (
					<div className="px-3 py-6 text-center text-sm text-text-tertiary">No servers yet</div>
				)}
			</section>

			{/* Drives */}
			{(drives.length > 0 || suggestions.length > 0) && (
				<section className="border border-border rounded-lg">
					<div className="px-3 py-2 border-b border-border">
						<h2 className="text-sm font-medium">Storage</h2>
					</div>

					<div className="divide-y divide-border">
						{drives.map((drive) => (
							<div key={drive.id} className="flex items-center gap-3 px-3 py-2.5">
								<HardDrive size={14} className="text-text-tertiary shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="flex items-center justify-between text-sm">
										<span className="font-medium truncate">{drive.label}</span>
										{drive.mounted ? (
											<span className="text-xs text-text-tertiary tabular-nums ml-2">
												{drive.used}/{drive.total}G · {drive.usagePercent}%
											</span>
										) : (
											<span className="text-xs text-error ml-2">Unmounted</span>
										)}
									</div>
									{drive.mounted && (
										<div className="h-1 bg-border rounded-full overflow-hidden mt-1.5">
											<div
												className="h-full rounded-full"
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
								<button
									type="button"
									onClick={() => handleDeleteDrive(drive.id)}
									className="p-1 rounded hover:bg-error-bg text-text-tertiary hover:text-error"
									title="Remove"
								>
									<Trash2 size={12} />
								</button>
							</div>
						))}

						{suggestions.map((s) => (
							<div key={s.path} className="flex items-center gap-3 px-3 py-2.5 bg-surface/50">
								<HardDrive size={14} className="text-text-tertiary shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="text-sm font-medium truncate">{s.suggestedLabel}</div>
									<div className="text-xs text-text-tertiary truncate">
										{s.path} · {s.total}G
									</div>
								</div>
								<Button
									size="sm"
									variant="ghost"
									onClick={() => handleRegisterDrive(s.path, s.suggestedLabel)}
									className="h-6 px-2"
								>
									<Plus size={12} />
								</Button>
							</div>
						))}
					</div>
				</section>
			)}
		</div>
	);
}
