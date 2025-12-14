import { useNavigate } from "@tanstack/react-router";
import { Command } from "cmdk";
import { Grid, Home, Play, Plus, Server, Settings, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { client } from "../../lib/api";

type ServerInfo = {
	name: string;
	status: string;
	gameType: string;
	modpack?: string;
};

export function CommandPalette() {
	const [open, setOpen] = useState(false);
	const [servers, setServers] = useState<ServerInfo[]>([]);
	const navigate = useNavigate();

	const fetchServers = useCallback(async () => {
		try {
			const { data } = await client.api.gameServers.get();
			if (data)
				setServers(
					data.map((s) => ({
						name: s.name,
						status: s.status,
						gameType: s.gameType,
						modpack: s.modpack ?? undefined,
					}))
				);
		} catch {
			// Silently fail
		}
	}, []);

	useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, []);

	// Fetch servers when palette opens
	useEffect(() => {
		if (open) fetchServers();
	}, [open, fetchServers]);

	const runCommand = (command: () => void) => {
		setOpen(false);
		command();
	};

	const handleStartServer = (name: string) => {
		runCommand(() => {
			toast.promise(client.api.gameServers({ name }).start.post(), {
				loading: `Starting ${name}...`,
				success: `${name} started`,
				error: `Failed to start ${name}`,
			});
		});
	};

	const handleStopServer = (name: string) => {
		runCommand(() => {
			toast.promise(client.api.gameServers({ name }).stop.post(), {
				loading: `Stopping ${name}...`,
				success: `${name} stopped`,
				error: `Failed to stop ${name}`,
			});
		});
	};

	return (
		<Command.Dialog
			open={open}
			onOpenChange={setOpen}
			label="Command Menu"
			className="fixed inset-0 z-50"
		>
			<button
				type="button"
				aria-label="Close command palette"
				className="fixed inset-0 bg-black/60 cursor-default"
				onClick={() => setOpen(false)}
			/>
			<div className="fixed left-1/2 top-[20%] -translate-x-1/2 w-full max-w-lg">
				<div className="bg-surface border border-border-strong rounded-lg shadow-2xl overflow-hidden font-mono">
					<Command.Input
						placeholder="Type a command or search..."
						className="w-full px-4 py-3 bg-transparent border-b border-border text-text-primary placeholder:text-text-tertiary outline-none text-sm"
					/>
					<Command.List className="max-h-80 overflow-y-auto p-2">
						<Command.Empty className="px-4 py-8 text-center text-text-tertiary text-sm">
							No results found.
						</Command.Empty>

						<Command.Group
							heading="Navigation"
							className="px-2 py-1.5 text-xs text-text-tertiary uppercase tracking-wider"
						>
							<Command.Item
								onSelect={() => runCommand(() => navigate({ to: "/" }))}
								className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
							>
								<Home size={16} />
								<span>Dashboard</span>
								<kbd className="ml-auto text-xs text-text-tertiary bg-background px-1.5 py-0.5 rounded">
									g h
								</kbd>
							</Command.Item>
							<Command.Item
								onSelect={() => runCommand(() => navigate({ to: "/apps" }))}
								className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
							>
								<Grid size={16} />
								<span>Apps</span>
								<kbd className="ml-auto text-xs text-text-tertiary bg-background px-1.5 py-0.5 rounded">
									g a
								</kbd>
							</Command.Item>
							<Command.Item
								onSelect={() => runCommand(() => navigate({ to: "/servers" }))}
								className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
							>
								<Server size={16} />
								<span>Servers</span>
								<kbd className="ml-auto text-xs text-text-tertiary bg-background px-1.5 py-0.5 rounded">
									g s
								</kbd>
							</Command.Item>
							<Command.Item
								onSelect={() => runCommand(() => navigate({ to: "/settings" }))}
								className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
							>
								<Settings size={16} />
								<span>Settings</span>
								<kbd className="ml-auto text-xs text-text-tertiary bg-background px-1.5 py-0.5 rounded">
									g ,
								</kbd>
							</Command.Item>
						</Command.Group>

						<Command.Separator className="h-px bg-border my-2" />

						<Command.Group
							heading="Actions"
							className="px-2 py-1.5 text-xs text-text-tertiary uppercase tracking-wider"
						>
							<Command.Item
								onSelect={() => runCommand(() => navigate({ to: "/servers/new" }))}
								className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
							>
								<Plus size={16} />
								<span>Create Server</span>
								<kbd className="ml-auto text-xs text-text-tertiary bg-background px-1.5 py-0.5 rounded">
									c
								</kbd>
							</Command.Item>
						</Command.Group>

						{servers.length > 0 && (
							<>
								<Command.Separator className="h-px bg-border my-2" />
								<Command.Group
									heading="Servers"
									className="px-2 py-1.5 text-xs text-text-tertiary uppercase tracking-wider"
								>
									{servers.map((server) => (
										<Command.Item
											key={server.name}
											value={`server ${server.name} ${server.modpack || server.gameType}`}
											onSelect={() => {
												if (server.status === "stopped") {
													handleStartServer(server.name);
												} else {
													handleStopServer(server.name);
												}
											}}
											className="flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-text-secondary data-[selected=true]:bg-surface-elevated data-[selected=true]:text-text-primary"
										>
											{server.status === "stopped" ? (
												<Play size={16} className="text-success" />
											) : (
												<Square size={16} className="text-warning" />
											)}
											<span className="flex-1">{server.name}</span>
											<span className="text-xs text-text-tertiary">
												{server.modpack || server.gameType}
											</span>
											<span
												className={`text-xs px-1.5 py-0.5 rounded ${
													server.status === "running"
														? "bg-success-bg text-success"
														: "bg-surface-elevated text-text-tertiary"
												}`}
											>
												{server.status}
											</span>
										</Command.Item>
									))}
								</Command.Group>
							</>
						)}
					</Command.List>
					<div className="border-t border-border px-4 py-2 flex items-center justify-between text-xs text-text-tertiary">
						<div className="flex items-center gap-4">
							<span>
								<kbd className="bg-background px-1 py-0.5 rounded">↑↓</kbd> navigate
							</span>
							<span>
								<kbd className="bg-background px-1 py-0.5 rounded">↵</kbd> select
							</span>
							<span>
								<kbd className="bg-background px-1 py-0.5 rounded">esc</kbd> close
							</span>
						</div>
					</div>
				</div>
			</div>
		</Command.Dialog>
	);
}
