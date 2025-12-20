import { existsSync } from "node:fs";
import { join } from "node:path";
import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { config } from "@nexus/core/infra/config";
import logger from "@nexus/logger";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { Elysia } from "elysia";
import { internalRoutes } from "./routes/internal";
import { privateRoutes } from "./routes/private";
import { publicRoutes } from "./routes/public";
import { webhookRoutes } from "./routes/webhooks";

const PUBLIC_DIR = "public";

// Configure OTLP exporter - uses OTEL_EXPORTER_OTLP_ENDPOINT env var
const traceExporter = new OTLPTraceExporter();

export const app = new Elysia()
	.use(
		opentelemetry({
			serviceName: "nexus-api",
			spanProcessors: [new BatchSpanProcessor(traceExporter)],
			instrumentations: [new IORedisInstrumentation()],
		})
	)
	.use(
		cors({
			origin: config.NODE_ENV === "development",
		})
	)
	.use(
		openapi({
			documentation: {
				info: {
					title: "Homelab Elysia API",
					version: "1.0.0",
					description: "Central API for homelab automation",
				},
				tags: [
					{ name: "Health", description: "Health and status endpoints" },
					{ name: "Game Servers", description: "Minecraft server management" },
					{
						name: "System Info",
						description: "System monitoring and drive management",
					},
					{ name: "Internal", description: "Internal K8s endpoints" },
				],
			},
		})
	)
	.use(publicRoutes)
	.use(webhookRoutes)
	.use(privateRoutes)
	.use(internalRoutes)
	// Serve static files (SPA fallback to index.html)
	.get("/*", ({ params }) => {
		const reqPath = params["*"] || "index.html";
		const filePath = join(PUBLIC_DIR, reqPath);

		// Serve file if exists
		if (existsSync(filePath)) {
			return new Response(Bun.file(filePath));
		}

		// SPA fallback - serve index.html for client-side routing
		const indexPath = join(PUBLIC_DIR, "index.html");
		if (existsSync(indexPath)) {
			return new Response(Bun.file(indexPath));
		}

		return new Response("Not found", { status: 404 });
	})
	.onError((ctx) => {
		const message = ctx.error instanceof Error ? ctx.error.message : String(ctx.error);
		logger.error(`[${ctx.code}] ${message}`);

		if (ctx.code === "VALIDATION") {
			ctx.set.status = 400;
			return { error: "Validation failed", details: message };
		}

		if (ctx.code === "NOT_FOUND") {
			ctx.set.status = 404;
			return { error: "Not found" };
		}

		ctx.set.status = 500;
		return { error: "Internal server error" };
	});

export type App = typeof app;
