/**
 * OpenTelemetry initialization for non-Elysia services (bot, workers).
 * Must be imported BEFORE any other modules to ensure proper instrumentation.
 */
import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";
import { IORedisInstrumentation } from "@opentelemetry/instrumentation-ioredis";
import { trace, SpanStatusCode, type Span } from "@opentelemetry/api";
import logger from "@nexus/logger";

const log = logger.child({ module: "telemetry" });

let sdk: NodeSDK | null = null;

/**
 * Initialize OpenTelemetry SDK for a service.
 * Call this at the very start of your entry point, before importing other modules.
 */
export function initTelemetry(serviceName: string): void {
	if (sdk) {
		log.warn("Telemetry already initialized");
		return;
	}

	const exporter = new OTLPTraceExporter();

	sdk = new NodeSDK({
		serviceName,
		spanProcessors: [new BatchSpanProcessor(exporter)],
		instrumentations: [new IORedisInstrumentation()],
	});

	sdk.start();
	log.info({ serviceName }, "OpenTelemetry initialized");

	// Graceful shutdown
	const shutdown = async () => {
		try {
			await sdk?.shutdown();
			log.info("OpenTelemetry shut down");
		} catch (error) {
			log.error({ error }, "Error shutting down OpenTelemetry");
		}
	};

	process.on("SIGTERM", shutdown);
	process.on("SIGINT", shutdown);
}

/**
 * Get a tracer for creating spans.
 */
export function getTracer(name: string) {
	return trace.getTracer(name);
}

/**
 * Execute a function within a new span.
 * Automatically handles errors and span lifecycle.
 */
export async function withSpan<T>(
	tracerName: string,
	spanName: string,
	fn: (span: Span) => Promise<T>,
	attributes?: Record<string, string | number | boolean>
): Promise<T> {
	const tracer = getTracer(tracerName);

	return tracer.startActiveSpan(spanName, async (span) => {
		try {
			if (attributes) {
				span.setAttributes(attributes);
			}
			const result = await fn(span);
			span.setStatus({ code: SpanStatusCode.OK });
			return result;
		} catch (error) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : "Unknown error",
			});
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	});
}

/**
 * Get the current active span, if any.
 */
export function getCurrentSpan(): Span | undefined {
	return trace.getActiveSpan();
}

/**
 * Add attributes to the current active span.
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
	const span = getCurrentSpan();
	if (span) {
		span.setAttributes(attributes);
	}
}

const httpTracer = trace.getTracer("http");

/**
 * Traced fetch wrapper for external API calls.
 * Automatically creates spans with HTTP semantic conventions.
 */
export async function tracedFetch(
	url: string | URL | Request,
	init?: RequestInit,
): Promise<Response> {
	const urlStr = url instanceof Request ? url.url : url.toString();
	const parsedUrl = new URL(urlStr);
	const method = init?.method ?? (url instanceof Request ? url.method : "GET");

	return httpTracer.startActiveSpan(`${method} ${parsedUrl.host}`, async (span) => {
		try {
			span.setAttribute("http.request.method", method);
			span.setAttribute("url.full", urlStr);
			span.setAttribute("server.address", parsedUrl.host);
			span.setAttribute("url.path", parsedUrl.pathname);

			const response = await fetch(url, init);

			span.setAttribute("http.response.status_code", response.status);
			if (response.status >= 400) {
				span.setStatus({
					code: SpanStatusCode.ERROR,
					message: `HTTP ${response.status}`,
				});
			} else {
				span.setStatus({ code: SpanStatusCode.OK });
			}

			return response;
		} catch (error) {
			span.setStatus({
				code: SpanStatusCode.ERROR,
				message: error instanceof Error ? error.message : "Fetch failed",
			});
			span.recordException(error as Error);
			throw error;
		} finally {
			span.end();
		}
	});
}
