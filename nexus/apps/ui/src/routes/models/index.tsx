import type { ModelResponseType, ModelStatusType } from "@nexus/core/domains/models";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Box,
	CheckCircle,
	Cpu,
	Download,
	Loader2,
	Play,
	Plus,
	RefreshCw,
	Square,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { NewModelDialog } from "../../components/models/NewModelDialog";
import { Badge, Button, Panel } from "../../components/ui";
import { client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";

export const Route = createFileRoute("/models/")({
	component: ModelsPage,
});

function ModelsPage() {
	const [models, setModels] = useState<ModelResponseType[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreate, setShowCreate] = useState(false);
	const [busy, setBusy] = useState<Record<string, boolean>>({});

	const fetchModels = useCallback(async () => {
		try {
			const { data } = await client.api.models.get();
			if (Array.isArray(data)) setModels(data);
		} catch (err) {
			console.error("failed to fetch models", err);
			toast.error("Failed to load models");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchModels();
	}, [fetchModels]);

	useEvents("model:status", (payload) => {
		setModels((prev) =>
			prev.map((m) =>
				m.name === payload.name
					? {
							...m,
							status: payload.status as ModelStatusType,
							lastError: payload.lastError ?? m.lastError,
						}
					: m
			)
		);
	});

	const withBusy = async (name: string, fn: () => Promise<void>) => {
		setBusy((b) => ({ ...b, [name]: true }));
		try {
			await fn();
		} finally {
			setBusy((b) => ({ ...b, [name]: false }));
		}
	};

	const handleStart = (name: string) =>
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).start.post();
			if (error) toast.error(`Start failed: ${errorMessage(error.value)}`);
			else toast.success(`Starting ${name}`);
			fetchModels();
		});

	const handleStop = (name: string) =>
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).stop.post();
			if (error) toast.error(`Stop failed: ${errorMessage(error.value)}`);
			else toast.success(`Stopping ${name}`);
			fetchModels();
		});

	const handleDownload = (name: string) =>
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).download.post();
			if (error) toast.error(`Download failed: ${errorMessage(error.value)}`);
			else toast.success(`Downloading ${name}`);
			fetchModels();
		});

	const handleDelete = (name: string) => {
		if (
			!confirm(
				`Delete model "${name}"? This removes the InferenceService (weights on NAS are preserved).`
			)
		) {
			return;
		}
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).delete();
			if (error) toast.error(`Delete failed: ${errorMessage(error.value)}`);
			else toast.success(`${name} deleted`);
			fetchModels();
		});
	};

	const handleSync = (name: string) =>
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).sync.post();
			if (error) toast.error(`Sync failed: ${errorMessage(error.value)}`);
			else fetchModels();
		});

	return (
		<div className="container mx-auto space-y-4 px-4 py-4">
			{/* Header bar */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-4">
					<span className="text-text-primary font-medium">Models</span>
					<span className="text-text-tertiary">{models.length} configured</span>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="ghost" onClick={fetchModels} title="Refresh">
						<RefreshCw size={12} />
					</Button>
					<Button size="sm" onClick={() => setShowCreate(true)}>
						<Plus size={12} />
						New Model
					</Button>
				</div>
			</div>

			{showCreate && (
				<NewModelDialog
					onClose={() => setShowCreate(false)}
					onCreated={() => {
						setShowCreate(false);
						fetchModels();
					}}
				/>
			)}

			{loading ? (
				<div className="text-center py-12 text-text-tertiary">Loading...</div>
			) : models.length === 0 ? (
				<Panel title="No Models">
					<div className="text-center py-8 text-text-tertiary">
						<p>No models configured yet.</p>
						<Button size="sm" className="mt-4" onClick={() => setShowCreate(true)}>
							<Plus size={12} />
							Create your first model
						</Button>
					</div>
				</Panel>
			) : (
				<Panel
					title={
						<span className="flex items-center gap-2">
							<Cpu size={14} /> Inference Models
						</span>
					}
				>
					<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
						{models.map((m) => (
							<ModelCard
								key={m.id}
								model={m}
								busy={!!busy[m.name]}
								onStart={() => handleStart(m.name)}
								onStop={() => handleStop(m.name)}
								onDownload={() => handleDownload(m.name)}
								onDelete={() => handleDelete(m.name)}
								onSync={() => handleSync(m.name)}
							/>
						))}
					</div>
				</Panel>
			)}
		</div>
	);
}

