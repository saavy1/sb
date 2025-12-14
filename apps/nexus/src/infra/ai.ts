import { config } from "./config";

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
	if (!config.OPENROUTER_API_KEY) {
		return null;
	}

	try {
		const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
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
			throw new Error(`OpenRouter API error: ${response.status}`);
		}

		const data = (await response.json()) as OpenRouterResponse;
		const title = data.choices[0]?.message?.content?.trim();
		return title || null;
	} catch (error) {
		console.error("Failed to generate title:", error);
		return null;
	}
}
