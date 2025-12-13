import { Elysia } from "elysia";
import { autheliaMiddleware } from "../middleware/authelia";
import { gameServerRoutes } from "../domains/game-servers/routes";

export const privateRoutes = new Elysia({ prefix: "/api" })
  .use(autheliaMiddleware)
  .use(gameServerRoutes)
  .onBeforeHandle(({ user, path }) => {
    // In production with Authelia, user will always be set for /api/* routes
    // because Authelia handles auth at the ingress level
    // This is a fallback for direct access or misconfiguration
    if (!user && process.env.NODE_ENV === "production") {
      console.warn(`Unauthenticated request to ${path}`);
      // Don't block - Authelia should handle this at ingress
    }
  });
