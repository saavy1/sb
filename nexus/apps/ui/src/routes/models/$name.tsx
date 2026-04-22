import type {
	ModelConfigType,
	ModelEnvVarType,
	ModelWithLiveStatusType,
} from "@nexus/core/domains/models";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
	ArrowLeft,
	CheckCircle,
	Download,
	Loader2,
	Play,
	RefreshCw,
	Save,
	Square,
	Trash2,
	XCircle,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Input, Label, Panel, PanelRow } from "../../components/ui";
import { client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";

export const Route = createFileRoute("/models/$name")({
	component: ModelDetailPage,
});

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
	const [extraArgs, setExtraArgs] = useState("");
	const [envVars, setEnvVars] = useState<ModelEnvVarType[]>([]);

	const hydrateForm = useCallback((m: ModelWithLiveStatusType) => {
		setServedModelName(m.servedModelName ?? "");
		setTensorParallel(m.config?.tensorParallel?.toString() ?? "");
		setGpuMemoryUtilization(m.config?.gpuMemoryUtilization?.toString() ?? "");
		setMaxModelLen(m.config?.maxModelLen?.toString() ?? "");
		setDtype(m.config?.dtype ?? "");
		setToolCallParser(m.config?.toolCallParser ?? "");
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

	useEvents("model:status", (payload) => {
		if (payload.name !== name) return;
		// Small delay to let the server persist before we re-fetch.
		setTimeout(fetchModel, 200);
	});

	if (loading) {
		return <div className="container mx-auto px-4 py-8 text-text-tertiary">Loading...</div>;
	}
	if (!model) {
		return (
			<div className="container mx-auto px-4 py-8 text-text-tertiary">
				Model not found.{" "}
				<button
					type="button"
					className="text-accent underline"
					onClick={() => navigate({ to: "/models" })}
				>
					Back to Models
				</button>
			</div>
		);
	}

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
				extraArgs: parsedArgs.length ? parsedArgs : undefined,
				env: envVars.filter((e) => e.name.trim()),
			};
			const { error } = await client.api.models({ name }).patch({
				servedModelName: servedModelName || null,
				config,
			});
			if (error) toast.error(`Save failed: ${errorMessage(error.value)}`);
			else {
				toast.success("Saved");
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
			toast.success("Download started");
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

	return (
		<div className="container mx-auto space-y-4 px-4 py-4">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-3">
					<Button size="sm" variant="ghost" onClick={() => navigate({ to: "/models" })}>
						<ArrowLeft size={12} /> Back
					</Button>
					<span className="text-text-primary font-medium">{model.name}</span>
					<span className="text-text-tertiary font-mono">{model.hfRepoId}</span>
					{model.hfRevision && (
						<span className="text-text-tertiary/70 font-mono">@{model.hfRevision.slice(0, 8)}</span>
					)}
				</div>
				<div className="flex items-center gap-2">
					{canDownload && (
						<Button size="sm" variant="outline" onClick={handleDownload}>
							<Download size={12} /> Download
						</Button>
					)}
					{canStart && (
						<Button size="sm" onClick={handleStart}>
							<Play size={12} /> Start
						</Button>
					)}
					{canStop && (
						<Button size="sm" variant="outline" onClick={handleStop}>
							<Square size={12} /> Stop
						</Button>
					)}
					<Button size="sm" variant="ghost" onClick={handleSync} title="Refresh status">
						<RefreshCw size={12} />
					</Button>
					<Button size="sm" variant="ghost" onClick={handleDelete} title="Delete">
						<Trash2 size={12} />
					</Button>
				</div>
			</div>

			{/* Status panel */}
			<Panel title="Status">
				<div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
					<PanelRow label="Status" value={<StatusPill status={model.status} />} />
					<PanelRow label="Runtime" value={model.runtime} />
					<PanelRow label="Served as" value={model.servedModelName ?? "-"} mono />
					<PanelRow
						label="Last started"
						value={model.lastStartedAt ? new Date(model.lastStartedAt).toLocaleString() : "never"}
					/>
					{model.live?.url && <PanelRow label="URL" value={model.live.url} mono />}
					{model.live && <PanelRow label="Ready" value={model.live.ready ? "yes" : "no"} />}
				</div>
				{model.lastError && (
					<div className="mt-3 px-3 py-2 rounded bg-error-bg border border-error text-error text-xs">
						{model.lastError}
					</div>
				)}
				{model.live?.conditions && model.live.conditions.length > 0 && (
					<div className="mt-3 space-y-1">
						<div className="text-xs text-text-tertiary uppercase tracking-wider">Conditions</div>
						{model.live.conditions.map((c, idx) => (
							<div key={`${c.type}-${idx}`} className="flex items-center gap-2 text-xs">
								<span className="font-mono text-text-secondary w-32">{c.type}</span>
								<span className={c.status === "True" ? "text-success" : "text-warning"}>
									{c.status}
								</span>
								{c.message && <span className="text-text-tertiary truncate">{c.message}</span>}
							</div>
						))}
					</div>
				)}
			</Panel>

			{/* Config editor */}
			<Panel
				title="vLLM Config"
				actions={
					<Button size="sm" onClick={handleSave} disabled={saving}>
						{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
						Save
					</Button>
				}
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-3">
					<Field label="Served Model Name">
						<Input
							value={servedModelName}
							onChange={(e) => setServedModelName(e.target.value)}
							placeholder={model.name}
						/>
					</Field>
					<Field label="Tensor Parallel (GPU count)">
						<Input
							type="number"
							min={1}
							max={8}
							value={tensorParallel}
							onChange={(e) => setTensorParallel(e.target.value)}
							placeholder="1"
						/>
					</Field>
					<Field label="GPU Memory Utilization (0.1-1.0)">
						<Input
							type="number"
							step="0.05"
							min={0.1}
							max={1}
							value={gpuMemoryUtilization}
							onChange={(e) => setGpuMemoryUtilization(e.target.value)}
							placeholder="0.9"
						/>
					</Field>
					<Field label="Max Model Length (tokens)">
						<Input
							type="number"
							value={maxModelLen}
							onChange={(e) => setMaxModelLen(e.target.value)}
							placeholder="e.g. 32768"
						/>
					</Field>
					<Field label="Dtype">
						<Input
							value={dtype}
							onChange={(e) => setDtype(e.target.value)}
							placeholder="bfloat16, float16, auto"
						/>
					</Field>
					<Field label="Tool Call Parser">
						<Input
							value={toolCallParser}
							onChange={(e) => setToolCallParser(e.target.value)}
							placeholder="hermes, qwen3_coder..."
						/>
					</Field>
					<Field label="Extra vLLM Args (one per line)" fullWidth>
						<textarea
							className="w-full min-h-[80px] px-3 py-2 bg-background border border-border rounded text-sm font-mono focus:outline-none focus:border-accent"
							value={extraArgs}
							onChange={(e) => setExtraArgs(e.target.value)}
							placeholder="--kv-cache-dtype=fp8&#10;--enable-prefix-caching"
						/>
					</Field>
					<Field label="Environment Variables" fullWidth>
						<EnvEditor env={envVars} onChange={setEnvVars} />
					</Field>
				</div>
			</Panel>

			{/* Metadata panel (spark-arena inheritance, etc.) */}
			{model.metadata && Object.keys(model.metadata).length > 0 && (
				<Panel title="Recipe Metadata">
					<div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
						{model.metadata.description && (
							<PanelRow label="Description" value={model.metadata.description} />
						)}
						{model.metadata.maintainer && (
							<PanelRow label="Maintainer" value={model.metadata.maintainer} />
						)}
						{model.metadata.modelParams && (
							<PanelRow label="Params" value={model.metadata.modelParams} mono />
						)}
						{model.metadata.modelDtype && (
							<PanelRow label="Weight dtype" value={model.metadata.modelDtype} mono />
						)}
						{model.metadata.kvDtype && (
							<PanelRow label="KV dtype" value={model.metadata.kvDtype} mono />
						)}
					</div>
					{model.sparkArenaSource && (
						<div className="mt-2 text-xs text-text-tertiary">
							Imported from <span className="font-mono">{model.sparkArenaSource}</span>
						</div>
					)}
				</Panel>
			)}
		</div>
	);
}

function StatusPill({ status }: { status: ModelWithLiveStatusType["status"] }) {
	const map = {
		draft: { variant: "default", icon: null, label: "draft" },
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
	} as const;
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

function Field({
	label,
	fullWidth,
	children,
}: {
	label: string;
	fullWidth?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className={fullWidth ? "md:col-span-2" : ""}>
			<Label className="block text-xs text-text-tertiary mb-1">{label}</Label>
			{children}
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
			{env.map((e, idx) => (
				<div key={`env-${idx}`} className="flex gap-2">
					<Input
						className="flex-1 font-mono"
						placeholder="NAME"
						value={e.name}
						onChange={(event) => update(idx, { name: event.target.value })}
					/>
					<Input
						className="flex-1 font-mono"
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
				+ Add env var
			</Button>
		</div>
	);
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
