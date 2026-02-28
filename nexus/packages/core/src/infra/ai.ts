import { chat } from "@tanstack/ai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import logger from "@nexus/logger";
import { config } from "./config";

const log = logger.child({ module: "ai" });

const TITLE_PROMPT = `Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no explanation.`;

export async function generateConversationTitle(
	userMessage: string,
	assistantResponse: string
): Promise<string | null> {
	log.info(
		{ userMessageLength: userMessage.length, assistantResponseLength: assistantResponse.length },
		"generating conversation title"
	);

	if (!config.OPENROUTER_API_KEY) {
		log.warn("OPENROUTER_API_KEY not configured, skipping title generation");
		return null;
	}

	try {
		const adapter = createOpenRouterText(
			config.AI_MODEL as Parameters<typeof createOpenRouterText>[0],
			config.OPENROUTER_API_KEY,
		);

		const title = await chat({
			adapter,
			systemPrompts: [TITLE_PROMPT],
			messages: [{ role: "user", content: `User: ${userMessage}\n\nAssistant: ${assistantResponse}` }],
			maxTokens: 20,
			stream: false,
		});

		const trimmed = title?.trim() || null;
		log.info({ title: trimmed }, "generated conversation title");
		return trimmed;
	} catch (error) {
		log.error({ error }, "failed to generate title");
		return null;
	}
}
