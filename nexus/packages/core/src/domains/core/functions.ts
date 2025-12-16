import { config } from "../../infra/config";
import { settingsRepository } from "./repository";
import {
	DEFAULT_MODELS,
	type ModelOptionType,
	SETTING_KEYS,
	type SettingsResponseType,
	type SystemInfoType,
	type UpdateSettingsBodyType,
} from "./types";

// Track server start time for uptime calculation
const serverStartTime = Date.now();

// === Model list ===

function getAvailableModels(): ModelOptionType[] {
	const envModels = config.AI_MODELS;

	if (!envModels) {
		return [...DEFAULT_MODELS];
	}

	// Parse additional models from env var (format: "id:name:provider,id:name:provider")
	const extraModels = envModels.split(",").map((m) => {
		const [id, name, provider] = m.split(":");
		return { id: id.trim(), name: name?.trim() || id, provider: provider?.trim() || "Custom" };
	});

	return [...DEFAULT_MODELS, ...extraModels];
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

	return {
		// Agent settings
		aiModel: allSettings[SETTING_KEYS.AI_MODEL] ?? config.AI_MODEL,
		discordWebhookUrl: allSettings[SETTING_KEYS.DISCORD_WEBHOOK_URL] ?? null,
		availableModels: getAvailableModels(),
		// Game server defaults
		mcDefaultMemory: allSettings[SETTING_KEYS.MC_DEFAULT_MEMORY] ?? config.MC_DEFAULT_MEMORY,
		mcDefaultStorage: allSettings[SETTING_KEYS.MC_DEFAULT_STORAGE] ?? config.MC_STORAGE_SIZE,
		// System info
		system: getSystemInfo(),
	};
}

export async function getAiModel(): Promise<string> {
	const saved = await settingsRepository.get(SETTING_KEYS.AI_MODEL);
	return saved ?? config.AI_MODEL;
}

export async function getDiscordWebhookUrl(): Promise<string | null> {
	return settingsRepository.get(SETTING_KEYS.DISCORD_WEBHOOK_URL);
}

// === Settings setters ===

export async function updateSettings(data: UpdateSettingsBodyType): Promise<SettingsResponseType> {
	if (data.aiModel !== undefined) {
		// Validate model is in available list
		const available = getAvailableModels();
		if (!available.some((m) => m.id === data.aiModel)) {
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
