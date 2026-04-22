/**
 * Thin wrapper around the HuggingFace Hub public API.
 *
 * - Search endpoint: https://huggingface.co/api/models?search=<q>
 * - Model metadata:  https://huggingface.co/api/models/<repoId>
 *
 * Public read endpoints require no authentication; a `HF_TOKEN` env var can be
 * provided for rate-limit relief or gated repos.
 */

import logger from "@nexus/logger";
import { tracedFetch } from "../../infra/telemetry";
import type { HfSearchResultType } from "./types";

const HF_API = "https://huggingface.co/api";
const HF_TOKEN = process.env.HF_TOKEN;

const log = logger.child({ module: "hf-api" });

function authHeaders(): Record<string, string> {
	return HF_TOKEN ? { Authorization: `Bearer ${HF_TOKEN}` } : {};
}

export interface HfSearchOptions {
	limit?: number;
	pipeline?: string;
	sort?: "downloads" | "lastModified" | "likes" | "trendingScore";
	direction?: -1 | 1;
}

export async function searchModels(
	query: string,
	opts: HfSearchOptions = {}
): Promise<HfSearchResultType[]> {
	const { limit = 20, pipeline = "text-generation", sort = "downloads", direction = -1 } = opts;
	const params = new URLSearchParams({
		search: query,
		limit: String(limit),
		sort,
		direction: String(direction),
	});
	if (pipeline) params.set("filter", pipeline);

	const url = `${HF_API}/models?${params.toString()}`;
	const res = await tracedFetch(url, { headers: authHeaders() });
	if (!res.ok) {
		log.warn({ status: res.status, url }, "HF search failed");
		throw new Error(`HuggingFace search failed: ${res.status}`);
	}
	const raw = (await res.json()) as Array<{
		id?: string;
		modelId?: string;
		author?: string;
		downloads?: number;
		likes?: number;
		pipeline_tag?: string;
		tags?: string[];
		lastModified?: string;
	}>;
	return raw.map((m) => {
		const id = m.id ?? m.modelId ?? "";
		const author = m.author ?? (id.includes("/") ? id.split("/")[0] : undefined);
		return {
			id,
			author,
			downloads: m.downloads,
			likes: m.likes,
			pipeline_tag: m.pipeline_tag,
			tags: m.tags,
			lastModified: m.lastModified,
		};
	});
}

export interface HfModelInfo {
	id: string;
	sha?: string;
	siblings?: { rfilename: string; size?: number }[];
	tags?: string[];
	pipeline_tag?: string;
	library_name?: string;
	gated?: boolean | "auto" | "manual";
	private?: boolean;
	downloads?: number;
}

export async function getModelInfo(repoId: string, revision?: string): Promise<HfModelInfo | null> {
	const path = revision ? `${repoId}/revision/${revision}` : repoId;
	const url = `${HF_API}/models/${path}`;
	const res = await tracedFetch(url, { headers: authHeaders() });
	if (res.status === 404) return null;
	if (!res.ok) {
		log.warn({ status: res.status, url }, "HF model info failed");
		throw new Error(`HuggingFace model info failed: ${res.status}`);
	}
	return (await res.json()) as HfModelInfo;
}

/** Returns true if a repo id looks well-formed (`owner/name`). */
export function isValidRepoId(repoId: string): boolean {
	return /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/.test(repoId);
}
