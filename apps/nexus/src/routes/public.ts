import { Elysia, t } from "elysia";
import { config } from "@nexus-core/infra/config";

export const publicRoutes = new Elysia({ prefix: "" })
	.get(
		"/health",
		() => ({
			status: "ok",
			timestamp: new Date().toISOString(),
			version: "1.0.0",
		}),
		{
			detail: { tags: ["Health"], summary: "Health check endpoint" },
			response: {
				200: t.Object({
					status: t.String(),
					timestamp: t.String(),
					version: t.String(),
				}),
			},
		}
	)
	.get(
		"/api/status",
		() => ({
			environment: config.NODE_ENV,
			k8sNamespace: config.K8S_NAMESPACE,
			inCluster: config.K8S_IN_CLUSTER,
		}),
		{
			detail: { tags: ["Health"], summary: "API status" },
			response: {
				200: t.Object({
					environment: t.String(),
					k8sNamespace: t.String(),
					inCluster: t.Boolean(),
				}),
			},
		}
	);
