import { Elysia } from "elysia";
import logger from "logger";
import { gameServerRoutes } from "../domains/game-servers/routes";
import { autheliaMiddleware } from "../middleware/authelia";

export const privateRoutes = new Elysia({ prefix: "/api" })
	.use(autheliaMiddleware)
	.use(gameServerRoutes)
	.onBeforeHandle(({ user, path }) => {
		// In production with Authelia, user will always be set for /api/* routes
		// because Authelia handles auth at the ingress level
		// This is a fallback for direct access or misconfiguration
		if (!user && process.env.NODE_ENV === "production") {
			logger.warn({ path }, "Unauthenticated request to protected route");
			// Don't block - Authelia should handle this at ingress
		}
	});
