import { chat } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import logger from "@nexus/logger";
import { config } from "./config";

const log = logger.child({ module: "ai" });

const TITLE_PROMPT = `Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no explanation.`;

function isLocalProvider() {
	return config.AI_PROVIDER === "local";
}

export function createChatAdapter(model: string) {
	if (isLocalProvider()) {
		return createOpenaiChat(
			model as Parameters<typeof createOpenaiChat>[0],
			config.AI_LOCAL_API_KEY,
			{ baseURL: config.AI_LOCAL_URL },
		);
	}
	return createOpenRouterText(
		model as Parameters<typeof createOpenRouterText>[0],
		config.OPENROUTER_API_KEY!,
	);
}

export function hasAiProvider(): boolean {
	if (isLocalProvider()) {
		return !!config.AI_LOCAL_URL;
	}
	return !!config.OPENROUTER_API_KEY;
}

export async function generateConversationTitle(
	userMessage: string,
	assistantResponse: string
): Promise<string | null> {
	log.info(
		{ userMessageLength: userMessage.length, assistantResponseLength: assistantResponse.length },
		"generating conversation title"
	);

	if (!hasAiProvider()) {
		log.warn("AI provider not configured, skipping title generation");
		return null;
	}

	try {
		const adapter = createChatAdapter(config.AI_MODEL);

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
