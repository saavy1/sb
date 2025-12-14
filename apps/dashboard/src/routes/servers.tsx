import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Panel, StatusDot } from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/servers")({
	component: ServersPage,
});

type ServerResponse = Awaited<ReturnType<typeof client.api.gameServers.get>>["data"];

function ServersPage() {
	const [servers, setServers] = useState<NonNullable<ServerResponse>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [selectedIndex, setSelectedIndex] = useState(0);

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

	useEffect(() => {
		fetchServers();
	}, [fetchServers]);

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
				<div className="flex items-center gap-2">
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
