import { Elysia, t } from "elysia";
import logger from "logger";
import { createThreadFromAlert } from "../domains/agent/functions";
import { triggerOperation } from "../domains/ops/functions";
import { config } from "../infra/config";

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
			const { status, alerts } = body;

			// Only process firing alerts
			if (status !== "firing") {
				logger.info({ status, alertCount: alerts.length }, "Ignoring non-firing alert");
				return { message: "Ignored", threadsCreated: 0 };
			}

			const threadsCreated: string[] = [];

			for (const alert of alerts) {
				try {
					const alertName = alert.labels.alertname || "Unknown";
					const severity = alert.labels.severity || "warning";
					const annotations = alert.annotations as Record<string, string> | undefined;
					const description =
						annotations?.description || annotations?.summary || `Alert: ${alertName}`;

					const thread = await createThreadFromAlert({
						alertName,
						severity,
						description,
						labels: alert.labels,
						annotations: annotations || {},
						startsAt: alert.startsAt,
						fingerprint: alert.fingerprint,
						generatorURL: alert.generatorURL,
					});

					threadsCreated.push(thread.id);
					logger.info(
						{ threadId: thread.id, alertName, severity },
						"Created agent thread for alert"
					);
				} catch (error) {
					logger.error(
						{ error, alert: alert.labels.alertname },
						"Failed to create thread for alert"
					);
				}
			}

			return {
				message: "Alerts processed",
				threadsCreated: threadsCreated.length,
				threadIds: threadsCreated,
			};
		},
		{
			detail: { tags: ["Webhooks"], summary: "Alertmanager webhook for autonomous alert response" },
			body: AlertmanagerPayload,
			response: {
				200: t.Object({
					message: t.String(),
					threadsCreated: t.Number(),
					threadIds: t.Optional(t.Array(t.String())),
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
	);
