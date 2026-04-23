import type { ModelResponseType, ModelStatusType } from "@nexus/core/domains/models";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
	Activity,
	AlertOctagon,
	ArrowUpRight,
	Cpu,
	Download,
	Play,
	Plus,
	RefreshCw,
	Square,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { NewModelDialog } from "../../components/models/NewModelDialog";
import { Button } from "../../components/ui";
import { client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";

export const Route = createFileRoute("/models/")({
	component: ModelsPage,
});

// ---- status → color tokens -------------------------------------------------

type StatusTone = {
	rail: string;
	label: string;
	glyph: string;
	dot: string;
};

const STATUS_TONE: Record<ModelStatusType, StatusTone> = {
	draft: {
		rail: "bg-text-tertiary/40",
		label: "text-text-tertiary",
		glyph: "text-text-tertiary/10",
		dot: "bg-text-tertiary",
	},
	downloading: {
		rail: "bg-info",
		label: "text-info",
		glyph: "text-info/10",
		dot: "bg-info",
	},
	downloaded: {
		rail: "bg-info/60",
		label: "text-info",
		glyph: "text-info/10",
		dot: "bg-info/60",
	},
	starting: {
		rail: "bg-warning",
		label: "text-warning",
		glyph: "text-warning/10",
		dot: "bg-warning",
	},
	running: {
		rail: "bg-success",
		label: "text-success",
		glyph: "text-success/10",
		dot: "bg-success",
	},
	stopping: {
		rail: "bg-warning/70",
		label: "text-warning",
		glyph: "text-warning/10",
		dot: "bg-warning/70",
	},
	stopped: {
		rail: "bg-text-tertiary/60",
		label: "text-text-tertiary",
		glyph: "text-text-tertiary/10",
		dot: "bg-text-tertiary/60",
	},
	error: {
		rail: "bg-error",
		label: "text-error",
		glyph: "text-error/10",
		dot: "bg-error",
	},
};

const STATUS_LABELS: Record<ModelStatusType, string> = {
	draft: "DRAFT",
	downloading: "DOWNLOADING",
	downloaded: "READY",
	starting: "STARTING",
	running: "ONLINE",
	stopping: "STOPPING",
	stopped: "OFFLINE",
	error: "FAULT",
};

// Derive a 2-3 character monogram from the slug (used as a faded glyph).
function monogram(slug: string): string {
	const parts = slug.replace(/_/g, "-").split("-").filter(Boolean);
	if (parts.length === 0) return slug.slice(0, 2).toUpperCase();
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? "")).toUpperCase();
}

type FilterId = "all" | "active" | "draft" | "error";

