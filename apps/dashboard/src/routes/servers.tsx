import { createFileRoute, Link } from "@tanstack/react-router";
import { Play, Plus, RefreshCw, Server, Square, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, CardContent, PageHeader, StatusDot } from "../components/ui";
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
				title="Game Servers"
				description="Manage your Minecraft and game servers"
				actions={
					<>
						<Button variant="outline" size="icon" onClick={fetchServers} title="Refresh">
							<RefreshCw size={18} />
						</Button>
						<Button asChild>
							<Link to="/servers/new">
								<Plus size={16} />
								New Server
							</Link>
						</Button>
					</>
				}
			/>

			{loading && <p className="text-[var(--text-tertiary)]">Loading...</p>}
			{error && <p className="text-[var(--error)]">{error}</p>}

			{!loading && servers.length === 0 && (
				<Card>
					<CardContent className="py-12 text-center">
						<Server className="mx-auto mb-4 text-[var(--text-tertiary)]" size={48} />
						<p className="text-[var(--text-secondary)]">No game servers yet</p>
						<p className="text-[var(--text-tertiary)] text-sm mt-1">
							Create your first server to get started
						</p>
					</CardContent>
				</Card>
			)}

			{!loading && servers.length > 0 && (
				<div className="border border-[var(--border)] rounded-lg overflow-hidden">
					<table className="w-full">
						<thead>
							<tr className="bg-[var(--surface)] border-b border-[var(--border)]">
								<th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
									Status
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
									Name
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
									Type
								</th>
								<th className="px-4 py-3 text-left text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
									Modpack
								</th>
								<th className="px-4 py-3 text-right text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wider">
									Actions
								</th>
							</tr>
						</thead>
						<tbody className="divide-y divide-[var(--border)]">
							{servers.map((server) => (
								<tr
									key={server.id}
									className="hover:bg-[var(--surface-elevated)] transition-colors"
								>
									<td className="px-4 py-4">
										<StatusDot
											status={
												server.status as "running" | "stopped" | "starting" | "stopping" | "error"
											}
										/>
									</td>
									<td className="px-4 py-4 font-medium">{server.name}</td>
									<td className="px-4 py-4 text-[var(--text-secondary)]">{server.gameType}</td>
									<td className="px-4 py-4 text-sm font-mono text-[var(--text-tertiary)]">
										{server.modpack || "—"}
									</td>
									<td className="px-4 py-4">
										<div className="flex justify-end gap-1">
											{server.status === "stopped" ? (
												<button
													type="button"
													onClick={() => handleStart(server.name)}
													className="p-1.5 rounded hover:bg-[var(--success-bg)] text-[var(--success)] transition-colors"
													title="Start"
												>
													<Play size={16} />
												</button>
											) : (
												<button
													type="button"
													onClick={() => handleStop(server.name)}
													className="p-1.5 rounded hover:bg-[var(--warning-bg)] text-[var(--warning)] transition-colors"
													title="Stop"
												>
													<Square size={16} />
												</button>
											)}
											<button
												type="button"
												onClick={() => handleDelete(server.name)}
												className="p-1.5 rounded hover:bg-[var(--error-bg)] text-[var(--error)] transition-colors"
												title="Delete"
											>
												<Trash2 size={16} />
											</button>
										</div>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}
