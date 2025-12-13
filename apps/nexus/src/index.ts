import logger from "logger";
import { app } from "./app";
import { config } from "./infra/config";

const server = app.listen(config.PORT);

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
