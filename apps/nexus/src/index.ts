import logger from "logger";
import { app } from "./app";
import { startAgentWorker } from "./domains/agent/worker";
import { config } from "./infra/config";
import { closeQueues } from "./infra/queue";

const server = app.listen(config.PORT);

// Start the agent wake worker
const agentWorker = startAgentWorker();

logger.info(
	{
		hostname: server.server?.hostname,
		port: server.server?.port,
		openapi: `/openapi`,
	},
	"Homelab API started"
);
logger.info(`Homelab API running at http://${server.server?.hostname}:${server.server?.port}`);
logger.info(`OpenAPI docs at http://${server.server?.hostname}:${server.server?.port}/openapi`);

// Graceful shutdown
process.on("SIGTERM", async () => {
	logger.info("Received SIGTERM, shutting down...");
	await agentWorker.close();
	await closeQueues();
	process.exit(0);
});

process.on("SIGINT", async () => {
	logger.info("Received SIGINT, shutting down...");
	await agentWorker.close();
	await closeQueues();
	process.exit(0);
});
