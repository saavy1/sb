import type { HfSearchResultType, SparkArenaImportResponseType } from "@nexus/core/domains/models";
import { Cpu, Download, Loader2, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { client } from "../../lib/api";
import { Button, Input, Label } from "../ui";

interface Props {
	onClose: () => void;
	onCreated: () => void;
}

/**
 * Two-pane modal:
 *  LEFT  — Huggingface search / repo-id paste + Spark-Arena import
 *  RIGHT — Live preview card showing how the unit will appear in the fleet,
 *          plus slug/served-name form + submit CTA.
 *
 * ESC closes. Clicking the backdrop closes.
 */
export function NewModelDialog({ onClose, onCreated }: Props) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<HfSearchResultType[]>([]);
	const [searching, setSearching] = useState(false);
	const [selected, setSelected] = useState<HfSearchResultType | null>(null);
	const [revision, setRevision] = useState<string | undefined>();
	const [slug, setSlug] = useState("");
	const [servedModelName, setServedModelName] = useState("");
	const [sparkSource, setSparkSource] = useState("");
	const [importedRecipe, setImportedRecipe] = useState<SparkArenaImportResponseType | null>(null);
	const [importing, setImporting] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// Debounced search ------------------------------------------------------
	const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const runSearch = useCallback(async (q: string) => {
		if (q.trim().length < 2) {
			setResults([]);
			return;
		}
		setSearching(true);
		try {
			const { data, error } = await client.api.models.huggingface.search.get({
				query: { q, limit: 20 },
			});
			if (error) {
				toast.error("HuggingFace search failed");
				return;
			}
			if (Array.isArray(data)) setResults(data);
		} finally {
			setSearching(false);
		}
	}, []);
	useEffect(() => {
		if (timer.current) clearTimeout(timer.current);
		timer.current = setTimeout(() => runSearch(query), 300);
		return () => {
			if (timer.current) clearTimeout(timer.current);
		};
	}, [query, runSearch]);

	// ESC closes
	useEffect(() => {
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [onClose]);

	// ---- actions ----------------------------------------------------------

	const selectResult = (result: HfSearchResultType) => {
		setSelected(result);
		setRevision(undefined);
		// Default slug: trailing repo segment lowered + dash-safe
		const suggested = result.id
			.split("/")
			.pop()!
			.toLowerCase()
			.replace(/[^a-z0-9-]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/(^-|-$)/g, "")
			.slice(0, 63);
		setSlug(suggested);
		setServedModelName(suggested);
	};

	const handleImportSparkArena = async () => {
		if (!sparkSource.trim()) return;
		setImporting(true);
		try {
			const { data, error } = await client.api.models.import["spark-arena"].post({
				source: sparkSource.trim(),
			});
			if (error) {
				toast.error(`Import failed: ${errorMessage(error.value)}`);
				return;
			}
			if (data && !("error" in data)) {
				setImportedRecipe(data);
				setSelected({
					id: data.hfRepoId,
					downloads: 0,
					pipeline_tag: undefined,
				} as HfSearchResultType);
				setRevision(data.hfRevision);
				if (data.servedModelName) setServedModelName(data.servedModelName);
				toast.success("Recipe imported");
			}
		} finally {
			setImporting(false);
		}
	};

	const handleSubmit = async () => {
		if (!selected || !slug) return;
		setSubmitting(true);
		try {
			const { error } = await client.api.models.post({
				name: slug,
				hfRepoId: selected.id,
				hfRevision: revision,
				runtime: "vllm",
				servedModelName: servedModelName || slug,
				config: importedRecipe?.config ?? {},
				metadata: importedRecipe?.metadata ?? {},
				sparkArenaSource: importedRecipe ? sparkSource : undefined,
				autoDownload: true,
				createdBy: "dashboard",
			});
			if (error) {
				toast.error(`Create failed: ${errorMessage(error.value)}`);
				return;
			}
			toast.success(`Deploying ${slug} — pull queued`);
			onCreated();
		} finally {
			setSubmitting(false);
		}
	};

	const trimmed = query.trim();
	const isRepoIdShape = /^[^/\s]+\/[^/\s]+$/.test(trimmed);
	const exactMatch = results.some((r) => r.id === trimmed);
	const showManualRow = isRepoIdShape && !exactMatch && !searching;
	const maxDownloads = results.length ? Math.max(1, ...results.map((r) => r.downloads ?? 0)) : 1;

	// ---- render -----------------------------------------------------------

	return (
		<div
			role="dialog"
			aria-modal="true"
			aria-label="New model dialog"
			className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 animate-panel"
		>
			{/* Dedicated button for a11y-friendly backdrop-close */}
			<button
				type="button"
				aria-label="Close dialog"
				onClick={onClose}
				className="absolute inset-0 bg-background/80 backdrop-blur-sm"
			/>
			<div className="relative z-10 w-full max-w-6xl max-h-[90vh] flex flex-col overflow-hidden rounded-lg border border-border bg-surface surface-glow">
				{/* Header */}
				<header className="flex items-center justify-between px-5 py-3 border-b border-border bg-surface-elevated/40">
					<div className="flex items-center gap-3">
						<div className="flex items-center gap-2 text-[10px] font-display uppercase tracking-[0.3em] text-text-tertiary">
							<Sparkles size={10} />
							new deployment
						</div>
						<span className="text-text-tertiary">·</span>
						<h2 className="font-display text-lg font-semibold text-text-primary tracking-tight">
							Pull Model from HuggingFace
						</h2>
					</div>
					<button
						type="button"
						onClick={onClose}
						className="p-1.5 rounded hover:bg-surface-elevated text-text-tertiary hover:text-text-primary transition-colors"
					>
						<X size={16} />
					</button>
				</header>

				{/* Body — two pane */}
				<div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_380px] overflow-hidden">
					{/* -------- LEFT PANE — search + import -------- */}
					<div className="flex flex-col overflow-hidden border-b md:border-b-0 md:border-r border-border">
						<div className="px-5 py-4 border-b border-border bg-surface-elevated/20 space-y-3">
							<Label className="font-display text-[10px] uppercase tracking-[0.25em] text-text-tertiary">
								Search HuggingFace
							</Label>
							<div className="relative">
								<Search
									size={14}
									className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
								/>
								<Input
									autoFocus
									className="pl-9 font-mono"
									placeholder="Qwen/Qwen3-VL-30B-A3B  or  qwen3 vl"
									value={query}
									onChange={(e) => setQuery(e.target.value)}
								/>
								{searching && (
									<Loader2
										size={14}
										className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary"
									/>
								)}
							</div>

							{/* Spark-Arena recipe import */}
							<div className="flex gap-2">
								<div className="relative flex-1">
									<Sparkles
										size={12}
										className="absolute left-3 top-1/2 -translate-y-1/2 text-text-tertiary"
									/>
									<Input
										className="pl-9 font-mono text-xs"
										placeholder="@official/<name> · spark-arena recipe (optional)"
										value={sparkSource}
										onChange={(e) => setSparkSource(e.target.value)}
									/>
								</div>
								<Button
									size="sm"
									variant="outline"
									onClick={handleImportSparkArena}
									disabled={importing || !sparkSource.trim()}
								>
									{importing ? <Loader2 size={12} className="animate-spin" /> : "Import"}
								</Button>
							</div>
							{importedRecipe && (
								<div className="text-[11px] text-info font-mono flex items-center gap-2">
									<Sparkles size={10} />
									{importedRecipe.hfRepoId}
									{importedRecipe.metadata.modelParams && (
										<span className="text-text-tertiary">
											· {importedRecipe.metadata.modelParams}
										</span>
									)}
									{importedRecipe.metadata.modelDtype && (
										<span className="text-text-tertiary">
											· {importedRecipe.metadata.modelDtype}
										</span>
									)}
								</div>
							)}
						</div>

						{/* Results scroll area */}
						<div className="flex-1 overflow-auto">
							{results.length === 0 && !showManualRow ? (
								<div className="h-full flex items-center justify-center text-center px-6 py-12 text-text-tertiary">
									<div>
										<Search size={24} className="mx-auto mb-3 opacity-30" />
										<div className="font-display text-xs uppercase tracking-[0.2em]">
											{query.trim() ? "no matches" : "begin typing to search"}
										</div>
										{query.trim() && (
											<div className="mt-1.5 text-[11px]">
												Type a full repo id (e.g.{" "}
												<span className="font-mono">Qwen/Qwen3-VL-235B-A22B-Instruct</span>) to use
												it directly.
											</div>
										)}
									</div>
								</div>
							) : (
								<div className="divide-y divide-border">
									{showManualRow && (
										<ResultRow
											id={trimmed}
											subtitle="manual repo id · will validate on pull"
											selected={selected?.id === trimmed}
											onSelect={() =>
												selectResult({
													id: trimmed,
													downloads: 0,
												} as HfSearchResultType)
											}
										/>
									)}
									{results.map((r) => (
										<ResultRow
											key={r.id}
											id={r.id}
											subtitle={r.pipeline_tag ?? "–"}
											downloads={r.downloads}
											downloadsMax={maxDownloads}
											selected={selected?.id === r.id}
											onSelect={() => selectResult(r)}
										/>
									))}
								</div>
							)}
						</div>
					</div>

					{/* -------- RIGHT PANE — preview + form -------- */}
					<div className="flex flex-col overflow-auto bg-surface/60">
						<div className="p-5 space-y-5">
							<div>
								<Label className="font-display text-[10px] uppercase tracking-[0.25em] text-text-tertiary">
									Preview
								</Label>
								<div className="mt-2">
									<PreviewTile slug={slug} repoId={selected?.id} revision={revision} />
								</div>
							</div>

							<div>
								<Label className="font-display text-[10px] uppercase tracking-[0.25em] text-text-tertiary flex items-baseline justify-between">
									<span>slug *</span>
									<span className="text-text-tertiary/60 text-[10px] normal-case tracking-normal">
										k8s name · dir · job id
									</span>
								</Label>
								<Input
									value={slug}
									onChange={(e) => setSlug(e.target.value.toLowerCase())}
									placeholder="qwen3-6-27b"
									pattern="^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"
									className="mt-1.5 font-mono"
									disabled={!selected}
								/>
							</div>

							<div>
								<Label className="font-display text-[10px] uppercase tracking-[0.25em] text-text-tertiary flex items-baseline justify-between">
									<span>served name</span>
									<span className="text-text-tertiary/60 text-[10px] normal-case tracking-normal">
										openai api
									</span>
								</Label>
								<Input
									value={servedModelName}
									onChange={(e) => setServedModelName(e.target.value)}
									placeholder={slug || "qwen3-6-27b"}
									className="mt-1.5 font-mono"
									disabled={!selected}
								/>
							</div>
						</div>
					</div>
				</div>

				{/* Footer */}
				<footer className="flex items-center justify-between px-5 py-3 border-t border-border bg-surface-elevated/30">
					<div className="text-[11px] font-display uppercase tracking-[0.2em] text-text-tertiary">
						{selected ? (
							<>
								<span className="text-text-secondary font-mono normal-case tracking-normal">
									{selected.id}
								</span>
								{" → "}
								<span className="text-accent font-mono normal-case tracking-normal">
									{slug || "—"}
								</span>
							</>
						) : (
							"pick a model to continue"
						)}
					</div>
					<div className="flex items-center gap-2">
						<Button variant="ghost" onClick={onClose} disabled={submitting}>
							Cancel
						</Button>
						<Button onClick={handleSubmit} disabled={!selected || !slug || submitting}>
							{submitting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
							{submitting ? "Deploying..." : "Deploy & Pull"}
						</Button>
					</div>
				</footer>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// Result row — dense, with download sparkbar
// ---------------------------------------------------------------------------

function ResultRow({
	id,
	subtitle,
	downloads,
	downloadsMax,
	selected,
	onSelect,
}: {
	id: string;
	subtitle: string;
	downloads?: number;
	downloadsMax?: number;
	selected: boolean;
	onSelect: () => void;
}) {
	const pct =
		downloads !== undefined && downloadsMax && downloadsMax > 0
			? Math.min(100, (downloads / downloadsMax) * 100)
			: 0;
	return (
		<button
			type="button"
			onClick={onSelect}
			className={`w-full px-5 py-3 text-left transition-colors ${
				selected
					? "bg-accent/5 border-l-2 border-l-accent"
					: "border-l-2 border-l-transparent hover:bg-surface-elevated/60"
			}`}
		>
			<div className="flex items-center justify-between gap-4">
				<div className="min-w-0 flex-1">
					<div
						className={`font-mono text-sm truncate ${
							selected ? "text-accent" : "text-text-primary"
						}`}
					>
						{id}
					</div>
					<div className="mt-0.5 text-[11px] font-display uppercase tracking-wider text-text-tertiary truncate">
						{subtitle}
					</div>
				</div>
				{downloads !== undefined && (
					<div className="flex items-center gap-2 shrink-0">
						<div className="w-16 h-1 rounded-full bg-surface-elevated overflow-hidden">
							<div className="h-full bg-accent/60" style={{ width: `${pct}%` }} />
						</div>
						<span className="text-[10px] font-mono tabular-nums text-text-tertiary min-w-[3rem] text-right">
							{formatDownloads(downloads)}
						</span>
					</div>
				)}
			</div>
		</button>
	);
}

// ---------------------------------------------------------------------------
// Preview tile — mirrors the fleet card look
// ---------------------------------------------------------------------------

function PreviewTile({
	slug,
	repoId,
	revision,
}: {
	slug: string;
	repoId: string | undefined;
	revision: string | undefined;
}) {
	const mono = slug ? monogram(slug) : "--";
	return (
		<div className="relative overflow-hidden rounded border border-border bg-surface">
			<div className="absolute left-0 top-0 bottom-0 w-[3px] bg-text-tertiary/30" />
			<div className="pointer-events-none absolute right-2 top-1 font-display text-6xl font-semibold leading-none tracking-tighter text-text-tertiary/10 select-none">
				{mono}
			</div>
			<div className="relative pl-5 pr-4 py-4">
				<div className="font-display text-base font-semibold text-text-primary truncate pr-10">
					{slug || "—"}
				</div>
				<div className="mt-0.5 font-mono text-[11px] text-text-tertiary truncate pr-10">
					{repoId ?? "(select a model)"}
					{revision && <span className="text-text-tertiary/70"> @{revision}</span>}
				</div>
				<div className="mt-3 flex items-center gap-2">
					<Cpu size={11} className="text-text-tertiary" />
					<span className="font-display text-[10px] uppercase tracking-[0.2em] text-text-tertiary">
						DRAFT · vLLM
					</span>
				</div>
			</div>
		</div>
	);
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function monogram(slug: string): string {
	const parts = slug.replace(/_/g, "-").split("-").filter(Boolean);
	if (parts.length === 0) return slug.slice(0, 2).toUpperCase();
	if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
	return (parts[0][0] + parts[1][0] + (parts[2]?.[0] ?? "")).toUpperCase();
}

function formatDownloads(n: number): string {
	if (!Number.isFinite(n) || n <= 0) return "–";
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
