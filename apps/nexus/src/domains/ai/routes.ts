import { Elysia } from "elysia";
import logger from "logger";
import { aiService } from "./service";
import { ChatRequestBody, ErrorResponse } from "./types";

const log = logger.child({ module: "ai" });

export const aiRoutes = new Elysia({ prefix: "/ai" })
	.onError(({ code, error, request, body }) => {
		if (code === "VALIDATION") {
			log.error(
				{
					code,
					message: error.message,
					url: request.url,
					body: JSON.stringify(body).slice(0, 2000),
					all: JSON.stringify(error.all, null, 2),
				},
				"validation error in AI route"
			);
		}
	})
	.post(
		"/chat",
		({ body, set }) => {
			log.debug({ body: JSON.stringify(body).slice(0, 1000) }, "received chat request body");
			try {
				return aiService.chat(body.messages);
			} catch (err) {
				log.error({ error: err }, "chat request failed");
				set.status = 500;
				return { error: err instanceof Error ? err.message : "Chat failed" };
			}
		},
		{
			body: ChatRequestBody,
			response: { 500: ErrorResponse },
			detail: { tags: ["AI"], summary: "Chat with The Machine AI assistant" },
		}
	);