function ModelCard({
	model,
	busy,
	onStart,
	onStop,
	onDownload,
	onDelete,
	onSync,
}: {
	model: ModelResponseType;
	busy: boolean;
	onStart: () => void;
	onStop: () => void;
	onDownload: () => void;
	onDelete: () => void;
	onSync: () => void;
}) {
	const canStart =
		model.status === "downloaded" || model.status === "stopped" || model.status === "error";
	const canStop = model.status === "running" || model.status === "starting";
	const canDownload = model.status === "draft" || model.status === "error";

	return (
		<div className="group relative p-3 bg-surface-elevated/50 hover:bg-surface-elevated rounded border border-border transition-colors">
			<div className="flex items-start justify-between gap-2">
				<div className="min-w-0 flex-1">
					<Link
						to="/models/$name"
						params={{ name: model.name }}
						className="font-medium text-sm text-text-primary hover:text-accent transition-colors truncate block"
					>
						{model.name}
					</Link>
					<div className="text-xs text-text-tertiary font-mono truncate mt-0.5">
						{model.hfRepoId}
						{model.hfRevision ? (
							<span className="text-text-tertiary/70">@{model.hfRevision.slice(0, 8)}</span>
						) : null}
					</div>
				</div>
				<StatusBadge status={model.status} />
			</div>

			{model.lastError && (
				<div className="mt-2 text-xs text-error line-clamp-2" title={model.lastError}>
					{model.lastError}
				</div>
			)}

			<div className="mt-3 flex flex-wrap items-center gap-1.5">
				{canStart && (
					<Button size="sm" variant="outline" onClick={onStart} disabled={busy} title="Start">
						<Play size={10} /> Start
					</Button>
				)}
				{canStop && (
					<Button size="sm" variant="outline" onClick={onStop} disabled={busy} title="Stop">
						<Square size={10} /> Stop
					</Button>
				)}
				{canDownload && (
					<Button
						size="sm"
						variant="ghost"
						onClick={onDownload}
						disabled={busy}
						title="Download weights"
					>
						<Download size={10} /> Download
					</Button>
				)}
				<Button size="sm" variant="ghost" onClick={onSync} disabled={busy} title="Refresh status">
					<RefreshCw size={10} />
				</Button>
				<Button size="sm" variant="ghost" onClick={onDelete} disabled={busy} title="Delete">
					<Trash2 size={10} />
				</Button>
			</div>
		</div>
	);
}

function StatusBadge({ status }: { status: ModelStatusType }) {
	const map: Record<
		ModelStatusType,
		{
			variant: "success" | "warning" | "error" | "info" | "default";
			icon: React.ReactNode;
			label: string;
		}
	> = {
		draft: { variant: "default", icon: <Box size={10} />, label: "draft" },
		downloading: {
			variant: "info",
			icon: <Loader2 size={10} className="animate-spin" />,
			label: "downloading",
		},
		downloaded: { variant: "info", icon: <CheckCircle size={10} />, label: "downloaded" },
		starting: {
			variant: "warning",
			icon: <Loader2 size={10} className="animate-spin" />,
			label: "starting",
		},
		running: { variant: "success", icon: <CheckCircle size={10} />, label: "running" },
		stopping: {
			variant: "warning",
			icon: <Loader2 size={10} className="animate-spin" />,
			label: "stopping",
		},
		stopped: { variant: "default", icon: <Square size={10} />, label: "stopped" },
		error: { variant: "error", icon: <XCircle size={10} />, label: "error" },
	};
	const entry = map[status];
	return (
		<Badge variant={entry.variant}>
			<span className="flex items-center gap-1">
				{entry.icon}
				{entry.label}
			</span>
		</Badge>
	);
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
