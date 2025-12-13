import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { staticPlugin } from "@elysiajs/static";
import { Elysia } from "elysia";
import logger from "logger";
import { config } from "./infra/config";
import { internalRoutes } from "./routes/internal";
import { privateRoutes } from "./routes/private";
import { publicRoutes } from "./routes/public";

export const app = new Elysia()
  .use(
    cors({
      origin: config.NODE_ENV === "development" ? true : false,
    }),
  )
  .use(
    staticPlugin({
      assets: "public",
      prefix: "/",
      alwaysStatic: true,
    }),
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
    }),
  )
  .use(publicRoutes)
  .use(privateRoutes)
  .use(internalRoutes)
  .onError((ctx) => {
    const message =
      ctx.error instanceof Error ? ctx.error.message : String(ctx.error);
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
