import { chat } from "@tanstack/ai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import logger from "@nexus/logger";
import { modelRepository } from "../domains/core/ai-registry";
import type { AiProvider } from "../domains/agent/schema";
import { config } from "./config";

const log = logger.child({ module: "ai" });

const TITLE_PROMPT = `Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no explanation.`;

/**
 * Create a chat adapter for a specific provider.
 * Used internally after resolving the model's provider.
 */
function createAdapterForProvider(provider: AiProvider, modelId: string) {
	switch (provider.type) {
		case "openrouter": {
			const apiKey = provider.apiKey || config.OPENROUTER_API_KEY;
			if (!apiKey) throw new Error("No API key configured for OpenRouter provider");
			return createOpenRouterText(
				modelId as Parameters<typeof createOpenRouterText>[0],
				apiKey,
			);
		}
		case "openai-compatible": {
			if (!provider.baseUrl) throw new Error(`No base URL configured for provider "${provider.name}"`);
			const apiKey = provider.apiKey || config.AI_LOCAL_API_KEY;
			return createOpenaiChat(
				modelId as Parameters<typeof createOpenaiChat>[0],
				apiKey,
				{ baseURL: provider.baseUrl },
			);
		}
		default:
			throw new Error(`Unknown provider type: ${provider.type}`);
	}
}

/**
 * Create a chat adapter by looking up the model's provider from the registry.
 * The modelRegistryId is the ai_models.id (e.g. "openrouter:deepseek/deepseek-v3.2").
 */
export async function createChatAdapter(modelRegistryId: string) {
	const result = await modelRepository.getWithProvider(modelRegistryId);
	if (!result) {
		throw new Error(`Model "${modelRegistryId}" not found in registry`);
	}
	const { model, provider } = result;
	if (!provider.enabled) {
		throw new Error(`Provider "${provider.name}" is disabled`);
	}
	return createAdapterForProvider(provider, model.modelId);
}

/**
 * Check if any AI provider is available (has at least one enabled provider).
 */
export async function hasAiProvider(): Promise<boolean> {
	const { providerRepository } = await import("../domains/core/ai-registry");
	const enabled = await providerRepository.listEnabled();
	return enabled.length > 0;
}

export async function generateConversationTitle(
	userMessage: string,
	assistantResponse: string,
	modelRegistryId: string,
): Promise<string | null> {
	log.info(
		{ userMessageLength: userMessage.length, assistantResponseLength: assistantResponse.length },
		"generating conversation title"
	);

	if (!(await hasAiProvider())) {
		log.warn("AI provider not configured, skipping title generation");
		return null;
	}

	try {
		const adapter = await createChatAdapter(modelRegistryId);

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
