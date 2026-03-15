import type { SettingsResponseType } from "@nexus/core/domains/core";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Globe,
	Loader2,
	Plus,
	Power,
	Save,
	Server,
	Trash2,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge, Button, Input, Label, Panel, PanelRow } from "../components/ui";
import { client } from "../lib/api";

// === Types ===

type ConnectionTestResult = {
	ssh: { success: boolean; message: string };
} | null;

type AiProvider = {
	id: string;
	name: string;
	type: "openrouter" | "openai-compatible";
	baseUrl: string | null;
	hasApiKey: boolean;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

type AiModel = {
	id: string;
	providerId: string;
	modelId: string;
	name: string;
	enabled: boolean;
	createdAt: string;
	updatedAt: string;
};

// === Route ===

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

// === Main Page ===

function SettingsPage() {
	const [settings, setSettings] = useState<SettingsResponseType | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	// Connection test state
	const [connectionTest, setConnectionTest] = useState<ConnectionTestResult>(null);
	const [testingConnection, setTestingConnection] = useState(false);

	// Form state
	const [selectedModel, setSelectedModel] = useState("");
	const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
	const [mcDefaultMemory, setMcDefaultMemory] = useState("");
	const [mcDefaultStorage, setMcDefaultStorage] = useState("");
	const [hasChanges, setHasChanges] = useState(false);

	// AI registry state
	const [providers, setProviders] = useState<AiProvider[]>([]);
	const [models, setModels] = useState<AiModel[]>([]);

	const fetchSettings = useCallback(async () => {
		try {
			const { data } = await client.api.settings.get();
			if (data) {
				setSettings(data);
				setSelectedModel(data.aiModel);
				setDiscordWebhookUrl(data.discordWebhookUrl || "");
				setMcDefaultMemory(data.mcDefaultMemory);
				setMcDefaultStorage(data.mcDefaultStorage);
			}
		} catch (error) {
			console.error("Failed to fetch settings:", error);
			toast.error("Failed to load settings");
		} finally {
			setLoading(false);
		}
	}, []);

	const fetchAiRegistry = useCallback(async () => {
		try {
			const [providerRes, modelRes] = await Promise.all([
				client.api.ai.providers.get(),
				client.api.ai.models.get(),
			]);
			if (providerRes.data) setProviders(providerRes.data as AiProvider[]);
			if (modelRes.data) setModels(modelRes.data as AiModel[]);
		} catch (error) {
			console.error("Failed to fetch AI registry:", error);
		}
	}, []);

	useEffect(() => {
		fetchSettings();
		fetchAiRegistry();
	}, [fetchSettings, fetchAiRegistry]);

	// Track changes
	useEffect(() => {
		if (!settings) return;
		const modelChanged = selectedModel !== settings.aiModel;
		const webhookChanged = discordWebhookUrl !== (settings.discordWebhookUrl || "");
		const memoryChanged = mcDefaultMemory !== settings.mcDefaultMemory;
		const storageChanged = mcDefaultStorage !== settings.mcDefaultStorage;
		setHasChanges(modelChanged || webhookChanged || memoryChanged || storageChanged);
	}, [selectedModel, discordWebhookUrl, mcDefaultMemory, mcDefaultStorage, settings]);

	const handleSave = async () => {
		setSaving(true);
		try {
			const { data, error } = await client.api.settings.patch({
				aiModel: selectedModel,
				discordWebhookUrl: discordWebhookUrl.trim() || null,
				mcDefaultMemory: mcDefaultMemory.trim(),
				mcDefaultStorage: mcDefaultStorage.trim(),
			});

			if (error) {
				const errorValue = error.value;
				const errorMessage =
					errorValue && typeof errorValue === "object" && "error" in errorValue
						? String(errorValue.error)
						: "Failed to save settings";
				toast.error(errorMessage);
				return;
			}

			if (data) {
				setSettings(data);
				setHasChanges(false);
				toast.success("Settings saved");
			}
		} catch (error) {
			console.error("Failed to save settings:", error);
			toast.error("Failed to save settings");
		} finally {
			setSaving(false);
		}
	};

	const handleTestConnection = async () => {
		setTestingConnection(true);
		setConnectionTest(null);
		try {
			const { data, error } = await client.api.ops["test-connection"].get();
			if (error) {
				toast.error("Failed to test connection");
				return;
			}
			if (data) {
				setConnectionTest(data);
				if (data.ssh.success) {
					toast.success("Connection successful");
				} else {
					toast.error("Connection failed");
				}
			}
		} catch (error) {
			console.error("Failed to test connection:", error);
			toast.error("Failed to test connection");
		} finally {
			setTestingConnection(false);
		}
	};

	// Group models by provider for the selector
	const groupedModels = settings?.availableModels.reduce(
		(acc, model) => {
			if (!acc[model.provider]) acc[model.provider] = [];
			acc[model.provider].push(model);
			return acc;
		},
		{} as Record<string, typeof settings.availableModels>
	);

	return (
		<div className="container mx-auto max-w-2xl space-y-4 px-4 py-4">
			{/* Header Strip */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<span className="text-text-secondary uppercase tracking-wider">Settings</span>
				<div className="flex items-center gap-2">
					{hasChanges && <span className="text-warning text-xs">Unsaved changes</span>}
					<Button size="sm" onClick={handleSave} disabled={!hasChanges || saving}>
						{saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
						{saving ? "Saving..." : "Save"}
					</Button>
				</div>
			</div>

			{loading ? (
				<div className="text-center py-12 text-text-tertiary">Loading...</div>
			) : (
				<div className="space-y-4">
					{/* Agent Configuration */}
					<Panel title="Agent Configuration">
						<div className="space-y-4">
							<div>
								<Label className="block text-xs text-text-tertiary mb-2">AI Model</Label>
								<select
									value={selectedModel}
									onChange={(e) => setSelectedModel(e.target.value)}
									className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
								>
									{groupedModels &&
										Object.entries(groupedModels).map(([provider, models]) => (
											<optgroup key={provider} label={provider}>
												{models.map((model) => (
													<option key={model.id} value={model.id}>
														{model.name}
													</option>
												))}
											</optgroup>
										))}
								</select>
								<p className="text-xs text-text-tertiary mt-1">Model used by The Machine agent</p>
							</div>

							<div>
								<Label className="block text-xs text-text-tertiary mb-2">Discord Webhook URL</Label>
								<Input
									type="text"
									placeholder="https://discord.com/api/webhooks/..."
									value={discordWebhookUrl}
									onChange={(e) => setDiscordWebhookUrl(e.target.value)}
									className="font-mono text-xs"
								/>
								<p className="text-xs text-text-tertiary mt-1">Webhook for agent notifications</p>
							</div>
						</div>
					</Panel>

					{/* AI Providers */}
					<ProvidersPanel
						providers={providers}
						onRefresh={() => {
							fetchAiRegistry();
							fetchSettings();
						}}
					/>

					{/* AI Models */}
					<ModelsPanel
						providers={providers}
						models={models}
						onRefresh={() => {
							fetchAiRegistry();
							fetchSettings();
						}}
					/>

					{/* Game Server Defaults */}
					<Panel title="Game Server Defaults">
						<div className="grid grid-cols-2 gap-4">
							<div>
								<Label className="block text-xs text-text-tertiary mb-2">Default Memory</Label>
								<Input
									type="text"
									placeholder="8Gi"
									value={mcDefaultMemory}
									onChange={(e) => setMcDefaultMemory(e.target.value)}
									className="font-mono"
								/>
								<p className="text-xs text-text-tertiary mt-1">e.g., 4Gi, 8Gi</p>
							</div>

							<div>
								<Label className="block text-xs text-text-tertiary mb-2">Default Storage</Label>
								<Input
									type="text"
									placeholder="50Gi"
									value={mcDefaultStorage}
									onChange={(e) => setMcDefaultStorage(e.target.value)}
									className="font-mono"
								/>
								<p className="text-xs text-text-tertiary mt-1">e.g., 25Gi, 50Gi</p>
							</div>
						</div>
					</Panel>

					{/* Cluster Connection */}
					<Panel title="Cluster Connection">
						<div className="space-y-3">
							<Button
								size="sm"
								variant="secondary"
								onClick={handleTestConnection}
								disabled={testingConnection}
								className="w-full"
							>
								{testingConnection ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<Zap size={14} />
								)}
								{testingConnection ? "Testing..." : "Test Connection"}
							</Button>

							{connectionTest && (
								<div className="space-y-2 text-sm">
									<ConnectionRow
										label="SSH"
										success={connectionTest.ssh.success}
										message={connectionTest.ssh.message}
									/>
									<p className="text-text-tertiary text-xs">
										K8s access is via MCP server (auto-discovered)
									</p>
								</div>
							)}
						</div>
					</Panel>

					{/* System Info */}
					<Panel title="System">
						<div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
							<PanelRow label="Version" value={settings?.system.version ?? "-"} />
							<PanelRow label="Environment" value={settings?.system.environment ?? "-"} />
							<PanelRow label="Uptime" value={settings?.system.uptimeFormatted ?? "-"} />
							<PanelRow
								label="K8s"
								value={settings?.system.k8sInCluster ? "In-cluster" : "External"}
							/>
						</div>
					</Panel>
				</div>
			)}
		</div>
	);
}

// === Providers Panel ===

function ProvidersPanel({
	providers,
	onRefresh,
}: {
	providers: AiProvider[];
	onRefresh: () => void;
}) {
	const [showAdd, setShowAdd] = useState(false);
	const [adding, setAdding] = useState(false);
	const [form, setForm] = useState({
		id: "",
		name: "",
		type: "openai-compatible" as "openrouter" | "openai-compatible",
		baseUrl: "",
		apiKey: "",
	});

	const handleAdd = async () => {
		if (!form.id.trim() || !form.name.trim()) {
			toast.error("ID and name are required");
			return;
		}
		if (form.type === "openai-compatible" && !form.baseUrl.trim()) {
			toast.error("Base URL is required for OpenAI-compatible providers");
			return;
		}

		setAdding(true);
		try {
			const { error } = await client.api.ai.providers.post({
				id: form.id.trim(),
				name: form.name.trim(),
				type: form.type,
				baseUrl: form.type === "openai-compatible" ? form.baseUrl.trim() : null,
				apiKey: form.apiKey.trim() || null,
			});

			if (error) {
				const msg =
					error.value && typeof error.value === "object" && "error" in error.value
						? String(error.value.error)
						: "Failed to create provider";
				toast.error(msg);
				return;
			}

			toast.success(`Provider "${form.name}" created`);
			setForm({ id: "", name: "", type: "openai-compatible", baseUrl: "", apiKey: "" });
			setShowAdd(false);
			onRefresh();
		} catch {
			toast.error("Failed to create provider");
		} finally {
			setAdding(false);
		}
	};

	const handleToggle = async (provider: AiProvider) => {
		try {
			await client.api.ai.providers({ id: provider.id }).patch({
				enabled: !provider.enabled,
			});
			onRefresh();
		} catch {
			toast.error("Failed to update provider");
		}
	};

	const handleDelete = async (provider: AiProvider) => {
		try {
			await client.api.ai.providers({ id: provider.id }).delete();
			toast.success(`Provider "${provider.name}" deleted`);
			onRefresh();
		} catch {
			toast.error("Failed to delete provider");
		}
	};

	return (
		<Panel
			title="AI Providers"
			actions={
				<Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)}>
					<Plus size={12} />
					Add
				</Button>
			}
		>
			<div className="space-y-3">
				{/* Add form */}
				{showAdd && (
					<div className="border border-border rounded bg-background p-3 space-y-3">
						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label className="block text-xs text-text-tertiary mb-1">ID</Label>
								<Input
									placeholder="my-vllm"
									value={form.id}
									onChange={(e) => setForm({ ...form, id: e.target.value })}
									className="font-mono text-xs"
								/>
							</div>
							<div>
								<Label className="block text-xs text-text-tertiary mb-1">Name</Label>
								<Input
									placeholder="My vLLM Server"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									className="text-xs"
								/>
							</div>
						</div>

						<div>
							<Label className="block text-xs text-text-tertiary mb-1">Type</Label>
							<select
								value={form.type}
								onChange={(e) =>
									setForm({ ...form, type: e.target.value as "openrouter" | "openai-compatible" })
								}
								className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
							>
								<option value="openai-compatible">OpenAI-Compatible (vLLM, Ollama, etc.)</option>
								<option value="openrouter">OpenRouter</option>
							</select>
						</div>

						{form.type === "openai-compatible" && (
							<div>
								<Label className="block text-xs text-text-tertiary mb-1">Base URL</Label>
								<Input
									placeholder="http://spark:8000/v1"
									value={form.baseUrl}
									onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
									className="font-mono text-xs"
								/>
							</div>
						)}

						<div>
							<Label className="block text-xs text-text-tertiary mb-1">
								API Key <span className="text-text-tertiary">(optional)</span>
							</Label>
							<Input
								type="password"
								placeholder={form.type === "openrouter" ? "sk-or-..." : "Leave empty if not needed"}
								value={form.apiKey}
								onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
								className="font-mono text-xs"
							/>
							{form.type === "openrouter" && (
								<p className="text-xs text-text-tertiary mt-1">
									Falls back to OPENROUTER_API_KEY env var if empty
								</p>
							)}
						</div>

						<div className="flex justify-end gap-2">
							<Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
								Cancel
							</Button>
							<Button size="sm" onClick={handleAdd} disabled={adding}>
								{adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
								Create Provider
							</Button>
						</div>
					</div>
				)}

				{/* Provider list */}
				{providers.length === 0 ? (
					<p className="text-xs text-text-tertiary py-2">
						No providers configured. Add one to get started.
					</p>
				) : (
					<div className="space-y-1">
						{providers.map((provider) => (
							<div
								key={provider.id}
								className="flex items-center justify-between px-3 py-2 rounded border border-border bg-background group"
							>
								<div className="flex items-center gap-3 min-w-0">
									<div className="shrink-0">
										{provider.type === "openrouter" ? (
											<Globe size={14} className="text-text-tertiary" />
										) : (
											<Server size={14} className="text-text-tertiary" />
										)}
									</div>
									<div className="min-w-0">
										<div className="flex items-center gap-2">
											<span className="text-sm font-medium truncate">{provider.name}</span>
											<Badge variant={provider.enabled ? "success" : "default"}>
												{provider.enabled ? "active" : "disabled"}
											</Badge>
										</div>
										<div className="flex items-center gap-2 text-xs text-text-tertiary">
											<span className="font-mono">{provider.id}</span>
											{provider.baseUrl && (
												<>
													<span>&middot;</span>
													<span className="font-mono truncate">{provider.baseUrl}</span>
												</>
											)}
											{provider.hasApiKey && (
												<>
													<span>&middot;</span>
													<span>key set</span>
												</>
											)}
										</div>
									</div>
								</div>

								<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
									<Button
										size="icon-sm"
										variant="ghost"
										onClick={() => handleToggle(provider)}
										title={provider.enabled ? "Disable" : "Enable"}
									>
										<Power
											size={14}
											className={provider.enabled ? "text-success" : "text-text-tertiary"}
										/>
									</Button>
									<Button
										size="icon-sm"
										variant="ghost"
										onClick={() => handleDelete(provider)}
										title="Delete provider"
									>
										<Trash2 size={14} className="text-error" />
									</Button>
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</Panel>
	);
}

// === Models Panel ===

function ModelsPanel({
	providers,
	models,
	onRefresh,
}: {
	providers: AiProvider[];
	models: AiModel[];
	onRefresh: () => void;
}) {
	const [showAdd, setShowAdd] = useState(false);
	const [adding, setAdding] = useState(false);
	const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
	const [form, setForm] = useState({
		providerId: "",
		modelId: "",
		name: "",
	});

	// Group models by provider
	const modelsByProvider = models.reduce(
		(acc, model) => {
			if (!acc[model.providerId]) acc[model.providerId] = [];
			acc[model.providerId].push(model);
			return acc;
		},
		{} as Record<string, AiModel[]>
	);

	// Auto-expand providers that have models on initial load
	const [hasInitExpanded, setHasInitExpanded] = useState(false);
	useEffect(() => {
		if (!hasInitExpanded && models.length > 0) {
			const providerIds = new Set(models.map((m) => m.providerId));
			setExpandedProviders(providerIds);
			setHasInitExpanded(true);
		}
	}, [models, hasInitExpanded]);

	const toggleExpanded = (providerId: string) => {
		setExpandedProviders((prev) => {
			const next = new Set(prev);
			if (next.has(providerId)) next.delete(providerId);
			else next.add(providerId);
			return next;
		});
	};

	const handleAdd = async () => {
		if (!form.providerId || !form.modelId.trim() || !form.name.trim()) {
			toast.error("All fields are required");
			return;
		}

		setAdding(true);
		try {
			const { error } = await client.api.ai.models.post({
				providerId: form.providerId,
				modelId: form.modelId.trim(),
				name: form.name.trim(),
			});

			if (error) {
				const msg =
					error.value && typeof error.value === "object" && "error" in error.value
						? String(error.value.error)
						: "Failed to add model";
				toast.error(msg);
				return;
			}

			toast.success(`Model "${form.name}" added`);
			setForm({ providerId: "", modelId: "", name: "" });
			setShowAdd(false);
			onRefresh();
		} catch {
			toast.error("Failed to add model");
		} finally {
			setAdding(false);
		}
	};

	const handleToggle = async (model: AiModel) => {
		try {
			await client.api.ai.models({ id: model.id }).patch({
				enabled: !model.enabled,
			});
			onRefresh();
		} catch {
			toast.error("Failed to update model");
		}
	};

	const handleDelete = async (model: AiModel) => {
		try {
			await client.api.ai.models({ id: model.id }).delete();
			toast.success(`Model "${model.name}" removed`);
			onRefresh();
		} catch {
			toast.error("Failed to delete model");
		}
	};

	return (
		<Panel
			title="AI Models"
			actions={
				<Button size="sm" variant="ghost" onClick={() => setShowAdd(!showAdd)}>
					<Plus size={12} />
					Add
				</Button>
			}
		>
			<div className="space-y-3">
				{/* Add form */}
				{showAdd && (
					<div className="border border-border rounded bg-background p-3 space-y-3">
						<div>
							<Label className="block text-xs text-text-tertiary mb-1">Provider</Label>
							<select
								value={form.providerId}
								onChange={(e) => setForm({ ...form, providerId: e.target.value })}
								className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
							>
								<option value="">Select a provider...</option>
								{providers
									.filter((p) => p.enabled)
									.map((p) => (
										<option key={p.id} value={p.id}>
											{p.name}
										</option>
									))}
							</select>
						</div>

						<div className="grid grid-cols-2 gap-3">
							<div>
								<Label className="block text-xs text-text-tertiary mb-1">Model ID</Label>
								<Input
									placeholder="deepseek/deepseek-chat"
									value={form.modelId}
									onChange={(e) => setForm({ ...form, modelId: e.target.value })}
									className="font-mono text-xs"
								/>
								<p className="text-xs text-text-tertiary mt-1">ID sent to the provider API</p>
							</div>
							<div>
								<Label className="block text-xs text-text-tertiary mb-1">Display Name</Label>
								<Input
									placeholder="DeepSeek V3"
									value={form.name}
									onChange={(e) => setForm({ ...form, name: e.target.value })}
									className="text-xs"
								/>
							</div>
						</div>

						<div className="flex justify-end gap-2">
							<Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>
								Cancel
							</Button>
							<Button size="sm" onClick={handleAdd} disabled={adding}>
								{adding ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
								Add Model
							</Button>
						</div>
					</div>
				)}

				{/* Models grouped by provider */}
				{providers.length === 0 ? (
					<p className="text-xs text-text-tertiary py-2">
						Add a provider first, then add models to it.
					</p>
				) : (
					<div className="space-y-2">
						{providers.map((provider) => {
							const providerModels = modelsByProvider[provider.id] || [];
							const isExpanded = expandedProviders.has(provider.id);

							return (
								<div key={provider.id} className="border border-border rounded overflow-hidden">
									{/* Provider header */}
									<button
										type="button"
										onClick={() => toggleExpanded(provider.id)}
										className="w-full flex items-center justify-between px-3 py-2 bg-surface-hover/30 hover:bg-surface-hover/50 transition-colors text-left"
									>
										<div className="flex items-center gap-2">
											{isExpanded ? (
												<ChevronDown size={12} className="text-text-tertiary" />
											) : (
												<ChevronRight size={12} className="text-text-tertiary" />
											)}
											<span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
												{provider.name}
											</span>
											<span className="text-xs text-text-tertiary">
												{providerModels.length} model{providerModels.length !== 1 ? "s" : ""}
											</span>
										</div>
										{!provider.enabled && <Badge variant="default">disabled</Badge>}
									</button>

									{/* Model list */}
									{isExpanded && (
										<div className="border-t border-border">
											{providerModels.length === 0 ? (
												<p className="text-xs text-text-tertiary px-3 py-2">No models added yet.</p>
											) : (
												providerModels.map((model, i) => (
													<div
														key={model.id}
														className={`flex items-center justify-between px-3 py-1.5 group ${
															i > 0 ? "border-t border-border/50" : ""
														}`}
													>
														<div className="min-w-0">
															<div className="flex items-center gap-2">
																<span
																	className={`text-sm ${model.enabled ? "text-text-primary" : "text-text-tertiary"}`}
																>
																	{model.name}
																</span>
																{!model.enabled && <Badge variant="default">disabled</Badge>}
															</div>
															<span className="text-xs text-text-tertiary font-mono">
																{model.modelId}
															</span>
														</div>

														<div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
															<Button
																size="icon-sm"
																variant="ghost"
																onClick={() => handleToggle(model)}
																title={model.enabled ? "Disable" : "Enable"}
															>
																<Power
																	size={14}
																	className={model.enabled ? "text-success" : "text-text-tertiary"}
																/>
															</Button>
															<Button
																size="icon-sm"
																variant="ghost"
																onClick={() => handleDelete(model)}
																title="Remove model"
															>
																<Trash2 size={14} className="text-error" />
															</Button>
														</div>
													</div>
												))
											)}
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</Panel>
	);
}

// === Connection Row ===

function ConnectionRow({
	label,
	success,
	message,
}: {
	label: string;
	success: boolean;
	message: string;
}) {
	return (
		<div className="flex items-start gap-2">
			{success ? (
				<CheckCircle size={16} className="text-success mt-0.5 shrink-0" />
			) : (
				<XCircle size={16} className="text-error mt-0.5 shrink-0" />
			)}
			<div className="min-w-0">
				<span className="font-medium">{label}</span>
				<p className="text-xs text-text-tertiary truncate">{message}</p>
			</div>
		</div>
	);
}
