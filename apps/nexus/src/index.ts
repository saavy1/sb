import logger from "logger";
import { app } from "./app";
import { startAgentWorker } from "./domains/agent/worker";
import { config } from "./infra/config";
import { closeQueues } from "./infra/queue";

// Conditional startup based on MODE
let server: ReturnType<typeof app.listen> | null = null;
let agentWorker: Awaited<ReturnType<typeof startAgentWorker>> | null = null;

// Start API server if MODE is "api" or "both"
if (config.MODE === "api" || config.MODE === "both") {
	server = app.listen(config.PORT);
	logger.info(
		{
			mode: config.MODE,
			hostname: server.server?.hostname,
			port: server.server?.port,
			openapi: `/openapi`,
		},
		"API server started"
	);
	logger.info(`API running at http://${server.server?.hostname}:${server.server?.port}`);
	logger.info(`OpenAPI docs at http://${server.server?.hostname}:${server.server?.port}/openapi`);
}

// Start worker if MODE is "worker" or "both"
if (config.MODE === "worker" || config.MODE === "both") {
	agentWorker = startAgentWorker();
	logger.info({ mode: config.MODE }, "Agent worker started");
}

logger.info({ mode: config.MODE }, "Nexus started");

// Graceful shutdown
async function shutdown(signal: string) {
	logger.info(`Received ${signal}, shutting down...`);
	if (agentWorker) {
		await agentWorker.close();
	}
	await closeQueues();
	if (server) {
		server.stop();
	}
	process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
