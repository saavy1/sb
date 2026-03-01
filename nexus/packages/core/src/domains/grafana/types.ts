import { z } from "zod";

export const GrafanaRequestOptionsSchema = z.object({
	method: z.string().optional(),
	body: z.unknown().optional(),
});
export type GrafanaRequestOptions = z.infer<typeof GrafanaRequestOptionsSchema>;

export const GrafanaFolderSchema = z.object({
	uid: z.string(),
	title: z.string(),
});
export type GrafanaFolder = z.infer<typeof GrafanaFolderSchema>;

export const GrafanaDatasourceSchema = z.object({
	uid: z.string(),
	name: z.string(),
	type: z.string(),
});
export type GrafanaDatasource = z.infer<typeof GrafanaDatasourceSchema>;

export const AlertRuleResponseSchema = z.object({
	uid: z.string(),
	title: z.string(),
	ruleGroup: z.string(),
	folderUID: z.string(),
	condition: z.string(),
	for: z.string(),
	annotations: z.record(z.string(), z.string()),
	labels: z.record(z.string(), z.string()),
	data: z.array(z.unknown()),
	noDataState: z.string(),
	execErrState: z.string(),
});
export type AlertRuleResponse = z.infer<typeof AlertRuleResponseSchema>;

export const PrometheusRulesResponseSchema = z.object({
	status: z.string(),
	data: z.object({
		groups: z.array(
			z.object({
				name: z.string(),
				file: z.string(),
				rules: z.array(
					z.object({
						name: z.string(),
						state: z.string(),
						type: z.string(),
					}),
				),
			}),
		),
	}),
});
export type PrometheusRulesResponse = z.infer<
	typeof PrometheusRulesResponseSchema
>;
