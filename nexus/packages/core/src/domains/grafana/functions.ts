import logger from "@nexus/logger";
import { z } from "zod";
import { config } from "../../infra/config";
import { toolDefinition } from "@tanstack/ai";
import type {
	AlertRuleResponse,
	GrafanaDatasource,
	GrafanaFolder,
	GrafanaRequestOptions,
	PrometheusRulesResponse,
} from "./types";

const log = logger.child({ module: "grafana" });

// === Time parsing ===

/**
 * Parse a time range string (e.g. "5m", "1h") to seconds.
 */
function parseTimeRangeToSeconds(timeRange: string): number {
	const match = timeRange.match(/^(\d+)(s|m|h|d)$/);
	if (!match)
		throw new Error(
			`Invalid time range: "${timeRange}". Use format like "30s", "5m", "1h", "1d"`,
		);

	const amount = Number.parseInt(match[1], 10);
	const unit = match[2];
	const multipliers: Record<string, number> = {
		s: 1,
		m: 60,
		h: 3600,
		d: 86400,
	};
	return amount * multipliers[unit];
}

// === Grafana API client ===

async function grafanaFetch<T>(
	path: string,
	options: GrafanaRequestOptions = {},
): Promise<T> {
	const url = `${config.GRAFANA_URL}${path}`;

	if (!config.GRAFANA_API_KEY) {
		throw new Error("GRAFANA_API_KEY not configured");
	}

	const response = await fetch(url, {
		method: options.method || "GET",
		headers: {
			Authorization: `Bearer ${config.GRAFANA_API_KEY}`,
			"Content-Type": "application/json",
			"X-Disable-Provenance": "true", // Allow modifications to provisioned rules
		},
		body: options.body ? JSON.stringify(options.body) : undefined,
		signal: AbortSignal.timeout(30_000),
	});

	if (!response.ok) {
		const errorText = await response.text();
		log.error(
			{ url, status: response.status, error: errorText },
			"Grafana API error",
		);
		throw new Error(`Grafana API error ${response.status}: ${errorText}`);
	}

	// Handle 204 No Content (e.g., DELETE)
	if (response.status === 204) {
		return {} as T;
	}

	return (await response.json()) as T;
}

// === Folder management ===

/**
 * Ensure a Grafana folder exists, creating it if necessary.
 * Returns the folder UID.
 */
async function ensureFolder(folderTitle: string): Promise<string> {
	const folders = await grafanaFetch<GrafanaFolder[]>("/api/folders");
	const existing = folders.find((f) => f.title === folderTitle);
	if (existing) return existing.uid;

	const created = await grafanaFetch<GrafanaFolder>("/api/folders", {
		method: "POST",
		body: { title: folderTitle },
	});

	log.info(
		{ folderUid: created.uid, title: folderTitle },
		"Created Grafana folder",
	);
	return created.uid;
}

// === Datasource resolution ===

/**
 * Resolve a datasource name (e.g. "Prometheus", "Loki") to its UID.
 */
async function resolveDatasourceUid(name: string): Promise<string> {
	const datasources =
		await grafanaFetch<GrafanaDatasource[]>("/api/datasources");
	const ds = datasources.find(
		(d) =>
			d.name.toLowerCase() === name.toLowerCase() ||
			d.type.toLowerCase().includes(name.toLowerCase()),
	);
	if (!ds) {
		throw new Error(
			`Datasource "${name}" not found. Available: ${datasources.map((d) => d.name).join(", ")}`,
		);
	}
	return ds.uid;
}

// === Tool definitions ===

