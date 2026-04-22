import type { HfSearchResultType, SparkArenaImportResponseType } from "@nexus/core/domains/models";
import { Download, Loader2, Search, Sparkles, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { client } from "../../lib/api";
import { Button, Input, Label, Panel } from "../ui";

interface Props {
	onClose: () => void;
	onCreated: () => void;
}

/**
 * Two-stage dialog:
 *  1) Search HF (or paste a repo id) and (optionally) import a Spark-Arena recipe
 *     to pre-fill config defaults.
 *  2) Confirm slug / tweak config / submit. Download auto-kicks off.
 */
export function NewModelDialog({ onClose, onCreated }: Props) {
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<HfSearchResultType[]>([]);
	const [searching, setSearching] = useState(false);
	const [selected, setSelected] = useState<{ repoId: string; revision?: string } | null>(null);
	const [slug, setSlug] = useState("");
	const [servedModelName, setServedModelName] = useState("");
	const [sparkSource, setSparkSource] = useState("");
	const [importedRecipe, setImportedRecipe] = useState<SparkArenaImportResponseType | null>(null);
	const [importing, setImporting] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// Debounced search
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

	const handleSelect = (repoId: string) => {
		setSelected({ repoId });
		// Default slug: repo id's trailing name, lowercased and dash-safe.
		const suggested = repoId
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
				setSelected({ repoId: data.hfRepoId, revision: data.hfRevision });
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
				hfRepoId: selected.repoId,
				hfRevision: selected.revision,
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
			toast.success(`Created ${slug} — download started`);
			onCreated();
		} finally {
			setSubmitting(false);
		}
	};

	return (
		<Panel
			title="New Model"
			actions={
				<Button size="sm" variant="ghost" onClick={onClose}>
					<X size={12} />
				</Button>
			}
		>
			{/* Step 1: pick a HuggingFace model */}
			<div className="space-y-3">
				<div>
					<Label className="block text-xs text-text-tertiary mb-1">HuggingFace</Label>
					<div className="relative">
						<Search
							size={14}
							className="absolute left-2 top-1/2 -translate-y-1/2 text-text-tertiary"
						/>
						<Input
							className="pl-8 font-mono"
							placeholder="Search HF or paste repo id (e.g. Qwen/Qwen3-1.7B)"
							value={query}
							onChange={(e) => setQuery(e.target.value)}
						/>
						{searching && (
							<Loader2
								size={14}
								className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-tertiary"
							/>
						)}
					</div>
					{(() => {
						const trimmed = query.trim();
						const isRepoIdShape = /^[^/\s]+\/[^/\s]+$/.test(trimmed);
						const exactMatch = results.some((r) => r.id === trimmed);
						const showManualRow = isRepoIdShape && !exactMatch && !searching;
						if (results.length === 0 && !showManualRow) {
							if (query && !searching) {
								return (
									<div className="mt-2 text-xs text-text-tertiary">
										No results. Type a full repo id (e.g.{" "}
										<span className="font-mono">Qwen/Qwen3-VL-235B-A22B-Instruct</span>) to use it
										directly.
									</div>
								);
							}
							return null;
						}
						return (
							<div className="mt-2 max-h-60 overflow-auto border border-border rounded bg-background divide-y divide-border">
								{showManualRow && (
									<button
										key="__manual__"
										type="button"
										onClick={() => handleSelect(trimmed)}
										className={`w-full text-left px-3 py-2 hover:bg-surface-elevated transition-colors ${
											selected?.repoId === trimmed ? "bg-surface-elevated" : ""
										}`}
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm">{trimmed}</span>
											<span className="text-xs text-text-tertiary">use as repo id</span>
										</div>
										<div className="text-xs text-text-tertiary mt-0.5">
											Not in search results — will still be validated on download.
										</div>
									</button>
								)}
								{results.map((r) => (
									<button
										key={r.id}
										type="button"
										onClick={() => handleSelect(r.id)}
										className={`w-full text-left px-3 py-2 hover:bg-surface-elevated transition-colors ${
											selected?.repoId === r.id ? "bg-surface-elevated" : ""
										}`}
									>
										<div className="flex items-center justify-between">
											<span className="font-mono text-sm">{r.id}</span>
											<span className="text-xs text-text-tertiary">
												{r.downloads?.toLocaleString() ?? "-"} downloads
											</span>
										</div>
										{r.pipeline_tag && (
											<div className="text-xs text-text-tertiary mt-0.5">{r.pipeline_tag}</div>
										)}
									</button>
								))}
							</div>
						);
					})()}
				</div>

				{/* Optional: import Spark-Arena recipe */}
				<div>
					<Label className="block text-xs text-text-tertiary mb-1">
						<span className="flex items-center gap-1">
							<Sparkles size={10} /> Import Spark-Arena recipe (optional)
						</span>
					</Label>
					<div className="flex gap-2">
						<Input
							className="flex-1 font-mono"
							placeholder="@official/<name>, @community/<name>, or a raw YAML URL"
							value={sparkSource}
							onChange={(e) => setSparkSource(e.target.value)}
						/>
						<Button
							size="sm"
							variant="outline"
							onClick={handleImportSparkArena}
							disabled={importing}
						>
							{importing ? <Loader2 size={12} className="animate-spin" /> : "Import"}
						</Button>
					</div>
					{importedRecipe && (
						<div className="mt-2 text-xs text-text-tertiary">
							Imported: <span className="font-mono">{importedRecipe.hfRepoId}</span>
							{importedRecipe.metadata.modelParams && <> · {importedRecipe.metadata.modelParams}</>}
							{importedRecipe.metadata.modelDtype && <> · {importedRecipe.metadata.modelDtype}</>}
						</div>
					)}
				</div>

				{/* Step 2: slug / served name (required once model is picked) */}
				{selected && (
					<div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2 border-t border-border">
						<div className="md:col-span-2">
							<div className="text-xs text-text-tertiary">
								Selected: <span className="font-mono">{selected.repoId}</span>
								{selected.revision && (
									<span className="text-text-tertiary/70"> @{selected.revision}</span>
								)}
							</div>
						</div>
						<div>
							<Label className="block text-xs text-text-tertiary mb-1">
								Slug * (k8s-safe; used for InferenceService name &amp; NAS dir)
							</Label>
							<Input
								value={slug}
								onChange={(e) => setSlug(e.target.value.toLowerCase())}
								placeholder="qwen3-1-7b"
								pattern="^[a-z0-9]([-a-z0-9]*[a-z0-9])?$"
								className="font-mono"
							/>
						</div>
						<div>
							<Label className="block text-xs text-text-tertiary mb-1">
								Served model name (OpenAI API)
							</Label>
							<Input
								value={servedModelName}
								onChange={(e) => setServedModelName(e.target.value)}
								placeholder={slug}
								className="font-mono"
							/>
						</div>
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
					<Button variant="ghost" onClick={onClose} disabled={submitting}>
						Cancel
					</Button>
					<Button onClick={handleSubmit} disabled={!selected || !slug || submitting}>
						{submitting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
						{submitting ? "Creating..." : "Create &amp; Download"}
					</Button>
				</div>
			</div>
		</Panel>
	);
}

function errorMessage(value: unknown): string {
	if (value && typeof value === "object" && "error" in value) {
		return String((value as { error: unknown }).error);
	}
	return "Unknown error";
}
