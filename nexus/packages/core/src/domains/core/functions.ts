import { config } from "../../infra/config";
import { modelRepository } from "./ai-registry";
import { settingsRepository } from "./repository";
import {
	type ModelOptionType,
	SETTING_KEYS,
	type SettingsResponseType,
	type SystemInfoType,
	type UpdateSettingsBodyType,
} from "./types";

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// === Model list ===

async function getAvailableModels(): Promise<ModelOptionType[]> {
	const models = await modelRepository.listEnabled();
	return models.map((m) => ({
		id: m.id, // Registry ID (e.g. "openrouter:deepseek/deepseek-v3.2")
		name: m.name,
		provider: m.providerId,
	}));
}

// === System info ===

function formatUptime(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);

	if (days > 0) return `${days}d ${hours % 24}h`;
	if (hours > 0) return `${hours}h ${minutes % 60}m`;
	if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
	return `${seconds}s`;
}

function getSystemInfo(): SystemInfoType {
	const uptime = Date.now() - serverStartTime;
	return {
		version: "1.0.0",
		environment: config.NODE_ENV,
		uptime,
		uptimeFormatted: formatUptime(uptime),
		apiUrl: `http://localhost:${config.PORT}`,
		k8sNamespace: config.K8S_NAMESPACE,
		k8sInCluster: config.K8S_IN_CLUSTER,
	};
}

// === Settings getters ===

export async function getSettings(): Promise<SettingsResponseType> {
	const allSettings = await settingsRepository.getAll();
	const availableModels = await getAvailableModels();

	// Get current model — fall back to first available if saved model no longer exists
	let aiModel = allSettings[SETTING_KEYS.AI_MODEL] ?? "";
	if (aiModel && !availableModels.some((m) => m.id === aiModel)) {
		aiModel = "";
	}
	if (!aiModel && availableModels.length > 0) {
		aiModel = availableModels[0].id;
	}

	return {
		// Agent settings
		aiModel,
		discordWebhookUrl: allSettings[SETTING_KEYS.DISCORD_WEBHOOK_URL] ?? null,
		availableModels,
		// Game server defaults
		mcDefaultMemory: allSettings[SETTING_KEYS.MC_DEFAULT_MEMORY] ?? config.MC_DEFAULT_MEMORY,
		mcDefaultStorage: allSettings[SETTING_KEYS.MC_DEFAULT_STORAGE] ?? config.MC_STORAGE_SIZE,
		// System info
		system: getSystemInfo(),
	};
}

export async function getAiModel(): Promise<string> {
	const saved = await settingsRepository.get(SETTING_KEYS.AI_MODEL);
	if (saved) {
		// Verify the saved model still exists in the registry
		const model = await modelRepository.get(saved);
		if (model) return saved;
	}
	// Fall back to the first enabled model
	const models = await modelRepository.listEnabled();
	if (models.length > 0) return models[0].id;
	throw new Error("No AI models configured");
}

export async function getDiscordWebhookUrl(): Promise<string | null> {
	return settingsRepository.get(SETTING_KEYS.DISCORD_WEBHOOK_URL);
}

// === Settings setters ===

export async function updateSettings(data: UpdateSettingsBodyType): Promise<SettingsResponseType> {
	if (data.aiModel !== undefined) {
		// Validate model exists in registry
		const model = await modelRepository.get(data.aiModel);
		if (!model) {
			throw new Error(`Invalid model: ${data.aiModel}`);
		}
		await settingsRepository.set(SETTING_KEYS.AI_MODEL, data.aiModel);
	}

	if (data.discordWebhookUrl !== undefined) {
		if (data.discordWebhookUrl === null) {
			await settingsRepository.delete(SETTING_KEYS.DISCORD_WEBHOOK_URL);
		} else {
			// Basic validation for Discord webhook URL (supports discord.com and canary.discord.com)
			const webhookPattern = /^https:\/\/(canary\.)?discord\.com\/api\/webhooks\//;
			if (!webhookPattern.test(data.discordWebhookUrl)) {
				throw new Error("Invalid Discord webhook URL");
			}
			await settingsRepository.set(SETTING_KEYS.DISCORD_WEBHOOK_URL, data.discordWebhookUrl);
		}
	}

	if (data.mcDefaultMemory !== undefined) {
		await settingsRepository.set(SETTING_KEYS.MC_DEFAULT_MEMORY, data.mcDefaultMemory);
	}

	if (data.mcDefaultStorage !== undefined) {
		await settingsRepository.set(SETTING_KEYS.MC_DEFAULT_STORAGE, data.mcDefaultStorage);
	}

	return getSettings();
}

// === Game server defaults getters (for use by game-servers domain) ===

export async function getMcDefaultMemory(): Promise<string> {
	const saved = await settingsRepository.get(SETTING_KEYS.MC_DEFAULT_MEMORY);
	return saved ?? config.MC_DEFAULT_MEMORY;
}

export async function getMcDefaultStorage(): Promise<string> {
	const saved = await settingsRepository.get(SETTING_KEYS.MC_DEFAULT_STORAGE);
	return saved ?? config.MC_STORAGE_SIZE;
}
