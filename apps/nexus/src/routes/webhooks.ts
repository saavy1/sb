import { Elysia } from "elysia";
import logger from "logger";
import { config } from "../infra/config";
import { opsService } from "../domains/ops/service";
import { WebhookPayload, WebhookResponse } from "../domains/ops/types";

// Timing-safe comparison to prevent timing attacks
function timingSafeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

// Verify GitHub webhook signature using HMAC-SHA256
async function verifyGitHubSignature(
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

		if (webhookSecret) {
			const signature = headers["x-hub-signature-256"];
			if (!signature) {
				logger.warn("GitHub webhook missing signature");
				set.status = 401;
				return { message: "Missing signature" };
			}

			const isValid = await verifyGitHubSignature(rawBody, signature, webhookSecret);
			if (!isValid) {
				logger.warn("GitHub webhook signature verification failed");
				set.status = 401;
				return { message: "Invalid signature" };
			}
		}

		const payload = typeof body === "string" ? JSON.parse(body) : body;
		const event = headers["x-github-event"];

		if (event !== "push") {
			return { message: "Ignored non-push event" };
		}

		const changedFiles: string[] = [];
		for (const commit of payload.commits || []) {
			changedFiles.push(...(commit.modified || []), ...(commit.added || []));
		}

		const user = payload.sender?.login;
		const triggers: string[] = [];

		if (opsService.shouldTriggerNixosRebuild(changedFiles)) {
			await opsService.triggerOperation("nixos-rebuild", "webhook", user);
			triggers.push("nixos-rebuild");
		}

		if (triggers.length === 0) {
			return { message: "No matching triggers", changedFiles };
		}

		logger.info({ triggers, changedFiles, user }, "Webhook triggered operations");
		return { message: "Operations triggered", triggers };
	},
	{
		detail: { tags: ["Webhooks"], summary: "GitHub webhook for auto-deploy" },
		body: WebhookPayload,
		response: { 200: WebhookResponse },
	}
);