export const createGrafanaAlertTool = toolDefinition({
	name: "create_grafana_alert",
	description: `Create a new Grafana alert rule for self-managed monitoring.

IMPORTANT: Before creating, use list_grafana_alerts to check for existing similar alerts and avoid duplicates.

Use this to set up alerts for patterns you've detected during investigations:
- After finding repeated API auth failures → alert for future occurrences
- After diagnosing a crash loop → alert for early detection
- Proactive monitoring for known failure patterns

The alert will be configured to fire through the existing webhook contact point.

Parameters:
- name: Human-readable alert name (e.g. "SABnzbd API Auth Failures")
- datasource: "Prometheus" or "Loki"
- query: PromQL or LogQL expression
- condition: threshold, operator ("gt"|"lt"|"eq"|"ne"), and timeRange ("5m", "1h")
- folder: Alert folder (default: "nexus-auto")
- annotations: summary, description, runbook_url
- labels: key-value pairs (auto_created: "true" added automatically)
- forDuration: How long condition must be true before firing (default: "1m")

Example:
create_grafana_alert({
  name: "SABnzbd API Authentication Failures",
  datasource: "Loki",
  query: 'count_over_time({namespace="sabnzbd"} |= "API key incorrect"[5m])',
  condition: { threshold: 2, operator: "gt", timeRange: "5m" },
  labels: { severity: "warning", component: "media" },
  forDuration: "2m"
})`,
	inputSchema: z.object({
		name: z.string().describe("Alert name, e.g. 'SABnzbd API Auth Failures'"),
		datasource: z
			.enum(["Prometheus", "Loki"])
			.describe("Data source for the query"),
		query: z.string().describe("PromQL or LogQL expression"),
		condition: z.object({
			threshold: z.number().describe("Alert threshold value"),
			operator: z
				.enum(["gt", "lt", "eq", "ne"])
				.describe("Comparison operator"),
			timeRange: z.string().describe('Evaluation window, e.g. "5m", "1h"'),
		}),
		folder: z
			.string()
			.optional()
			.describe('Alert folder (default: "nexus-auto")'),
		annotations: z
			.object({
				summary: z
					.string()
					.optional()
					.describe("Short description shown in alert"),
				description: z
					.string()
					.optional()
					.describe("Detailed context and troubleshooting"),
				runbook_url: z
					.string()
					.optional()
					.describe("Link to runbook/wiki"),
			})
			.optional(),
		labels: z
			.record(z.string(), z.string())
			.optional()
			.describe('Additional labels, e.g. { severity: "warning" }'),
		forDuration: z
			.string()
			.optional()
			.describe(
				'How long condition must be true before firing (default: "1m")',
			),
	}),
}).server(
	async ({
		name,
		datasource,
		query,
		condition,
		folder,
		annotations,
		labels,
		forDuration,
	}) => {
		try {
			const folderName = folder ?? "nexus-auto";
			const forDur = forDuration ?? "1m";

			// Ensure folder exists
			const folderUid = await ensureFolder(folderName);

			// Resolve datasource UID
			const datasourceUid = await resolveDatasourceUid(datasource);

			// Parse time range to seconds for relativeTimeRange
			const timeRangeSeconds = parseTimeRangeToSeconds(condition.timeRange);

			// Build clean annotations (filter undefined values)
			const cleanAnnotations: Record<string, string> = {};
			if (annotations?.summary)
				cleanAnnotations.summary = annotations.summary;
			if (annotations?.description)
				cleanAnnotations.description = annotations.description;
			if (annotations?.runbook_url)
				cleanAnnotations.runbook_url = annotations.runbook_url;

			// Build alert rule payload
			const ruleData = {
				title: name,
				ruleGroup: folderName,
				folderUID: folderUid,
				condition: "C",
				for: forDur,
				annotations: cleanAnnotations,
				labels: {
					...labels,
					auto_created: "true",
				},
				noDataState: "NoData",
				execErrState: "Error",
				data: [
					{
						refId: "A",
						relativeTimeRange: { from: timeRangeSeconds, to: 0 },
						datasourceUid,
						model: {
							refId: "A",
							expr: query,
							...(datasource === "Loki" ? { queryType: "range" } : {}),
						},
					},
					{
						refId: "B",
						relativeTimeRange: { from: timeRangeSeconds, to: 0 },
						datasourceUid: "__expr__",
						model: {
							refId: "B",
							type: "reduce",
							expression: "A",
							reducer: "last",
							settings: { mode: "" },
						},
					},
					{
						refId: "C",
						relativeTimeRange: { from: timeRangeSeconds, to: 0 },
						datasourceUid: "__expr__",
						model: {
							refId: "C",
							type: "threshold",
							expression: "B",
							conditions: [
								{
									evaluator: {
										type: condition.operator,
										params: [condition.threshold],
									},
								},
							],
						},
					},
				],
			};

			const result = await grafanaFetch<AlertRuleResponse>(
				"/api/v1/provisioning/alert-rules",
				{
					method: "POST",
					body: ruleData,
				},
			);

			log.info(
				{ uid: result.uid, name, datasource, folder: folderName },
				"Created Grafana alert rule",
			);

			return {
				success: true,
				uid: result.uid,
				message: `Alert "${name}" created successfully`,
				folder: folderName,
				forDuration: forDur,
			};
		} catch (error) {
			log.error({ error, name, datasource }, "Failed to create Grafana alert");
			return {
				success: false,
				error:
					error instanceof Error
						? error.message
						: "Failed to create alert",
			};
		}
	},
);

