import { t } from "elysia";

// === Setting keys ===
// These are the known settings that can be configured

export const SETTING_KEYS = {
  AI_MODEL: "ai_model",
  DISCORD_WEBHOOK_URL: "discord_webhook_url",
  MC_DEFAULT_MEMORY: "mc_default_memory",
  MC_DEFAULT_STORAGE: "mc_default_storage",
} as const;

// === Model options ===
// Curated list of models available via OpenRouter
// Can be extended via AI_MODELS env var (comma-separated)

export const DEFAULT_MODELS = [
  { id: "deepseek/deepseek-chat", name: "DeepSeek V3", provider: "DeepSeek" },
  { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2", provider: "DeepSeek" },
  {
    id: "anthropic/claude-sonnet-4.5",
    name: "Claude Sonnet 4.5",
    provider: "Anthropic",
  },
  {
    id: "anthropic/claude-haiku-4.5",
    name: "Claude Haiku 4.5",
    provider: "Anthropic",
  },
  {
    id: "google/gemini-2.5-flash-lite",
    name: "Gemini 2.5 Flash Lite",
    provider: "Google",
  },
  { id: "x-ai/grok-4.1-fast", name: "Grok 4.1 Fast", provider: "X.AI" },
  {
    id: "nvidia/nemotron-3-nano-30b-a3b:free",
    name: "Nemotron 3 Nano 30B A3B Free",
    provider: "NVIDIA",
  },
  {
    id: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
    name: "Nemotron Super 49B v1.5",
    provider: "NVIDIA",
  },
  {
    id: "qwen/qwen3.5-35b-a3b",
    name: "Qwen3.5-35B-A3B",
    provider: "Qwen",
  },
] as const;

// === API schemas ===

export const ModelOption = t.Object({
  id: t.String(),
  name: t.String(),
  provider: t.String(),
});

export const SystemInfo = t.Object({
  version: t.String(),
  environment: t.String(),
  uptime: t.Number(),
  uptimeFormatted: t.String(),
  apiUrl: t.String(),
  k8sNamespace: t.String(),
  k8sInCluster: t.Boolean(),
});

export const SettingsResponse = t.Object({
  // Agent settings
  aiModel: t.String(),
  discordWebhookUrl: t.Nullable(t.String()),
  availableModels: t.Array(ModelOption),
  // Game server defaults
  mcDefaultMemory: t.String(),
  mcDefaultStorage: t.String(),
  // System info (read-only)
  system: SystemInfo,
});

export const UpdateSettingsBody = t.Object({
  aiModel: t.Optional(t.String()),
  discordWebhookUrl: t.Optional(t.Nullable(t.String())),
  mcDefaultMemory: t.Optional(t.String()),
  mcDefaultStorage: t.Optional(t.String()),
});

export const ApiError = t.Object({
  error: t.String(),
});

// === TypeScript types ===

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS];
export type ModelOptionType = (typeof ModelOption)["static"];
export type SystemInfoType = (typeof SystemInfo)["static"];
export type SettingsResponseType = (typeof SettingsResponse)["static"];
export type UpdateSettingsBodyType = (typeof UpdateSettingsBody)["static"];
