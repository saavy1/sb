import type {
	ModelConfigType,
	ModelEnvVarType,
	ModelWithLiveStatusType,
} from "@nexus/core/domains/models";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, ChevronRight, Loader2, Save, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label } from "../../components/ui";
import { client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";

export const Route = createFileRoute("/models/$name")({
	component: ModelDetailPage,
});

// ---- status tokens ---------------------------------------------------------

const STATUS_TONE = {
	draft: { text: "text-text-tertiary", bg: "bg-text-tertiary", label: "DRAFT" },
	downloading: { text: "text-info", bg: "bg-info", label: "DOWNLOADING" },
	downloaded: { text: "text-info", bg: "bg-info/70", label: "READY" },
	starting: { text: "text-warning", bg: "bg-warning", label: "STARTING" },
	running: { text: "text-success", bg: "bg-success", label: "ONLINE" },
	stopping: { text: "text-warning", bg: "bg-warning/70", label: "STOPPING" },
	stopped: { text: "text-text-tertiary", bg: "bg-text-tertiary", label: "OFFLINE" },
	error: { text: "text-error", bg: "bg-error", label: "FAULT" },
} as const;

// Lifecycle phases shown in the status rail at the top of the page.
// Mapping from status → which phase index is "current".
const PHASES = ["DRAFT", "PULL", "READY", "ONLINE"] as const;
function phaseIndex(status: ModelWithLiveStatusType["status"]): number {
	if (status === "draft") return 0;
	if (status === "downloading") return 1;
	if (status === "downloaded" || status === "stopped") return 2;
	if (status === "starting" || status === "running" || status === "stopping") return 3;
	return 0;
}

function ModelDetailPage() {
	const { name } = Route.useParams();
	const navigate = useNavigate();
	const [model, setModel] = useState<ModelWithLiveStatusType | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// Editable config fields (local draft state)
	const [servedModelName, setServedModelName] = useState("");
	const [tensorParallel, setTensorParallel] = useState("");
	const [gpuMemoryUtilization, setGpuMemoryUtilization] = useState("");
	const [maxModelLen, setMaxModelLen] = useState("");
	const [dtype, setDtype] = useState("");
	const [toolCallParser, setToolCallParser] = useState("");
	const [reasoningParser, setReasoningParser] = useState("");
	const [extraArgs, setExtraArgs] = useState("");
	const [envVars, setEnvVars] = useState<ModelEnvVarType[]>([]);

	// Live download-progress from the agent-worker. Null when not downloading.
	const [downloadProgress, setDownloadProgress] = useState<{
		phase: string;
		filesTotal?: number;
		filesDone?: number;
		bytesTotal?: number;
		bytesDone?: number;
		currentFile?: string;
		error?: string;
	} | null>(null);

	const hydrateForm = useCallback((m: ModelWithLiveStatusType) => {
		setServedModelName(m.servedModelName ?? "");
		setTensorParallel(m.config?.tensorParallel?.toString() ?? "");
		setGpuMemoryUtilization(m.config?.gpuMemoryUtilization?.toString() ?? "");
		setMaxModelLen(m.config?.maxModelLen?.toString() ?? "");
		setDtype(m.config?.dtype ?? "");
		setToolCallParser(m.config?.toolCallParser ?? "");
		setReasoningParser(m.config?.reasoningParser ?? "");
		setExtraArgs((m.config?.extraArgs ?? []).join("\n"));
		setEnvVars([...(m.config?.env ?? [])]);
	}, []);

	const fetchModel = useCallback(async () => {
		try {
			const { data } = await client.api.models({ name }).get();
			if (data && !("error" in data)) {
				setModel(data);
				hydrateForm(data);
			}
		} catch (err) {
			console.error("failed to fetch model", err);
			toast.error("Failed to load model");
		} finally {
			setLoading(false);
		}
	}, [name, hydrateForm]);

	useEffect(() => {
		fetchModel();
	}, [fetchModel]);

	useEvents("model:download-progress", (payload) => {
		if (payload.name !== name) return;
		setDownloadProgress({
			phase: payload.phase,
			filesTotal: payload.filesTotal,
			filesDone: payload.filesDone,
			bytesTotal: payload.bytesTotal,
			bytesDone: payload.bytesDone,
			currentFile: payload.currentFile,
			error: payload.error,
		});
		if (payload.phase === "complete" || payload.phase === "error") {
			setTimeout(() => setDownloadProgress(null), 1500);
		}
	});

	useEvents("model:status", (payload) => {
		if (payload.name !== name) return;
		setTimeout(fetchModel, 200);
	});

	if (loading) {
		return (
			<div className="container mx-auto px-4 py-16 text-center text-text-tertiary font-display tracking-wider text-sm">
				Loading manifest...
			</div>
		);
	}
	if (!model) {
		return (
			<div className="container mx-auto px-4 py-16 text-center text-text-tertiary">
				<div className="font-display text-sm mb-4">Model not found.</div>
				<Button size="sm" variant="outline" onClick={() => navigate({ to: "/models" })}>
					<ArrowLeft size={12} /> Back to Fleet
				</Button>
			</div>
		);
	}

	// ---- handlers -----------------------------------------------------------

	const handleSave = async () => {
		setSaving(true);
		try {
			const parsedTp = tensorParallel ? Number(tensorParallel) : undefined;
			const parsedMem = gpuMemoryUtilization ? Number(gpuMemoryUtilization) : undefined;
			const parsedMaxLen = maxModelLen ? Number(maxModelLen) : undefined;
			const parsedArgs = extraArgs
				.split("\n")
				.map((s) => s.trim())
				.filter(Boolean);
			const config: ModelConfigType = {
				tensorParallel: Number.isFinite(parsedTp) ? (parsedTp as number) : undefined,
				gpuMemoryUtilization: Number.isFinite(parsedMem) ? (parsedMem as number) : undefined,
				maxModelLen: Number.isFinite(parsedMaxLen) ? (parsedMaxLen as number) : undefined,
				dtype: dtype || undefined,
				toolCallParser: toolCallParser || undefined,
				reasoningParser: reasoningParser || undefined,
				extraArgs: parsedArgs.length ? parsedArgs : undefined,
				env: envVars.filter((e) => e.name.trim()),
			};
			const { error } = await client.api.models({ name }).patch({
				servedModelName: servedModelName || null,
				config,
			});
			if (error) toast.error(`Save failed: ${errorMessage(error.value)}`);
			else {
				toast.success("Config saved");
				fetchModel();
			}
		} finally {
			setSaving(false);
		}
	};

	const handleStart = async () => {
		const { error } = await client.api.models({ name }).start.post();
		if (error) toast.error(`Start failed: ${errorMessage(error.value)}`);
		else fetchModel();
	};
	const handleStop = async () => {
		const { error } = await client.api.models({ name }).stop.post();
		if (error) toast.error(`Stop failed: ${errorMessage(error.value)}`);
		else fetchModel();
	};
	const handleDownload = async () => {
		const { error } = await client.api.models({ name }).download.post();
		if (error) toast.error(`Download failed: ${errorMessage(error.value)}`);
		else {
			toast.success("Pull queued");
			fetchModel();
		}
	};
	const handleDelete = async () => {
		if (!confirm(`Delete "${name}"? Weights on NAS are preserved.`)) return;
		const { error } = await client.api.models({ name }).delete();
		if (error) toast.error(`Delete failed: ${errorMessage(error.value)}`);
		else {
			toast.success(`${name} deleted`);
			navigate({ to: "/models" });
		}
	};
	const handleSync = async () => {
		const { error } = await client.api.models({ name }).sync.post();
		if (error) toast.error(`Sync failed: ${errorMessage(error.value)}`);
		else fetchModel();
	};

	const canStart =
		model.status === "downloaded" || model.status === "stopped" || model.status === "error";
	const canStop = model.status === "running" || model.status === "starting";
	const canDownload = model.status === "draft" || model.status === "error";

	const tone = STATUS_TONE[model.status];
	const currentPhase = phaseIndex(model.status);

	return (
		<div className="container mx-auto px-4 py-6 space-y-5">
			{/* =============== Breadcrumb =============== */}
			<div className="flex items-center gap-2 text-[11px] font-display uppercase tracking-[0.25em] text-text-tertiary animate-panel stagger-1">
				<button
					type="button"
					onClick={() => navigate({ to: "/models" })}
					className="hover:text-text-secondary transition-colors flex items-center gap-1"
				>
					<ArrowLeft size={10} /> fleet
				</button>
				<ChevronRight size={10} />
				<span className="text-text-secondary">{model.name}</span>
			</div>

			{/* =============== Header + action strip =============== */}
			<header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 animate-panel stagger-2">
				<div>
					<div className="flex items-baseline gap-3">
						<h1 className="font-display text-4xl font-semibold tracking-tight text-text-primary">
							{model.name}
						</h1>
						<span className={`font-display text-xs uppercase tracking-[0.25em] ${tone.text}`}>
							● {tone.label}
						</span>
					</div>
					<div className="mt-1 font-mono text-sm text-text-tertiary">
						{model.hfRepoId}
						{model.hfRevision && (
							<span className="text-text-tertiary/60"> @{model.hfRevision.slice(0, 12)}</span>
						)}
					</div>
				</div>
				<div className="flex flex-wrap items-center gap-1.5">
					{canStart && <CommandButton onClick={handleStart} label="START" kbd="⏵" primary />}
					{canStop && <CommandButton onClick={handleStop} label="STOP" kbd="◼" />}
					{canDownload && <CommandButton onClick={handleDownload} label="PULL" kbd="↓" />}
					<CommandButton onClick={handleSync} label="SYNC" kbd="↻" />
					<CommandButton onClick={handleDelete} label="RM" kbd="×" danger />
				</div>
			</header>

			{/* =============== Phase rail =============== */}
			<section className="animate-panel stagger-3">
				<div className="flex items-center gap-0">
					{PHASES.map((p, i) => {
						const done = i < currentPhase;
						const current = i === currentPhase;
						const trailColor = i < currentPhase ? "bg-accent" : "bg-border";
						return (
							<div key={p} className="flex items-center flex-1 last:flex-none">
								<div className="flex flex-col items-center gap-1.5">
									<div className="relative flex items-center justify-center w-5 h-5">
										{current && (
											<span
												className={`absolute inset-0 animate-ping rounded-full ${tone.bg} opacity-30`}
											/>
										)}
										<div
											className={`relative w-2.5 h-2.5 rounded-full ${
												current
													? tone.bg
													: done
														? "bg-accent"
														: "bg-surface-elevated border border-border-strong"
											}`}
										/>
									</div>
									<span
										className={`font-display text-[10px] uppercase tracking-[0.2em] whitespace-nowrap ${
											current ? tone.text : done ? "text-accent" : "text-text-tertiary"
										}`}
									>
										{p}
									</span>
								</div>
								{i < PHASES.length - 1 && <div className={`flex-1 h-px mx-2 mb-5 ${trailColor}`} />}
							</div>
						);
					})}
				</div>
				{model.lastError && (
					<div className="mt-4 rounded-sm border border-error/40 bg-error-bg/70 px-3 py-2 text-xs text-error flex items-start gap-2">
						<span className="font-display uppercase tracking-wider shrink-0">fault·</span>
						<span>{model.lastError}</span>
					</div>
				)}
			</section>

			{/* =============== Dossier grid =============== */}
			<section className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border rounded overflow-hidden animate-panel stagger-4">
				<DossierColumn
					label="Identity"
					rows={[
						{ k: "slug", v: model.name, mono: true },
						{ k: "hf repo", v: model.hfRepoId, mono: true },
						{ k: "revision", v: model.hfRevision ?? "main", mono: true },
						{ k: "served as", v: model.servedModelName ?? model.name, mono: true },
					]}
				/>
				<DossierColumn
					label="Runtime"
					rows={[
						{ k: "engine", v: model.runtime.toUpperCase(), mono: true },
						{
							k: "readiness",
							v: model.live?.ready ? "ready" : "not ready",
							highlight: model.live?.ready ? "text-success" : "text-text-tertiary",
						},
						{ k: "url", v: model.live?.url ?? "–", mono: true, truncate: true },
						{
							k: "last start",
							v: model.lastStartedAt
								? new Date(model.lastStartedAt).toLocaleString(undefined, {
										month: "short",
										day: "numeric",
										hour: "2-digit",
										minute: "2-digit",
									})
								: "never",
						},
					]}
				/>
				<DossierColumn
					label="Storage"
					rows={[
						{
							k: "weights",
							v:
								model.status === "draft"
									? "not pulled"
									: model.status === "downloading"
										? "pulling…"
										: "resident",
							highlight:
								model.status === "draft"
									? "text-text-tertiary"
									: model.status === "downloading"
										? "text-info"
										: "text-success",
						},
						{ k: "nas path", v: `/tank/models/${model.name}`, mono: true, truncate: true },
						...(model.metadata?.modelParams
							? [{ k: "params", v: String(model.metadata.modelParams), mono: true }]
							: []),
						...(model.metadata?.modelDtype
							? [{ k: "dtype", v: String(model.metadata.modelDtype), mono: true }]
							: []),
					]}
				/>
			</section>

			{/* =============== Live download telemetry =============== */}
			{(model.status === "downloading" || downloadProgress) && (
				<DownloadTelemetry progress={downloadProgress} />
			)}

			{/* =============== Conditions (k8s InferenceService) =============== */}
			{model.live?.conditions && model.live.conditions.length > 0 && (
				<section className="border border-border rounded bg-surface animate-panel stagger-5">
					<SectionHeader num="··" title="Conditions" />
					<div className="p-4 space-y-1.5">
						{model.live.conditions.map((c, idx) => (
							<div key={`${c.type}-${idx}`} className="flex items-center gap-3 text-xs font-mono">
								<span className="text-text-secondary w-40 truncate">{c.type}</span>
								<span className={c.status === "True" ? "text-success" : "text-warning"}>
									{c.status}
								</span>
								{c.message && <span className="text-text-tertiary truncate">{c.message}</span>}
							</div>
						))}
					</div>
				</section>
			)}

			{/* =============== Config spec =============== */}
			<section className="border border-border rounded bg-surface animate-panel stagger-6">
				<SectionHeader
					num="01"
					title="Config · vLLM"
					action={
						<Button size="sm" onClick={handleSave} disabled={saving}>
							{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
							Save
						</Button>
					}
				/>
				<div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
					<Field label="Served model name" hint="exposed over OpenAI API">
						<Input
							value={servedModelName}
							onChange={(e) => setServedModelName(e.target.value)}
							placeholder={model.name}
							className="font-mono"
						/>
					</Field>
					<Field label="Tensor parallel" hint="GPU count">
						<Input
							type="number"
							min={1}
							max={8}
							value={tensorParallel}
							onChange={(e) => setTensorParallel(e.target.value)}
							placeholder="1"
							className="font-mono"
						/>
					</Field>
					<Field label="GPU memory util" hint="0.1 – 1.0">
						<Input
							type="number"
							step="0.05"
							min={0.1}
							max={1}
							value={gpuMemoryUtilization}
							onChange={(e) => setGpuMemoryUtilization(e.target.value)}
							placeholder="0.9"
							className="font-mono"
						/>
					</Field>
					<Field label="Max model len" hint="tokens">
						<Input
							type="number"
							value={maxModelLen}
							onChange={(e) => setMaxModelLen(e.target.value)}
							placeholder="32768"
							className="font-mono"
						/>
					</Field>
					<Field label="Dtype">
						<Input
							value={dtype}
							onChange={(e) => setDtype(e.target.value)}
							placeholder="bfloat16 / float16 / auto"
							className="font-mono"
						/>
					</Field>
					<Field label="Tool-call parser">
						<Input
							value={toolCallParser}
							onChange={(e) => setToolCallParser(e.target.value)}
							placeholder="hermes, qwen3_coder…"
							className="font-mono"
						/>
					</Field>
					<Field label="Reasoning parser" fullWidth>
						<Input
							value={reasoningParser}
							onChange={(e) => setReasoningParser(e.target.value)}
							placeholder="qwen3, deepseek_r1…"
							className="font-mono"
						/>
					</Field>
				</div>
			</section>

			<section className="border border-border rounded bg-surface animate-panel stagger-7">
				<SectionHeader num="02" title="Extra args" />
				<div className="p-4">
					<textarea
						className="w-full min-h-[80px] px-3 py-2 bg-background border border-border rounded-sm text-sm font-mono text-text-primary focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30 resize-y"
						value={extraArgs}
						onChange={(e) => setExtraArgs(e.target.value)}
						placeholder="--kv-cache-dtype=fp8&#10;--enable-prefix-caching"
					/>
				</div>
			</section>

			<section className="border border-border rounded bg-surface animate-panel stagger-8">
				<SectionHeader num="03" title="Environment" />
				<div className="p-4">
					<EnvEditor env={envVars} onChange={setEnvVars} />
				</div>
			</section>

			{model.metadata && Object.keys(model.metadata).length > 0 && (
				<section className="border border-border rounded bg-surface animate-panel stagger-8">
					<SectionHeader num="04" title="Recipe metadata" />
					<div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-2 text-xs font-mono">
						{model.metadata.description && (
							<MetaRow k="description" v={model.metadata.description} mono={false} />
						)}
						{model.metadata.maintainer && <MetaRow k="maintainer" v={model.metadata.maintainer} />}
						{model.metadata.modelParams && <MetaRow k="params" v={model.metadata.modelParams} />}
						{model.metadata.modelDtype && (
							<MetaRow k="weight dtype" v={model.metadata.modelDtype} />
						)}
						{model.metadata.kvDtype && <MetaRow k="kv dtype" v={model.metadata.kvDtype} />}
					</div>
					{model.sparkArenaSource && (
						<div className="px-4 pb-4 text-[11px] text-text-tertiary">
							imported from <span className="font-mono">{model.sparkArenaSource}</span>
						</div>
					)}
				</section>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// Command-bar button — bracketed, keyboard-hint style
// ---------------------------------------------------------------------------

function CommandButton({
	onClick,
	label,
	kbd,
	primary,
	danger,
}: {
	onClick: () => void;
	label: string;
	kbd: string;
	primary?: boolean;
	danger?: boolean;
}) {
	const base =
		"inline-flex items-center gap-2 px-3 py-1.5 rounded-sm text-[11px] font-display uppercase tracking-[0.2em] border transition-colors";
	const tone = primary
		? "border-accent/50 bg-accent/10 text-accent hover:bg-accent/20"
		: danger
			? "border-border text-text-tertiary hover:border-error/40 hover:text-error hover:bg-error-bg/50"
			: "border-border text-text-secondary hover:border-border-strong hover:text-text-primary hover:bg-surface-elevated";
	return (
		<button type="button" onClick={onClick} className={`${base} ${tone}`}>
			<span className="font-mono text-sm leading-none">[{kbd}]</span>
			{label}
		</button>
	);
}

// ---------------------------------------------------------------------------
// Section header with numeric prefix — "01 Config"
// ---------------------------------------------------------------------------

function SectionHeader({
	num,
	title,
	action,
}: {
	num: string;
	title: string;
	action?: React.ReactNode;
}) {
	return (
		<header className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-surface-elevated/30">
			<div className="flex items-baseline gap-3">
				<span className="font-display text-[10px] text-text-tertiary tabular-nums">{num}</span>
				<span className="font-display text-xs uppercase tracking-[0.2em] text-text-secondary">
					{title}
				</span>
			</div>
			{action}
		</header>
	);
}

// ---------------------------------------------------------------------------
// Dossier column (identity / runtime / storage)
// ---------------------------------------------------------------------------

interface DossierRow {
	k: string;
	v: string;
	mono?: boolean;
	highlight?: string;
	truncate?: boolean;
}

function DossierColumn({ label, rows }: { label: string; rows: DossierRow[] }) {
	return (
		<div className="bg-surface px-5 py-4">
			<div className="font-display text-[10px] uppercase tracking-[0.3em] text-text-tertiary mb-3">
				{label}
			</div>
			<div className="space-y-2">
				{rows.map((r) => (
					<div key={r.k} className="flex items-start justify-between gap-3 text-xs">
						<span className="text-text-tertiary/80 font-display shrink-0">{r.k}</span>
						<span
							className={`text-right min-w-0 ${r.mono ? "font-mono" : ""} ${
								r.highlight ?? "text-text-primary"
							} ${r.truncate ? "truncate" : ""}`}
							title={r.v}
						>
							{r.v}
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Download telemetry — live progress panel
// ---------------------------------------------------------------------------

function DownloadTelemetry({
	progress,
}: {
	progress: {
		phase: string;
		filesTotal?: number;
		filesDone?: number;
		bytesTotal?: number;
		bytesDone?: number;
		currentFile?: string;
		error?: string;
	} | null;
}) {
	const p = progress;
	const bytesPct =
		p?.bytesTotal && p.bytesTotal > 0 && p.bytesDone !== undefined
			? Math.min(100, (p.bytesDone / p.bytesTotal) * 100)
			: null;

	return (
		<section className="border border-info/30 bg-info-bg/30 rounded overflow-hidden animate-panel stagger-5">
			<header className="flex items-center justify-between px-4 py-2.5 border-b border-info/30 bg-info/5">
				<div className="flex items-baseline gap-3">
					<span className="relative flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-info opacity-60" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-info" />
					</span>
					<span className="font-display text-xs uppercase tracking-[0.2em] text-info">
						Telemetry · {p?.phase ?? "queued"}
					</span>
				</div>
				<span className="font-mono text-xs text-info tabular-nums">
					{bytesPct !== null ? `${bytesPct.toFixed(1)}%` : "—"}
				</span>
			</header>
			<div className="p-4 space-y-3">
				<div className="relative h-1.5 rounded-full bg-surface-elevated overflow-hidden">
					{bytesPct !== null ? (
						<div
							className="absolute inset-y-0 left-0 bg-gradient-to-r from-info/80 to-info transition-all duration-500"
							style={{ width: `${bytesPct}%` }}
						/>
					) : (
						<div className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-info/0 via-info/60 to-info/0 animate-shimmer" />
					)}
				</div>
				<div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
					<TelemetryStat label="files" value={`${p?.filesDone ?? 0} / ${p?.filesTotal ?? "—"}`} />
					<TelemetryStat
						label="bytes"
						value={
							p?.bytesDone !== undefined && p?.bytesTotal !== undefined
								? `${formatBytes(p.bytesDone)} / ${formatBytes(p.bytesTotal)}`
								: "—"
						}
					/>
					<TelemetryStat
						label="remaining"
						value={
							p?.bytesTotal !== undefined && p?.bytesDone !== undefined
								? formatBytes(Math.max(0, p.bytesTotal - p.bytesDone))
								: "—"
						}
					/>
					<TelemetryStat label="phase" value={p?.phase ?? "queued"} highlight="text-info" />
				</div>
				{p?.currentFile && (
					<div className="flex items-start gap-2 font-mono text-[11px] text-text-secondary border-t border-info/20 pt-3">
						<ChevronRight size={11} className="text-info mt-0.5 shrink-0" />
						<span className="truncate">{p.currentFile}</span>
					</div>
				)}
				{p?.error && (
					<div className="text-xs text-error font-mono border-t border-error/30 pt-3">
						{p.error}
					</div>
				)}
			</div>
		</section>
	);
}

function TelemetryStat({
	label,
	value,
	highlight,
}: {
	label: string;
	value: string;
	highlight?: string;
}) {
	return (
		<div>
			<div className="font-display text-[10px] uppercase tracking-[0.25em] text-text-tertiary mb-0.5">
				{label}
			</div>
			<div className={`font-mono tabular-nums text-text-primary ${highlight ?? ""}`}>{value}</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Field + Env editor
// ---------------------------------------------------------------------------

function Field({
	label,
	hint,
	fullWidth,
	children,
}: {
	label: string;
	hint?: string;
	fullWidth?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className={fullWidth ? "md:col-span-2" : ""}>
			<Label className="flex items-baseline justify-between text-[11px] mb-1.5">
				<span className="font-display uppercase tracking-[0.15em] text-text-tertiary">{label}</span>
				{hint && <span className="text-text-tertiary/60 text-[10px]">{hint}</span>}
			</Label>
			{children}
		</div>
	);
}

function MetaRow({ k, v, mono = true }: { k: string; v: string; mono?: boolean }) {
	return (
		<div className="flex items-start gap-3">
			<span className="text-text-tertiary shrink-0 w-28">{k}</span>
			<span className={mono ? "font-mono text-text-primary" : "text-text-primary"}>{v}</span>
		</div>
	);
}

function EnvEditor({
	env,
	onChange,
}: {
	env: ModelEnvVarType[];
	onChange: (v: ModelEnvVarType[]) => void;
}) {
	const update = (idx: number, patch: Partial<ModelEnvVarType>) => {
		const next = env.map((e, i) => (i === idx ? { ...e, ...patch } : e));
		onChange(next);
	};
	const add = () => onChange([...env, { name: "", value: "" }]);
	const remove = (idx: number) => onChange(env.filter((_, i) => i !== idx));

	return (
		<div className="space-y-2">
			{env.length === 0 && (
				<div className="text-[11px] font-display uppercase tracking-wider text-text-tertiary italic">
					no variables
				</div>
			)}
			{env.map((e, idx) => (
				<div key={`env-${idx}`} className="flex gap-2">
					<Input
						className="flex-1 font-mono"
						placeholder="NAME"
						value={e.name}
						onChange={(event) => update(idx, { name: event.target.value })}
					/>
					<Input
						className="flex-[2] font-mono"
						placeholder="value"
						value={e.value}
						onChange={(event) => update(idx, { value: event.target.value })}
					/>
					<Button size="sm" variant="ghost" onClick={() => remove(idx)} title="Remove">
						<Trash2 size={10} />
					</Button>
				</div>
			))}
			<Button size="sm" variant="ghost" onClick={add}>
				<Check size={10} />+ Add variable
			</Button>
		</div>
	);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function formatBytes(bytes: number): string {
	if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
	const units = ["B", "KB", "MB", "GB", "TB"];
	const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
	return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
