import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { toolDefinition } from "@tanstack/ai";

const log = logger.child({ module: "loki" });

// === Time parsing ===

/**
 * Parse a relative or absolute time string to a Unix nanosecond timestamp.
 * Supports:
 *   - Relative: "1h ago", "30m ago", "7d ago", "2w ago"
 *   - ISO 8601: "2024-02-28T16:00:00Z"
 *   - "now"
 */
function parseTime(input: string): string {
	const trimmed = input.trim().toLowerCase();

	if (trimmed === "now") {
		return String(Date.now() * 1_000_000);
	}

	// Relative time: "1h ago", "30m ago", "7d ago", "2w ago"
	const relativeMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(s|m|h|d|w)\s+ago$/);
	if (relativeMatch) {
		const amount = parseFloat(relativeMatch[1]);
		const unit = relativeMatch[2];
		const multipliers: Record<string, number> = {
			s: 1_000,
			m: 60_000,
			h: 3_600_000,
			d: 86_400_000,
			w: 604_800_000,
		};
		const ms = amount * multipliers[unit];
		return String((Date.now() - ms) * 1_000_000);
	}

	// ISO 8601 timestamp
	const parsed = Date.parse(input);
	if (!Number.isNaN(parsed)) {
		return String(parsed * 1_000_000);
	}

	throw new Error(
		`Invalid time format: "${input}". Use "now", relative ("1h ago", "30m ago", "7d ago"), or ISO 8601 timestamp.`
	);
}

// === LogQL query builder ===

/**
 * Build a LogQL query from structured parameters.
 * If `query` looks like a full LogQL expression (starts with '{'), use it as-is.
 * Otherwise, build a stream selector + filter expression.
 */
function buildLogQLQuery(params: {
	query: string;
	service?: string;
	namespace?: string;
	level?: string;
}): string {
	const { query, service, namespace, level } = params;

	// If it already looks like LogQL with a stream selector, use it directly
	if (query.trim().startsWith("{")) {
		return query;
	}

	// Build stream selector labels
	const labels: string[] = [];
	if (namespace) labels.push(`namespace="${namespace}"`);
	if (service) labels.push(`app="${service}"`);

	const streamSelector = labels.length > 0 ? `{${labels.join(",")}}` : `{job=~".+"}`;

	// Add level filter if specified
	const filters: string[] = [];
	if (level) {
		// Try JSON level field first, fall back to text match
		filters.push(`| json | level=~"(?i)${level}"`);
	}

	// Add text search filter
	if (query.trim()) {
		filters.push(`|= ${JSON.stringify(query)}`);
	}

	return `${streamSelector} ${filters.join(" ")}`.trim();
}

// === Loki API types ===

interface LokiStream {
	stream: Record<string, string>;
	values: [string, string][]; // [nanosecond_timestamp, log_line]
}

interface LokiQueryRangeResponse {
	status: string;
	data: {
		resultType: "streams";
		result: LokiStream[];
	};
}

interface LogResult {
	timestamp: string;
	message: string;
	labels: Record<string, string>;
}

// === Loki API client ===

