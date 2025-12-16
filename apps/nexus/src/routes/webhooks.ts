import { Elysia, t } from "elysia";
import logger from "logger";
import { triggerOperation } from "@nexus-core/domains/ops";
import { config } from "@nexus-core/infra/config";
import { systemEventQueue } from "@nexus-core/infra/queue";

// Grafana webhook payload - permissive schema, we'll extract what we need
// Grafana's actual payload structure can vary, so we accept any object and validate at runtime
const GrafanaPayload = t.Record(t.String(), t.Unknown());

// Timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

// Verify webhook signature using HMAC-SHA256
async function verifySignature(
	payload: string,
	signature: string,
	secret: string
): Promise<boolean> {
	const encoder = new TextEncoder();
	const key = await crypto.subtle.importKey(
		"raw",
		encoder.encode(secret),
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign"]
	);
	const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
	const expectedSig = `sha256=${Array.from(new Uint8Array(sig))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("")}`;
	return timingSafeEqual(signature, expectedSig);
}

// Alertmanager webhook payload schema
const AlertmanagerAlert = t.Object({
	status: t.Union([t.Literal("firing"), t.Literal("resolved")]),
	labels: t.Record(t.String(), t.String()),
	annotations: t.Optional(t.Record(t.String(), t.String())),
	startsAt: t.String(),
	endsAt: t.Optional(t.String()),
	generatorURL: t.Optional(t.String()),
	fingerprint: t.String(),
});

const AlertmanagerPayload = t.Object({
	receiver: t.String(),
	status: t.Union([t.Literal("firing"), t.Literal("resolved")]),
	alerts: t.Array(AlertmanagerAlert),
	groupLabels: t.Optional(t.Record(t.String(), t.String())),
	commonLabels: t.Optional(t.Record(t.String(), t.String())),
	commonAnnotations: t.Optional(t.Record(t.String(), t.String())),
	externalURL: t.Optional(t.String()),
});

export const webhookRoutes = new Elysia({ prefix: "/webhooks" })
	.post(
		"/alertmanager",
		async ({ body }) => {
			// Log full payload for debugging
			logger.info({ payload: body }, "Alertmanager webhook received");

			// Queue the event for processing by a worker
			const job = await systemEventQueue.add("alertmanager-alert", {
				type: "alertmanager-alert",
				payload: body,
				receivedAt: new Date().toISOString(),
			});

			logger.info({ jobId: job.id }, "Queued Alertmanager alert for processing");

			return {
				message: "Alert queued",
				jobId: job.id,
			};
		},
		{
			detail: { tags: ["Webhooks"], summary: "Alertmanager webhook for autonomous alert response" },
			body: AlertmanagerPayload,
			response: {
				200: t.Object({
					message: t.String(),
					jobId: t.Optional(t.String()),
				}),
			},
		}
	)
	.post(
		"/github",
		async ({ body, headers, set, request }) => {
			const webhookSecret = config.GITHUB_WEBHOOK_SECRET;

			// Require webhook secret in production
			if (!webhookSecret) {
				logger.error("GITHUB_WEBHOOK_SECRET not configured");
				set.status = 500;
				return { message: "Webhook not configured" };
			}

			// Verify signature using raw body
			const rawBody = await request.clone().text();
			const signature = headers["x-hub-signature-256"];

			if (!signature) {
				logger.warn("Webhook missing signature");
				set.status = 401;
				return { message: "Missing signature" };
			}

			const isValid = await verifySignature(rawBody, signature, webhookSecret);
			if (!isValid) {
				logger.warn("Webhook signature verification failed");
				set.status = 401;
				return { message: "Invalid signature" };
			}

			// Body is already parsed and validated by Elysia
			const { trigger, actor } = body;

			// Dispatch based on trigger type
			if (trigger === "nixos-rebuild") {
				await triggerOperation("nixos-rebuild", "webhook", actor);
				logger.info({ trigger, actor }, "Webhook triggered nixos-rebuild");
				return { message: "nixos-rebuild triggered" };
			}

			if (trigger === "flux-reconcile") {
				await triggerOperation("flux-reconcile", "webhook", actor);
				logger.info({ trigger, actor }, "Webhook triggered flux-reconcile");
				return { message: "flux-reconcile triggered" };
			}

			return { message: `Unknown trigger: ${trigger}` };
		},
		{
			detail: { tags: ["Webhooks"], summary: "GitHub Actions webhook for deployments" },
			body: t.Object({
				trigger: t.Union([t.Literal("nixos-rebuild"), t.Literal("flux-reconcile")]),
				actor: t.Optional(t.String()),
			}),
			response: {
				200: t.Object({ message: t.String() }),
				401: t.Object({ message: t.String() }),
				500: t.Object({ message: t.String() }),
			},
		}
	)
	.post(
		"/grafana",
		async ({ body, headers, set }) => {
			const token = config.GRAFANA_WEBHOOK_TOKEN;

			// Require token in production
			if (!token) {
				logger.error("GRAFANA_WEBHOOK_TOKEN not configured");
				set.status = 500;
				return { message: "Webhook not configured" };
			}

			// Verify bearer token
			const authHeader = headers.authorization;
			if (!authHeader?.startsWith("Bearer ")) {
				logger.warn("Grafana webhook missing bearer token");
				set.status = 401;
				return { message: "Missing authorization" };
			}

			const providedToken = authHeader.slice(7);
			if (!timingSafeEqual(providedToken, token)) {
				logger.warn("Grafana webhook invalid token");
				set.status = 401;
				return { message: "Invalid token" };
			}

			// Log full payload for debugging
			logger.info({ payload: body }, "Grafana webhook received");

			// Queue the event for processing by a worker
			const job = await systemEventQueue.add("grafana-alert", {
				type: "grafana-alert",
				payload: body,
				receivedAt: new Date().toISOString(),
			});

			logger.info({ jobId: job.id }, "Queued Grafana alert for processing");

			return {
				message: "Alert queued",
				jobId: job.id,
			};
		},
		{
			detail: { tags: ["Webhooks"], summary: "Grafana webhook for alert notifications" },
			body: GrafanaPayload,
			response: {
				200: t.Object({
					message: t.String(),
					jobId: t.Optional(t.String()),
				}),
				401: t.Object({ message: t.String() }),
				500: t.Object({ message: t.String() }),
			},
		}
	);
