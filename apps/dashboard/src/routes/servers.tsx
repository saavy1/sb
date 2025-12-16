import type { GameServerType } from "@nexus-core/domains/game-servers";
import type { MinecraftStatusPayloadType } from "@nexus-core/infra/events";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	ChevronDown,
	Clock,
	Play,
	Plus,
	RefreshCw,
	Signal,
	Square,
	Trash2,
	Users,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel, StatusDot } from "../components/ui";
import { client } from "../lib/api";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/servers")({
	component: ServersPage,
});

function ServersPage() {
	const [servers, setServers] = useState<GameServerType[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [mcStatus, setMcStatus] = useState<MinecraftStatusPayloadType | null>(null);
	const [mcDropdownOpen, setMcDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	// Subscribe to Minecraft status events via WebSocket
	useEvents("minecraft:status", (payload) => {
		setMcStatus(payload);
	});

	// Close dropdown when clicking outside
	useEffect(() => {
		const handleClickOutside = (e: MouseEvent) => {
			if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
				setMcDropdownOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const fetchServers = useCallback(async () => {
		setLoading(true);
		try {
			const { data, error } = await client.api.gameServers.get();
			if (error) throw error;
			if (Array.isArray(data)) setServers(data);
			setError(null);
		} catch {
			setError("Failed to fetch servers");
		}
		setLoading(false);
	}, []);

	const fetchMinecraftStatus = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.minecraft.status.get();
			if (data) setMcStatus(data as MinecraftStatusPayloadType);
		} catch (error) {
			console.error("Failed to fetch Minecraft status:", error);
		}
	}, []);

	useEffect(() => {
		fetchServers();
		fetchMinecraftStatus();
	}, [fetchServers, fetchMinecraftStatus]);

	// Keyboard navigation
	useEffect(() => {
		const isEditable = (el: Element | null) =>
			el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT";

		const handler = (e: KeyboardEvent) => {
			if (isEditable(document.activeElement)) return;

			if (e.key === "j" || e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIndex((i) => Math.min(i + 1, servers.length - 1));
			} else if (e.key === "k" || e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIndex((i) => Math.max(i - 1, 0));
			} else if (e.key === "r") {
				e.preventDefault();
				fetchServers();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [servers.length, fetchServers]);

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

	const handleDelete = async (name: string) => {
		if (!confirm(`Delete server "${name}"?`)) return;
		toast.promise(client.api.gameServers({ name }).delete(), {
			loading: `Deleting ${name}...`,
			success: `${name} deleted`,
			error: `Failed to delete ${name}`,
		});
		setTimeout(fetchServers, 500);
	};

	const runningCount = servers.filter((s) => s.status === "running").length;
	const stoppedCount = servers.filter((s) => s.status === "stopped").length;

	return (
		<div className="space-y-4">
			{/* Header Strip */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-4">
					<span className="text-text-secondary uppercase tracking-wider">Game Servers</span>
					<span className="text-text-tertiary">
						{servers.length} total
						{runningCount > 0 && <span className="text-success ml-2">{runningCount} running</span>}
						{stoppedCount > 0 && (
							<span className="text-text-tertiary ml-2">{stoppedCount} stopped</span>
						)}
					</span>
				</div>
				<div className="flex items-center gap-3">
					{/* Minecraft Live Status Dropdown */}
					{mcStatus && (
						<div className="relative" ref={dropdownRef}>
							<button
								type="button"
								onClick={() => setMcDropdownOpen(!mcDropdownOpen)}
								className={`flex items-center gap-2 px-2 py-1 rounded border transition-colors ${
									mcDropdownOpen
										? "bg-surface-elevated border-accent"
										: "border-border hover:bg-surface-elevated"
								}`}
							>
								<span
									className={`w-2 h-2 rounded-full ${
										mcStatus.online ? "bg-success animate-pulse" : "bg-text-tertiary"
									}`}
								/>
								<span className="text-text-secondary">MC</span>
								{mcStatus.online && mcStatus.players && (
									<span className="text-text-tertiary tabular-nums">
										{mcStatus.players.online}/{mcStatus.players.max}
									</span>
								)}
								<ChevronDown
									size={12}
									className={`text-text-tertiary transition-transform ${
										mcDropdownOpen ? "rotate-180" : ""
									}`}
								/>
							</button>

							{/* Dropdown Panel */}
							{mcDropdownOpen && (
								<div className="absolute right-0 top-full mt-1 w-64 bg-surface border border-border rounded shadow-lg z-50">
									<div className="p-3 space-y-3">
										{/* Status Header */}
										<div className="flex items-center justify-between">
											<div className="flex items-center gap-2">
												<span
													className={`w-2.5 h-2.5 rounded-full ${
														mcStatus.online ? "bg-success" : "bg-text-tertiary"
													}`}
												/>
												<span className="font-medium">
													{mcStatus.online ? "Online" : "Offline"}
												</span>
											</div>
											{mcStatus.version && (
												<span className="text-text-tertiary">{mcStatus.version}</span>
											)}
										</div>

										{mcStatus.online && (
											<>
												{/* MOTD */}
												{mcStatus.motd && (
													<div className="text-text-secondary text-xs italic border-l-2 border-accent pl-2">
														{mcStatus.motd}
													</div>
												)}

												{/* Stats Grid */}
												<div className="grid grid-cols-2 gap-2 text-xs">
													{mcStatus.players && (
														<div className="flex items-center gap-1.5 text-text-secondary">
															<Users size={12} className="text-text-tertiary" />
															<span>
																{mcStatus.players.online}/{mcStatus.players.max} players
															</span>
														</div>
													)}
													{mcStatus.latency !== undefined && (
														<div className="flex items-center gap-1.5 text-text-secondary">
															<Signal size={12} className="text-text-tertiary" />
															<span>{mcStatus.latency}ms</span>
														</div>
													)}
												</div>

												{/* Player List */}
												{mcStatus.players && mcStatus.players.list.length > 0 && (
													<div className="space-y-1.5">
														<div className="text-xs text-text-tertiary uppercase tracking-wider">
															Online Players
														</div>
														<div className="flex flex-wrap gap-1">
															{mcStatus.players.list.map((player) => (
																<span
																	key={player}
																	className="px-1.5 py-0.5 text-xs bg-success-bg text-success rounded"
																>
																	{player}
																</span>
															))}
														</div>
													</div>
												)}

												{mcStatus.players && mcStatus.players.list.length === 0 && (
													<div className="text-xs text-text-tertiary text-center py-2">
														No players online
													</div>
												)}
											</>
										)}

										{/* Last Updated */}
										{mcStatus.timestamp && (
											<div className="flex items-center gap-1.5 text-xs text-text-tertiary pt-2 border-t border-border">
												<Clock size={10} />
												<span>
													Updated{" "}
													{new Date(mcStatus.timestamp).toLocaleTimeString("en-US", {
														hour: "2-digit",
														minute: "2-digit",
														second: "2-digit",
													})}
												</span>
											</div>
										)}
									</div>
								</div>
							)}
						</div>
					)}

					<button
						type="button"
						onClick={fetchServers}
						className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
						title="Refresh (r)"
					>
						<RefreshCw size={12} />
					</button>
					<Link
						to="/servers/new"
						className="flex items-center gap-1 px-2 py-1 rounded bg-accent text-white text-xs hover:bg-accent-hover"
					>
						<Plus size={12} />
						<span>New</span>
					</Link>
				</div>
			</div>

			{loading && <p className="text-text-tertiary text-sm px-3">Loading...</p>}
			{error && <p className="text-error text-sm px-3">{error}</p>}

			{!loading && servers.length === 0 && (
				<Panel title="No Servers">
					<div className="text-center py-8 text-text-tertiary text-sm">
						No game servers configured yet.
						<div className="mt-2">
							<Link to="/servers/new" className="text-accent hover:underline">
								Create your first server
							</Link>
						</div>
					</div>
				</Panel>
			)}

			{!loading && servers.length > 0 && (
				<div className="border border-border rounded overflow-hidden">
					{/* Table Header */}
					<div className="hidden md:grid grid-cols-12 gap-2 px-3 py-2 bg-surface-elevated/50 border-b border-border text-xs text-text-tertiary uppercase tracking-wider">
						<div className="col-span-1" />
						<div className="col-span-3">Name</div>
						<div className="col-span-2">Type</div>
						<div className="col-span-3">Modpack</div>
						<div className="col-span-2">Memory</div>
						<div className="col-span-1" />
					</div>

					{/* Table Body */}
					<div className="divide-y divide-border">
						{servers.map((server, index) => (
							<div
								key={server.id}
								className={`px-3 py-3 md:py-2.5 group transition-colors ${
									index === selectedIndex ? "bg-surface-elevated" : "hover:bg-surface-elevated/50"
								}`}
							>
								{/* Mobile Layout */}
								<div className="md:hidden flex items-center justify-between">
									<div className="flex items-center gap-3 min-w-0">
										<StatusDot
											status={
												server.status as "running" | "stopped" | "starting" | "stopping" | "error"
											}
											size="md"
										/>
										<div className="min-w-0">
											<div className="text-sm font-medium truncate">{server.name}</div>
											<div className="text-xs text-text-tertiary truncate">
												{server.modpack || server.gameType}
											</div>
										</div>
									</div>
									<div className="flex items-center gap-2">
										{server.status === "stopped" ? (
											<button
												type="button"
												onClick={() => handleStart(server.name)}
												className="p-2.5 rounded-lg text-success bg-success-bg/50 active:bg-success-bg"
												title="Start"
											>
												<Play size={18} />
											</button>
										) : (
											<button
												type="button"
												onClick={() => handleStop(server.name)}
												className="p-2.5 rounded-lg text-warning bg-warning-bg/50 active:bg-warning-bg"
												title="Stop"
											>
												<Square size={18} />
											</button>
										)}
									</div>
								</div>

								{/* Desktop Layout */}
								<div className="hidden md:grid grid-cols-12 gap-2 items-center">
									<div className="col-span-1 flex justify-center">
										<StatusDot
											status={
												server.status as "running" | "stopped" | "starting" | "stopping" | "error"
											}
											size="sm"
										/>
									</div>
									<div className="col-span-3 truncate text-sm">{server.name}</div>
									<div className="col-span-2 text-sm text-text-secondary">{server.gameType}</div>
									<div className="col-span-3 text-sm text-text-tertiary truncate">
										{server.modpack || "—"}
									</div>
									<div className="col-span-2 text-sm text-text-tertiary font-mono">
										{server.memory || "4G"}
									</div>
									<div className="col-span-1 flex justify-end gap-1">
										{server.status === "stopped" ? (
											<button
												type="button"
												onClick={() => handleStart(server.name)}
												className="p-1.5 rounded text-success hover:bg-success-bg transition-colors"
												title="Start"
											>
												<Play size={14} />
											</button>
										) : (
											<button
												type="button"
												onClick={() => handleStop(server.name)}
												className="p-1.5 rounded text-warning hover:bg-warning-bg transition-colors"
												title="Stop"
											>
												<Square size={14} />
											</button>
										)}
										<button
											type="button"
											onClick={() => handleDelete(server.name)}
											className="p-1.5 rounded text-text-tertiary hover:text-error hover:bg-error-bg transition-colors opacity-0 group-hover:opacity-100"
											title="Delete"
										>
											<Trash2 size={14} />
										</button>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}
		</div>
	);
}