function ModelsPage() {
	const [models, setModels] = useState<ModelResponseType[]>([]);
	const [loading, setLoading] = useState(true);
	const [showCreate, setShowCreate] = useState(false);
	const [busy, setBusy] = useState<Record<string, boolean>>({});
	const [filter, setFilter] = useState<FilterId>("all");

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

	// ---- stats ---------------------------------------------------------------
	const stats = useMemo(() => {
		const count = (s: ModelStatusType) => models.filter((m) => m.status === s).length;
		return {
			total: models.length,
			online: count("running"),
			downloading: count("downloading"),
			faults: count("error"),
		};
	}, [models]);

	const filtered = useMemo(() => {
		if (filter === "active") {
			return models.filter((m) => m.status === "running" || m.status === "starting");
		}
		if (filter === "draft") {
			return models.filter(
				(m) => m.status === "draft" || m.status === "downloading" || m.status === "downloaded"
			);
		}
		if (filter === "error") return models.filter((m) => m.status === "error");
		return models;
	}, [models, filter]);

	// ---- actions -------------------------------------------------------------
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
		)
			return;
		withBusy(name, async () => {
			const { error } = await client.api.models({ name }).delete();
			if (error) toast.error(`Delete failed: ${errorMessage(error.value)}`);
			else toast.success(`${name} deleted`);
			fetchModels();
		});
	};

	return (
		<div className="container mx-auto px-4 py-6 space-y-6">
			{/* =============== Header =============== */}
			<header className="flex items-end justify-between gap-4 animate-panel stagger-1">
				<div>
					<div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-[0.3em] text-text-tertiary">
						<Cpu size={10} />
						<span>inference fleet</span>
					</div>
					<h1 className="mt-1 font-display text-4xl font-semibold tracking-tight text-text-primary">
						Models
					</h1>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="ghost" onClick={fetchModels} title="Refresh">
						<RefreshCw size={12} />
					</Button>
					<Button size="sm" onClick={() => setShowCreate(true)}>
						<Plus size={12} />
						Deploy Model
					</Button>
				</div>
			</header>

			{/* =============== KPI Strip =============== */}
			<FleetStats stats={stats} />

			{/* =============== Filter Rail =============== */}
			<div className="flex items-center gap-2 text-[11px] font-display uppercase tracking-[0.2em] animate-panel stagger-3">
				{(
					[
						{ id: "all", label: `All · ${stats.total}` },
						{ id: "active", label: `Online · ${stats.online}` },
						{ id: "draft", label: "Staging" },
						{ id: "error", label: `Faults · ${stats.faults}` },
					] as { id: FilterId; label: string }[]
				).map((f) => {
					const active = filter === f.id;
					return (
						<button
							key={f.id}
							type="button"
							onClick={() => setFilter(f.id)}
							className={`px-3 py-1.5 rounded-sm border transition-colors ${
								active
									? "border-accent text-accent bg-accent/5"
									: "border-border text-text-tertiary hover:text-text-secondary hover:border-border-strong"
							}`}
						>
							{f.label}
						</button>
					);
				})}
			</div>

			{/* =============== Grid =============== */}
			{loading ? (
				<EmptyState message="Loading fleet manifest..." />
			) : filtered.length === 0 ? (
				models.length === 0 ? (
					<EmptyCreate onCreate={() => setShowCreate(true)} />
				) : (
					<EmptyState message="No models match this filter." />
				)
			) : (
				<div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 animate-panel stagger-4">
					{filtered.map((m) => (
						<ModelTile
							key={m.id}
							model={m}
							busy={!!busy[m.name]}
							onStart={() => handleStart(m.name)}
							onStop={() => handleStop(m.name)}
							onDownload={() => handleDownload(m.name)}
							onDelete={() => handleDelete(m.name)}
						/>
					))}
				</div>
			)}

			{showCreate && (
				<NewModelDialog
					onClose={() => setShowCreate(false)}
					onCreated={() => {
						setShowCreate(false);
						fetchModels();
					}}
				/>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Fleet Stats — "mission control" kpi strip
// ---------------------------------------------------------------------------

function FleetStats({
	stats,
}: {
	stats: { total: number; online: number; downloading: number; faults: number };
}) {
	return (
		<div className="grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border rounded overflow-hidden animate-panel stagger-2">
			<StatCell label="Deployed" value={stats.total} />
			<StatCell
				label="Online"
				value={stats.online}
				accent={stats.online > 0 ? "text-success" : undefined}
				pulse={stats.online > 0}
			/>
			<StatCell
				label="Downloading"
				value={stats.downloading}
				accent={stats.downloading > 0 ? "text-info" : undefined}
			/>
			<StatCell
				label="Faults"
				value={stats.faults}
				accent={stats.faults > 0 ? "text-error" : undefined}
				icon={stats.faults > 0 ? <AlertOctagon size={14} /> : undefined}
			/>
		</div>
	);
}

function StatCell({
	label,
	value,
	accent,
	icon,
	pulse,
}: {
	label: string;
	value: number;
	accent?: string;
	icon?: React.ReactNode;
	pulse?: boolean;
}) {
	return (
		<div className="relative bg-surface/80 px-5 py-4">
			<div className="flex items-center gap-1.5 text-[10px] font-display uppercase tracking-[0.25em] text-text-tertiary">
				{icon}
				{label}
			</div>
			<div className="mt-1 flex items-baseline gap-2">
				<span
					className={`font-display text-4xl font-semibold tabular-nums leading-none ${accent ?? "text-text-primary"}`}
				>
					{value.toString().padStart(2, "0")}
				</span>
				{pulse && (
					<span className="relative flex h-2 w-2 mb-1">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
					</span>
				)}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Model Tile — fleet unit card
// ---------------------------------------------------------------------------

function ModelTile({
	model,
	busy,
	onStart,
	onStop,
	onDownload,
	onDelete,
}: {
	model: ModelResponseType;
	busy: boolean;
	onStart: () => void;
	onStop: () => void;
	onDownload: () => void;
	onDelete: () => void;
}) {
	const tone = STATUS_TONE[model.status];
	const canStart =
		model.status === "downloaded" || model.status === "stopped" || model.status === "error";
	const canStop = model.status === "running" || model.status === "starting";
	const canDownload = model.status === "draft" || model.status === "error";
	const mono = monogram(model.name);

	const cfg = model.config ?? {};
	const chips: { label: string; value: string }[] = [];
	if (cfg.tensorParallel) chips.push({ label: "tp", value: String(cfg.tensorParallel) });
	if (cfg.maxModelLen) chips.push({ label: "ctx", value: formatCtx(Number(cfg.maxModelLen)) });
	if (cfg.dtype) chips.push({ label: "dt", value: String(cfg.dtype) });
	if (model.metadata?.modelParams)
		chips.push({ label: "p", value: String(model.metadata.modelParams) });

	return (
		<Link
			to="/models/$name"
			params={{ name: model.name }}
			className="group relative block overflow-hidden rounded border border-border bg-surface hover-glow transition-all hover:-translate-y-px"
		>
			{/* Left status rail */}
			<div className={`absolute left-0 top-0 bottom-0 w-[3px] ${tone.rail}`} />

			{/* Giant faded monogram */}
			<div
				className={`pointer-events-none absolute right-2 top-1 font-display text-7xl font-semibold leading-none tracking-tighter select-none ${tone.glyph}`}
			>
				{mono}
			</div>

			<div className="relative pl-5 pr-4 py-4 space-y-3">
				{/* Title row */}
				<div className="flex items-start justify-between gap-3 pr-14">
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-2">
							<span className="font-display text-base font-semibold text-text-primary truncate">
								{model.name}
							</span>
							<ArrowUpRight
								size={12}
								className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity"
							/>
						</div>
						<div className="mt-0.5 font-mono text-[11px] text-text-tertiary truncate">
							{model.hfRepoId}
							{model.hfRevision ? (
								<span className="text-text-tertiary/70"> @{model.hfRevision.slice(0, 8)}</span>
							) : null}
						</div>
					</div>
				</div>

				{/* Status line */}
				<div className="flex items-center gap-2">
					<span className="relative flex h-1.5 w-1.5">
						{(model.status === "running" ||
							model.status === "starting" ||
							model.status === "downloading") && (
							<span
								className={`absolute inline-flex h-full w-full animate-ping rounded-full ${tone.dot} opacity-60`}
							/>
						)}
						<span className={`relative inline-flex h-1.5 w-1.5 rounded-full ${tone.dot}`} />
					</span>
					<span className={`font-display text-[10px] uppercase tracking-[0.2em] ${tone.label}`}>
						{STATUS_LABELS[model.status]}
					</span>
					{model.runtime && (
						<span className="ml-auto text-[10px] font-mono text-text-tertiary">
							{model.runtime}
						</span>
					)}
				</div>

				{/* Chips */}
				{chips.length > 0 && (
					<div className="flex flex-wrap items-center gap-1.5">
						{chips.map((c) => (
							<span
								key={c.label}
								className="inline-flex items-baseline gap-1 rounded-sm border border-border-strong bg-surface-elevated/50 px-1.5 py-0.5 text-[10px] font-mono text-text-secondary"
							>
								<span className="text-text-tertiary uppercase">{c.label}</span>
								<span className="text-text-primary">{c.value}</span>
							</span>
						))}
					</div>
				)}

				{/* Error line */}
				{model.lastError && (
					<div
						className="rounded-sm border border-error/30 bg-error-bg/50 px-2 py-1.5 text-[11px] text-error/90 line-clamp-2"
						title={model.lastError}
					>
						{model.lastError}
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center gap-1 pt-1 opacity-60 group-hover:opacity-100 transition-opacity">
					{canStart && (
						<TileAction onClick={onStart} disabled={busy} label="Start">
							<Play size={10} />
						</TileAction>
					)}
					{canStop && (
						<TileAction onClick={onStop} disabled={busy} label="Stop">
							<Square size={10} />
						</TileAction>
					)}
					{canDownload && (
						<TileAction onClick={onDownload} disabled={busy} label="Pull">
							<Download size={10} />
						</TileAction>
					)}
					<div className="ml-auto">
						<TileAction onClick={onDelete} disabled={busy} label="Remove" danger>
							<Trash2 size={10} />
						</TileAction>
					</div>
				</div>
			</div>

			{/* Inline download progress bar */}
			{model.status === "downloading" && (
				<div className="relative h-[2px] w-full bg-surface-elevated overflow-hidden">
					<div className="absolute inset-y-0 w-1/2 bg-gradient-to-r from-info/0 via-info to-info/0 animate-shimmer" />
				</div>
			)}

			{/* Hover accent border */}
			<div className="pointer-events-none absolute inset-0 rounded border border-transparent group-hover:border-accent/30 transition-colors" />
		</Link>
	);
}

function TileAction({
	onClick,
	disabled,
	label,
	children,
	danger,
}: {
	onClick: () => void;
	disabled: boolean;
	label: string;
	children: React.ReactNode;
	danger?: boolean;
}) {
	return (
		<button
			type="button"
			onClick={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onClick();
			}}
			disabled={disabled}
			title={label}
			className={`inline-flex items-center gap-1 rounded-sm border border-transparent px-2 py-1 text-[10px] font-display uppercase tracking-wider transition-colors ${
				danger
					? "text-text-tertiary hover:text-error hover:border-error/30 hover:bg-error-bg"
					: "text-text-tertiary hover:text-accent hover:border-accent/30 hover:bg-accent/5"
			} disabled:opacity-40 disabled:pointer-events-none`}
		>
			{children}
			{label}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Empty states
// ---------------------------------------------------------------------------

function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex flex-col items-center justify-center gap-2 py-16 text-text-tertiary text-sm font-display tracking-wide">
			<Activity size={20} className="opacity-50" />
			{message}
		</div>
	);
}

function EmptyCreate({ onCreate }: { onCreate: () => void }) {
	return (
		<div className="rounded border border-dashed border-border-strong bg-surface/50 py-16 flex flex-col items-center justify-center gap-4">
			<div className="font-display text-xs uppercase tracking-[0.3em] text-text-tertiary">
				empty hangar
			</div>
			<div className="font-display text-xl text-text-secondary max-w-md text-center px-4">
				No models deployed. Pull one from HuggingFace to begin.
			</div>
			<Button size="sm" onClick={onCreate}>
				<Plus size={12} />
				Deploy First Model
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatCtx(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return String(n);
	if (n >= 1000) return `${(n / 1024).toFixed(0)}k`;
	return String(n);
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