export const listGrafanaAlertsTool = toolDefinition({
	name: "list_grafana_alerts",
	description: `List existing Grafana alert rules.

Use to:
- See what alerts are configured
- Check on auto-created alerts
- Find alert UIDs for updating/deleting
- Review alert rules after creating them

Can filter by folder, current state, or labels.

Example: list_grafana_alerts({ labels: { auto_created: "true" } })`,
	inputSchema: z.object({
		folder: z
			.string()
			.optional()
			.describe('Filter by folder name (e.g. "nexus-auto")'),
		state: z
			.enum(["firing", "pending", "inactive"])
			.optional()
			.describe("Filter by current alert state"),
		labels: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				'Filter by labels (e.g. { auto_created: "true" })',
			),
	}),
}).server(async ({ folder, state, labels }) => {
	try {
		const rules = await grafanaFetch<AlertRuleResponse[]>(
			"/api/v1/provisioning/alert-rules",
		);

		// Fetch live alert states from prometheus-compatible API
		const stateMap = new Map<string, string>();
		try {
			const promRules = await grafanaFetch<PrometheusRulesResponse>(
				"/api/prometheus/grafana/api/v1/rules",
			);
			for (const group of promRules.data.groups) {
				for (const rule of group.rules) {
					stateMap.set(`${group.file}:${rule.name}`, rule.state);
				}
			}
		} catch (err) {
			log.warn(
				{ err },
				"Failed to fetch alert states, continuing without state info",
			);
		}

		let filtered = rules;

		// Filter by folder
		if (folder) {
			const folders = await grafanaFetch<GrafanaFolder[]>("/api/folders");
			const targetFolder = folders.find((f) => f.title === folder);
			if (targetFolder) {
				filtered = filtered.filter(
					(r) => r.folderUID === targetFolder.uid,
				);
			} else {
				filtered = [];
			}
		}

		// Filter by labels
		if (labels) {
			filtered = filtered.filter((r) => {
				return Object.entries(labels).every(
					([k, v]) => r.labels?.[k] === v,
				);
			});
		}

		// Filter by state
		if (state) {
			filtered = filtered.filter((r) => {
				return stateMap.get(`${r.folderUID}:${r.title}`) === state;
			});
		}

		const results = filtered.map((r) => ({
			uid: r.uid,
			name: r.title,
			folder: r.folderUID,
			ruleGroup: r.ruleGroup,
			state: stateMap.get(`${r.folderUID}:${r.title}`) ?? "unknown",
			for: r.for,
			labels: r.labels,
			annotations: r.annotations,
		}));

		log.info(
			{ count: results.length, folder },
			"Listed Grafana alert rules",
		);

		return {
			success: true,
			count: results.length,
			rules: results,
		};
	} catch (error) {
		log.error({ error }, "Failed to list Grafana alerts");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to list alerts",
			rules: [],
			count: 0,
		};
	}
});

