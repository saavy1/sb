import { Elysia, t } from "elysia";
import logger from "logger";
import { config } from "../infra/config";
import { opsService } from "../domains/ops/service";

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

export const webhookRoutes = new Elysia({ prefix: "/webhooks" }).post(
	"/github",
	async ({ body, headers, set, request }) => {
		const rawBody = await request.clone().text();
		const webhookSecret = config.GITHUB_WEBHOOK_SECRET;

		// Verify signature
		if (webhookSecret) {
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
		}

		const payload = typeof body === "string" ? JSON.parse(body) : body;
		const { trigger, actor } = payload;

		if (!trigger) {
			return { message: "No trigger specified" };
		}

		// Dispatch based on trigger type
		if (trigger === "nixos-rebuild") {
			await opsService.triggerOperation("nixos-rebuild", "webhook", actor);
			logger.info({ trigger, actor }, "Webhook triggered nixos-rebuild");
			return { message: "nixos-rebuild triggered" };
		}

		if (trigger === "flux-reconcile") {
			await opsService.triggerOperation("flux-reconcile", "webhook", actor);
			logger.info({ trigger, actor }, "Webhook triggered flux-reconcile");
			return { message: "flux-reconcile triggered" };
		}

		return { message: `Unknown trigger: ${trigger}` };
	},
	{
		detail: { tags: ["Webhooks"], summary: "GitHub Actions webhook for deployments" },
		body: t.Object({
			trigger: t.String(),
			actor: t.Optional(t.String()),
		}),
		response: {
			200: t.Object({ message: t.String() }),
		},
	}
);
