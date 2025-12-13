import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Plus, RefreshCw, Server, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, PageHeader, StatusDot } from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/servers")({
	component: ServersPage,
});

type ServerResponse = Awaited<ReturnType<typeof client.api.gameServers.get>>["data"];

function ServersPage() {
	const [servers, setServers] = useState<NonNullable<ServerResponse>>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const fetchServers = useCallback(async () => {
		setLoading(true);
		try {
			const { data, error } = await client.api.gameServers.get();
			if (error) throw error;
			if (data) setServers(data);
			setError(null);
		} catch {
			setError("Failed to fetch servers");
		}
		setLoading(false);
	}, []);

	useEffect(() => {
		fetchServers();
	}, [fetchServers]);

	const handleStart = async (name: string) => {
		await client.api.gameServers({ name }).start.post();
		fetchServers();
	};

	const handleStop = async (name: string) => {
		await client.api.gameServers({ name }).stop.post();
		fetchServers();
	};

	const handleDelete = async (name: string) => {
		if (!confirm(`Delete server "${name}"?`)) return;
		await client.api.gameServers({ name }).delete();
		fetchServers();
	};

	return (
		<div>
			<PageHeader
				title="Servers"
				description="Manage your Minecraft and game servers"
				actions={
					<>
						<Button variant="outline" size="icon" onClick={fetchServers} title="Refresh">
							<RefreshCw size={18} />
						</Button>
						<Button asChild>
							<Link to="/servers/new">
								<Plus size={16} />
								<span className="hidden sm:inline ml-1">New Server</span>
							</Link>
						</Button>
					</>
				}
			/>

			{loading && <p className="text-text-tertiary">Loading...</p>}
			{error && <p className="text-error">{error}</p>}

			{!loading && servers.length === 0 && (
				<div className="py-12 text-center">
					<Server className="mx-auto mb-4 text-text-tertiary" size={48} />
					<p className="text-text-secondary">No game servers yet</p>
					<p className="text-text-tertiary text-sm mt-1">Create your first server to get started</p>
				</div>
			)}

			{!loading && servers.length > 0 && (
				<>
					<div className="text-sm text-text-secondary mb-4">
						{servers.length} server{servers.length !== 1 ? "s" : ""}
					</div>

					<div className="border border-border rounded-lg overflow-hidden">
						<table className="w-full">
							<thead className="hidden md:table-header-group">
								<tr className="bg-surface border-b border-border">
									<th className="w-1/3 px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
										Server
									</th>
									<th className="w-1/4 px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
										Type
									</th>
									<th className="w-1/4 px-4 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
										Modpack
									</th>
									<th className="w-12 px-4 py-3">
										<span className="sr-only">Actions</span>
									</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-border">
								{servers.map((server) => (
									<tr key={server.id} className="group hover:bg-surface-elevated transition-colors">
										{/* Server name column - always visible */}
										<td className="px-4 py-4">
											<div className="flex items-start gap-3">
												<StatusDot
													status={
														server.status as
															| "running"
															| "stopped"
															| "starting"
															| "stopping"
															| "error"
													}
													className="mt-1.5 shrink-0"
												/>
												<div className="min-w-0">
													<p className="font-semibold truncate">{server.name}</p>
													{/* Mobile: show condensed info */}
													<div className="md:hidden flex items-center gap-1 text-sm text-text-secondary mt-0.5">
														<span>{server.gameType}</span>
														{server.modpack && (
															<>
																<span>·</span>
																<span className="truncate">{server.modpack}</span>
															</>
														)}
													</div>
												</div>
											</div>
										</td>

										{/* Type column - hidden on mobile */}
										<td className="hidden md:table-cell px-4 py-4 text-text-secondary">
											{server.gameType}
										</td>

										{/* Modpack column - hidden on mobile */}
										<td className="hidden md:table-cell px-4 py-4 text-sm font-mono text-text-tertiary">
											{server.modpack || "—"}
										</td>

										{/* Actions column */}
										<td className="px-4 py-4">
											<div className="flex justify-end gap-1">
												{server.status === "stopped" ? (
													<button
														type="button"
														onClick={() => handleStart(server.name)}
														className="p-2 rounded-md hover:bg-success-bg text-success transition-colors"
														title="Start"
													>
														<Play size={18} />
													</button>
												) : (
													<button
														type="button"
														onClick={() => handleStop(server.name)}
														className="p-2 rounded-md hover:bg-warning-bg text-warning transition-colors"
														title="Stop"
													>
														<Square size={18} />
													</button>
												)}
												<button
													type="button"
													onClick={() => handleDelete(server.name)}
													className="p-2 rounded-md hover:bg-error-bg text-error transition-colors"
													title="Delete"
												>
													<Trash2 size={18} />
												</button>
											</div>
										</td>
									</tr>
								))}
							</tbody>
						</table>
					</div>
				</>
			)}
		</div>
	);
}