async function queryLoki(params: {
	query: string;
	start: string;
	end: string;
	limit: number;
	direction?: "forward" | "backward";
}): Promise<LokiQueryRangeResponse> {
	const url = new URL(`${config.LOKI_URL}/loki/api/v1/query_range`);
	url.searchParams.set("query", params.query);
	url.searchParams.set("start", params.start);
	url.searchParams.set("end", params.end);
	url.searchParams.set("limit", String(params.limit));
	url.searchParams.set("direction", params.direction ?? "backward");

	log.debug({ query: params.query, start: params.start, end: params.end }, "Querying Loki");

	const response = await fetch(url.toString(), {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		const errorText = await response.text();
		log.error({ status: response.status, error: errorText }, "Loki API error");
		throw new Error(`Loki API error ${response.status}: ${errorText}`);
	}

	return (await response.json()) as LokiQueryRangeResponse;
}

// === Tool definition ===

export const searchLokiLogsTool = toolDefinition({
	name: "search_loki_logs",
	description: `Search historical logs in Loki for pattern detection, incident analysis, and root cause investigation.

Use cases:
- Find recurring errors: search for "API key incorrect" across the past week
- Investigate alerts: search logs before an alert fired to find root cause
- Answer "when did this first appear?" or "how many times has this happened?"
- Match log patterns with deployment times to identify breaking changes

The query parameter accepts either:
1. Simple text search: "API key incorrect" (filters by plain text match)
2. Full LogQL: '{namespace="media"} |= "error" | json | status >= 500'

Time formats:
- Relative: "1h ago", "30m ago", "7d ago", "2w ago"
- ISO 8601: "2024-02-28T16:00:00Z"
- "now" (for end time)`,
	inputSchema: z.object({
		query: z.string().describe(
			'Text to search for (e.g. "API key incorrect") or a full LogQL expression (e.g. \'{ namespace="media" } |= "error"\')'
		),
		service: z
			.string()
			.optional()
			.describe('Filter by Kubernetes app label (e.g. "nexus-api", "sabnzbd")'),
		namespace: z
			.string()
			.optional()
			.describe('Filter by Kubernetes namespace (e.g. "monitoring", "media")'),
		level: z
			.enum(["ERROR", "WARN", "INFO", "DEBUG"])
			.optional()
			.describe("Filter by log level"),
		start: z
			.string()
			.optional()
			.default("1h ago")
			.describe('Start of time range. Examples: "1h ago", "7d ago", "2024-02-28T16:00:00Z"'),
		end: z
			.string()
			.optional()
			.default("now")
			.describe('End of time range. Examples: "now", "2024-02-28T17:00:00Z"'),
		limit: z
			.number()
			.int()
			.min(1)
			.max(1000)
			.optional()
			.default(100)
			.describe("Maximum number of log lines to return (default 100, max 1000)"),
		context: z
			.number()
			.int()
			.min(0)
			.max(20)
			.optional()
			.default(0)
			.describe("Lines of context to show before/after each match (default 0, max 20)"),
	}),
}).server(async ({ query, service, namespace, level, start, end, limit, context }) => {
	const startNs = parseTime(start ?? "1h ago");
	const endNs = parseTime(end ?? "now");
	const maxResults = limit ?? 100;

	const logqlQuery = buildLogQLQuery({ query, service, namespace, level });

	log.info({ logqlQuery, start, end, limit }, "Searching Loki logs");

	let lokiResponse: LokiQueryRangeResponse;
	try {
		// Fetch slightly more than requested if context lines are needed
		const fetchLimit = context && context > 0 ? Math.min(maxResults * 3, 1000) : maxResults;
		lokiResponse = await queryLoki({
			query: logqlQuery,
			start: startNs,
			end: endNs,
			limit: fetchLimit,
			direction: "backward",
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		log.error({ err, logqlQuery }, "Loki query failed");
		return {
			success: false,
			error: message,
			query: logqlQuery,
			results: [],
			resultCount: 0,
			limitReached: false,
		};
	}

	if (lokiResponse.status !== "success") {
		return {
			success: false,
			error: `Loki returned status: ${lokiResponse.status}`,
			query: logqlQuery,
			results: [],
			resultCount: 0,
			limitReached: false,
		};
	}

	// Flatten streams into a single sorted list of log entries
	const allEntries: { ts: bigint; message: string; labels: Record<string, string> }[] = [];
	for (const stream of lokiResponse.data.result) {
		for (const [tsNs, message] of stream.values) {
			allEntries.push({ ts: BigInt(tsNs), message, labels: stream.stream });
		}
	}

	// Sort descending (newest first) since direction=backward
	allEntries.sort((a, b) => (a.ts > b.ts ? -1 : a.ts < b.ts ? 1 : 0));

	// Apply context lines if requested
	let results: LogResult[];
	if (context && context > 0 && allEntries.length > 0) {
		// With context, find matching entries and include surrounding lines
		const contextSet = new Set<number>();
		for (let i = 0; i < allEntries.length; i++) {
			const { message } = allEntries[i];
			// Simple text match for context highlighting
			const searchTerm = query.trim().startsWith("{") ? null : query.toLowerCase();
			if (!searchTerm || message.toLowerCase().includes(searchTerm)) {
				for (let j = Math.max(0, i - context); j <= Math.min(allEntries.length - 1, i + context); j++) {
					contextSet.add(j);
				}
			}
		}

		results = [...contextSet]
			.sort((a, b) => a - b)
			.slice(0, maxResults)
			.map((i) => ({
				timestamp: new Date(Number(allEntries[i].ts / 1_000_000n)).toISOString(),
				message: allEntries[i].message,
				labels: allEntries[i].labels,
			}));
	} else {
		results = allEntries.slice(0, maxResults).map((entry) => ({
			timestamp: new Date(Number(entry.ts / 1_000_000n)).toISOString(),
			message: entry.message,
			labels: entry.labels,
		}));
	}

	const limitReached = allEntries.length >= maxResults;

	log.info(
		{ resultCount: results.length, streams: lokiResponse.data.result.length },
		"Loki query complete"
	);

	return {
		success: true,
		results,
		query: logqlQuery,
		resultCount: results.length,
		limitReached,
	};
});

export const lokiTools = [searchLokiLogsTool];
