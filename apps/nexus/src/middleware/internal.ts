import { Elysia } from "elysia";
import { config } from "../infra/config";

export const internalMiddleware = new Elysia({ name: "internal" })
	.derive({ as: "scoped" }, ({ request }): { isInternal: boolean } => {
		// In development, allow all internal requests
		if (config.NODE_ENV === "development") {
			return { isInternal: true };
		}

		// Check for internal API key
		const apiKey = request.headers.get("X-Internal-Key");
		if (config.INTERNAL_API_KEY && apiKey === config.INTERNAL_API_KEY) {
			return { isInternal: true };
		}

		// Check if request is from within the cluster (optional: trust cluster network)
		// In K8s, internal services communicate via ClusterIP, not through ingress
		// The presence of certain headers or source IP can indicate internal traffic
		const forwardedFor = request.headers.get("X-Forwarded-For");
		if (!forwardedFor) {
			// No proxy headers = likely direct cluster communication
			return { isInternal: true };
		}

		return { isInternal: false };
	})
	.macro({
		requireInternal: (enabled: boolean) => ({
			beforeHandle({ isInternal, set }) {
				if (enabled && !isInternal) {
					set.status = 403;
					return { error: "Internal access only" };
				}
			},
		}),
	});
