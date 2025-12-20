import logger from "@nexus/logger";
import { config } from "./config";
import { tracedFetch } from "./telemetry";

const log = logger.child({ module: "ai" });

const TITLE_PROMPT = `Generate a concise 3-5 word title for this conversation. Return ONLY the title, no quotes, no explanation.`;

type OpenRouterResponse = {
	choices: Array<{
		message: {
			content: string;
		};
	}>;
};

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
		const response = await tracedFetch("https://openrouter.ai/api/v1/chat/completions", {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				model: config.AI_MODEL,
				messages: [
					{ role: "system", content: TITLE_PROMPT },
					{ role: "user", content: `User: ${userMessage}\n\nAssistant: ${assistantResponse}` },
				],
				max_tokens: 20,
			}),
		});

		if (!response.ok) {
			const errorText = await response.text();
			log.error({ status: response.status, error: errorText }, "OpenRouter API error");
			throw new Error(`OpenRouter API error: ${response.status}`);
		}

		const data = (await response.json()) as OpenRouterResponse;
		const title = data.choices[0]?.message?.content?.trim();

		log.info({ title }, "generated conversation title");
		return title || null;
	} catch (error) {
		log.error({ error }, "failed to generate title");
		return null;
	}
}