export const updateGrafanaAlertTool = toolDefinition({
	name: "update_grafana_alert",
	description: `Update an existing Grafana alert rule.

Use to tune alerts based on operational learning:
- Increase threshold after false positives
- Decrease threshold after missed detections
- Update annotations with new investigation findings
- Adjust evaluation window or for duration

Example: update_grafana_alert({
  uid: "abc123",
  updates: { threshold: 5, annotations: { description: "Updated: threshold increased due to false positives" } }
})`,
	inputSchema: z.object({
		uid: z
			.string()
			.describe("Alert rule UID (from list_grafana_alerts)"),
		updates: z.object({
			threshold: z.number().optional().describe("New threshold value"),
			timeRange: z
				.string()
				.optional()
				.describe('New evaluation window (e.g. "10m")'),
			forDuration: z
				.string()
				.optional()
				.describe('New for duration (e.g. "5m")'),
			annotations: z
				.record(z.string(), z.string())
				.optional()
				.describe("Updated annotations (merged with existing)"),
			labels: z
				.record(z.string(), z.string())
				.optional()
				.describe("Updated labels (merged with existing)"),
		}),
	}),
}).server(async ({ uid, updates }) => {
	try {
		// Get existing rule
		const existing = await grafanaFetch<AlertRuleResponse>(
			`/api/v1/provisioning/alert-rules/${uid}`,
		);

		// Build updated rule
		const updated = { ...existing };

		if (updates.annotations) {
			updated.annotations = {
				...existing.annotations,
				...updates.annotations,
			} as Record<string, string>;
		}

		if (updates.labels) {
			updated.labels = {
				...existing.labels,
				...updates.labels,
			} as Record<string, string>;
		}

		if (updates.forDuration) {
			updated.for = updates.forDuration;
		}

		// Update data array (threshold and/or timeRange) in a single pass
		if (updates.threshold !== undefined || updates.timeRange) {
			const data = [...(existing.data as Record<string, unknown>[])];

			if (updates.threshold !== undefined) {
				for (const node of data) {
					const model = node.model as
						| Record<string, unknown>
						| undefined;
					if (model?.type === "threshold") {
						const conditions = model.conditions as Array<{
							evaluator: { params: number[] };
						}>;
						if (conditions?.[0]?.evaluator) {
							conditions[0].evaluator.params = [
								updates.threshold,
							];
						}
					}
				}
			}

			if (updates.timeRange) {
				const newSeconds = parseTimeRangeToSeconds(updates.timeRange);
				for (const node of data) {
					const timeRange = node.relativeTimeRange as
						| { from: number }
						| undefined;
					if (timeRange) {
						timeRange.from = newSeconds;
					}
				}
			}

			updated.data = data;
		}

		await grafanaFetch(`/api/v1/provisioning/alert-rules/${uid}`, {
			method: "PUT",
			body: updated,
		});

		const updatedFields = Object.keys(updates).filter(
			(k) =>
				(updates as Record<string, unknown>)[k] !== undefined,
		);

		log.info(
			{ uid, updatedFields },
			"Updated Grafana alert rule",
		);

		return {
			success: true,
			uid,
			message: `Alert "${existing.title}" updated successfully`,
			updatedFields,
		};
	} catch (error) {
		log.error({ error, uid }, "Failed to update Grafana alert");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to update alert",
		};
	}
});

