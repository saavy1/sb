/**
 * Parses [Spark-Arena recipes](https://sparkrun.dev/recipes/format/) into our
 * internal `ModelConfig`. Recipes are YAML files checked into
 * github.com/spark-arena/recipe-registry (official) or
 * github.com/spark-arena/community-recipe-registry (community).
 *
 * Accepted sources:
 *   - Full https URL to a raw YAML file
 *   - `@official/<name>`   -> recipe-registry/official-recipes/<name>.yaml
 *   - `@community/<name>`  -> community-recipe-registry/recipes/<name>.yaml
 *   - `@spark-arena/<id>`  -> currently unsupported (requires Spark-Arena API key)
 */

import yaml from "js-yaml";
import logger from "@nexus/logger";
import { tracedFetch } from "../../infra/telemetry";
import type {
	ModelConfigType,
	ModelMetadataType,
	SparkArenaImportResponseType,
} from "./types";

const log = logger.child({ module: "spark-arena" });

const OFFICIAL_RAW = "https://raw.githubusercontent.com/spark-arena/recipe-registry/main/official-recipes";
const COMMUNITY_RAW =
	"https://raw.githubusercontent.com/spark-arena/community-recipe-registry/main/recipes";

interface RawRecipe {
	model?: string;
	model_revision?: string;
	runtime?: string;
	container?: string;
	command?: string;
	metadata?: {
		description?: string;
		maintainer?: string;
		model_params?: string;
		model_dtype?: string;
		kv_dtype?: string;
	};
	defaults?: Record<string, unknown>;
	env?: Record<string, string>;
}

function resolveSourceUrl(source: string): string {
	if (/^https?:\/\//.test(source)) return source;
	const officialMatch = source.match(/^@official\/(.+)$/);
	if (officialMatch) {
		const name = officialMatch[1].replace(/\.ya?ml$/, "");
		return `${OFFICIAL_RAW}/${name}.yaml`;
	}
	const communityMatch = source.match(/^@community\/(.+)$/);
	if (communityMatch) {
		const name = communityMatch[1].replace(/\.ya?ml$/, "");
		return `${COMMUNITY_RAW}/${name}.yaml`;
	}
	if (source.startsWith("@spark-arena/")) {
		throw new Error(
			"@spark-arena/<id> shortcuts aren't supported (requires Spark-Arena API). Use @official/<name>, @community/<name>, or a raw YAML URL instead."
		);
	}
	// Fall back: treat bare name as @official/<name>
	const bare = source.replace(/\.ya?ml$/, "");
	return `${OFFICIAL_RAW}/${bare}.yaml`;
}

function toNumber(v: unknown): number | undefined {
	if (v === undefined || v === null) return undefined;
	const n = typeof v === "number" ? v : Number(v);
	return Number.isFinite(n) ? n : undefined;
}

function toString(v: unknown): string | undefined {
	if (v === undefined || v === null) return undefined;
	return String(v);
}

function recipeDefaultsToConfig(recipe: RawRecipe): ModelConfigType {
	const d = recipe.defaults ?? {};
	const env = recipe.env
		? Object.entries(recipe.env).map(([name, value]) => ({ name, value: String(value) }))
		: undefined;

	const cfg: ModelConfigType = {
		tensorParallel: toNumber(d.tensor_parallel),
		gpuMemoryUtilization: toNumber(d.gpu_memory_utilization),
		maxModelLen: toNumber(d.max_model_len),
		dtype: toString(d.dtype),
		toolCallParser: toString(d.tool_call_parser),
		env,
	};

	// Strip undefined keys to keep the persisted config tidy.
	for (const key of Object.keys(cfg) as (keyof ModelConfigType)[]) {
		if (cfg[key] === undefined) delete cfg[key];
	}
	return cfg;
}

function recipeToMetadata(recipe: RawRecipe): ModelMetadataType {
	const m = recipe.metadata ?? {};
	const out: ModelMetadataType = {
		description: m.description,
		maintainer: m.maintainer,
		modelParams: m.model_params,
		modelDtype: m.model_dtype,
		kvDtype: m.kv_dtype,
	};
	for (const key of Object.keys(out) as (keyof ModelMetadataType)[]) {
		if (out[key] === undefined) delete out[key];
	}
	return out;
}

export async function importRecipe(source: string): Promise<SparkArenaImportResponseType> {
	const url = resolveSourceUrl(source);
	log.info({ url, source }, "fetching spark-arena recipe");

	const res = await tracedFetch(url);
	if (!res.ok) {
		throw new Error(`Failed to fetch recipe from ${url}: ${res.status}`);
	}
	const text = await res.text();
	let parsed: unknown;
	try {
		parsed = yaml.load(text);
	} catch (err) {
		log.warn({ err, url }, "failed to parse recipe YAML");
		throw new Error(`Recipe YAML parse error: ${(err as Error).message}`);
	}
	if (!parsed || typeof parsed !== "object") {
		throw new Error("Recipe YAML did not produce an object");
	}
	const recipe = parsed as RawRecipe;
	if (!recipe.model) {
		throw new Error("Recipe is missing required 'model' field");
	}

	if (recipe.runtime && recipe.runtime !== "vllm" && !recipe.runtime.startsWith("vllm")) {
		log.warn(
			{ runtime: recipe.runtime, url },
			"recipe runtime is not vllm - importing but config may need review"
		);
	}

	const config = recipeDefaultsToConfig(recipe);
	const metadata = recipeToMetadata(recipe);
	const servedModelName = toString((recipe.defaults ?? {}).served_model_name);

	return {
		source,
		hfRepoId: recipe.model,
		hfRevision: recipe.model_revision,
		servedModelName,
		config,
		metadata,
	};
}
