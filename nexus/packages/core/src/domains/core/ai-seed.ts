import logger from "@nexus/logger";
import { config } from "../../infra/config";
import { modelRepository, providerRepository } from "./ai-registry";
import { DEFAULT_LOCAL_MODELS, DEFAULT_MODELS } from "./types";

const log = logger.child({ module: "ai-seed" });

/**
 * Seeds the AI provider and model registry on first run.
 * Skips if providers already exist (idempotent).
 */
export async function seedAiRegistry(): Promise<void> {
	const existing = await providerRepository.list();
	if (existing.length > 0) {
		log.debug("AI registry already seeded, skipping");
		return;
	}

	log.info("Seeding AI provider and model registry...");

	// Seed OpenRouter provider
	if (config.OPENROUTER_API_KEY) {
		await providerRepository.create({
			id: "openrouter",
			name: "OpenRouter",
			type: "openrouter",
			baseUrl: null,
			apiKey: null, // Uses OPENROUTER_API_KEY env var
		});

		for (const m of DEFAULT_MODELS) {
			await modelRepository.create({
				id: `openrouter:${m.id}`,
				providerId: "openrouter",
				modelId: m.id,
				name: `${m.name} (${m.provider})`,
			});
		}

		log.info({ count: DEFAULT_MODELS.length }, "Seeded OpenRouter models");
	}

	// Seed local vLLM provider if configured
	if (config.AI_LOCAL_URL) {
		await providerRepository.create({
			id: "local-vllm",
			name: "Local vLLM",
			type: "openai-compatible",
			baseUrl: config.AI_LOCAL_URL,
			apiKey: config.AI_LOCAL_API_KEY === "not-needed" ? null : config.AI_LOCAL_API_KEY,
		});

		for (const m of DEFAULT_LOCAL_MODELS) {
			await modelRepository.create({
				id: `local-vllm:${m.id}`,
				providerId: "local-vllm",
				modelId: m.id,
				name: m.name,
			});
		}

		log.info({ count: DEFAULT_LOCAL_MODELS.length }, "Seeded local vLLM models");
	}

	// Seed extra models from AI_MODELS env var
	if (config.AI_MODELS) {
		const extras = config.AI_MODELS.split(",");
		for (const entry of extras) {
			const [id, name, provider] = entry.split(":");
			const trimmedId = id.trim();
			const trimmedName = name?.trim() || trimmedId;
			const trimmedProvider = provider?.trim() || "Custom";

			// Assume extra models go to OpenRouter unless local provider is configured
			const providerId = config.OPENROUTER_API_KEY ? "openrouter" : "local-vllm";
			const providerExists = await providerRepository.get(providerId);
			if (providerExists) {
				await modelRepository.create({
					id: `${providerId}:${trimmedId}`,
					providerId,
					modelId: trimmedId,
					name: `${trimmedName} (${trimmedProvider})`,
				});
			}
		}
		log.info("Seeded extra models from AI_MODELS env var");
	}

	log.info("AI registry seeding complete");
}