export const deleteGrafanaAlertTool = toolDefinition({
	name: "delete_grafana_alert",
	description: `Delete a Grafana alert rule.

Use when:
- An issue has been permanently resolved and the alert is obsolete
- An alert is redundant with another
- Cleaning up test alerts

Example: delete_grafana_alert({ uid: "abc123" })`,
	inputSchema: z.object({
		uid: z
			.string()
			.describe("Alert rule UID (from list_grafana_alerts)"),
	}),
}).server(async ({ uid }) => {
	try {
		// Get info before deleting for confirmation message
		let title = uid;
		try {
			const existing = await grafanaFetch<AlertRuleResponse>(
				`/api/v1/provisioning/alert-rules/${uid}`,
			);
			title = existing.title;
		} catch {
			// If we can't get it, still try to delete
		}

		await grafanaFetch(`/api/v1/provisioning/alert-rules/${uid}`, {
			method: "DELETE",
		});

		log.info({ uid, title }, "Deleted Grafana alert rule");

		return {
			success: true,
			uid,
			message: `Alert "${title}" deleted successfully`,
		};
	} catch (error) {
		log.error({ error, uid }, "Failed to delete Grafana alert");
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to delete alert",
		};
	}
});

export const testGrafanaAlertQueryTool = toolDefinition({
	name: "test_grafana_alert_query",
	description: `Test a Grafana alert query against current data without creating an alert.

Use to:
- Verify a query works before creating an alert
- Debug alert queries that aren't triggering as expected
- Check if a condition would currently fire

Returns the query result so you can see if the condition would trigger.

Example: test_grafana_alert_query({
  datasource: "Loki",
  query: 'count_over_time({namespace="sabnzbd"} |= "API key incorrect"[5m])',
  timeRange: "5m"
})`,
	inputSchema: z.object({
		datasource: z
			.enum(["Prometheus", "Loki"])
			.describe("Data source for the query"),
		query: z.string().describe("PromQL or LogQL expression to test"),
		timeRange: z
			.string()
			.optional()
			.describe('Time range to evaluate (default: "5m")'),
	}),
}).server(async ({ datasource, query, timeRange }) => {
	try {
		const range = timeRange ?? "5m";
		const datasourceUid = await resolveDatasourceUid(datasource);
		const timeRangeSeconds = parseTimeRangeToSeconds(range);

		const now = Date.now();
		const from = now - timeRangeSeconds * 1000;

		const result = await grafanaFetch<{
			results: Record<
				string,
				{ frames?: unknown[]; error?: string }
			>;
		}>("/api/ds/query", {
			method: "POST",
			body: {
				queries: [
					{
						refId: "A",
						datasource: { uid: datasourceUid },
						expr: query,
						...(datasource === "Loki"
							? { queryType: "range" }
							: {}),
						maxDataPoints: 100,
						intervalMs: 1000,
					},
				],
				from: String(from),
				to: String(now),
			},
		});

		const queryResult = result.results?.A;

		if (queryResult?.error) {
			return {
				success: false,
				error: queryResult.error,
				query,
				datasource,
			};
		}

		const hasData =
			queryResult?.frames && queryResult.frames.length > 0;

		log.info(
			{ query, datasource, hasData },
			"Tested Grafana alert query",
		);

		return {
			success: true,
			query,
			datasource,
			timeRange: range,
			hasData,
			frames: queryResult?.frames?.slice(0, 5) ?? [],
			message: hasData
				? "Query returned data — an alert with this query would have data to evaluate"
				: "Query returned no data — an alert with this query would be in NoData state",
		};
	} catch (error) {
		log.error(
			{ error, query, datasource },
			"Failed to test Grafana alert query",
		);
		return {
			success: false,
			error:
				error instanceof Error
					? error.message
					: "Failed to test query",
			query,
			datasource,
		};
	}
});

export const grafanaTools = [
	createGrafanaAlertTool,
	listGrafanaAlertsTool,
	updateGrafanaAlertTool,
	deleteGrafanaAlertTool,
	testGrafanaAlertQueryTool,
];
