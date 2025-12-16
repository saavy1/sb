import type { SettingsResponseType } from "@nexus/domains/core/types";
import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle,
	ChevronDown,
	ChevronRight,
	Loader2,
	Save,
	Wrench,
	XCircle,
	Zap,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label, Panel, PanelRow } from "../components/ui";
import { client } from "../lib/api";

// Tool info type (matches server)
type ToolInfo = {
	name: string;
	description: string;
	category: string;
	parameters?: Record<string, { type: string; description?: string; required?: boolean }>;
};

type ConnectionTestResult = {
	ssh: { success: boolean; message: string };
	kubectl: { success: boolean; message: string };
	flux: { success: boolean; message: string };
} | null;

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

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

	// Tools state
	const [toolsGrouped, setToolsGrouped] = useState<Record<string, ToolInfo[]>>({});
	const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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

	const fetchTools = useCallback(async () => {
		try {
			const { data } = await client.api.agent.tools.grouped.get();
			if (data) {
				setToolsGrouped(data as Record<string, ToolInfo[]>);
			}
		} catch (error) {
			console.error("Failed to fetch tools:", error);
		}
	}, []);

	const toggleCategory = (category: string) => {
		setExpandedCategories((prev) => {
			const next = new Set(prev);
			if (next.has(category)) {
				next.delete(category);
			} else {
				next.add(category);
			}
			return next;
		});
	};

	useEffect(() => {
		fetchSettings();
		fetchTools();
	}, [fetchSettings, fetchTools]);

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
				const allSuccess = data.ssh.success && data.kubectl.success && data.flux.success;
				if (allSuccess) {
					toast.success("All connections successful");
				} else {
					toast.error("Some connections failed");
				}
			}
		} catch (error) {
			console.error("Failed to test connection:", error);
			toast.error("Failed to test connection");
		} finally {
			setTestingConnection(false);
		}
	};

	// Group models by provider
	const groupedModels = settings?.availableModels.reduce(
		(acc, model) => {
			if (!acc[model.provider]) acc[model.provider] = [];
			acc[model.provider].push(model);
			return acc;
		},
		{} as Record<string, typeof settings.availableModels>
	);

	return (
		<div className="space-y-4">
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
				<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
					{/* Agent Configuration - full width */}
					<Panel title="Agent Configuration" className="lg:col-span-2">
						<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

					{/* System Information */}
					<Panel title="System Information">
						<div className="space-y-1">
							<PanelRow label="Version" value={settings?.system.version ?? "-"} />
							<PanelRow label="Environment" value={settings?.system.environment ?? "-"} />
							<PanelRow label="Uptime" value={settings?.system.uptimeFormatted ?? "-"} />
							<PanelRow label="API URL" value={settings?.system.apiUrl ?? "-"} mono />
							<PanelRow label="K8s Namespace" value={settings?.system.k8sNamespace ?? "-"} mono />
							<PanelRow
								label="K8s In-Cluster"
								value={settings?.system.k8sInCluster ? "Yes" : "No"}
							/>
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
									<ConnectionRow
										label="kubectl"
										success={connectionTest.kubectl.success}
										message={connectionTest.kubectl.message}
									/>
									<ConnectionRow
										label="flux"
										success={connectionTest.flux.success}
										message={connectionTest.flux.message}
									/>
								</div>
							)}
						</div>
					</Panel>

					{/* Keyboard Shortcuts */}
					<Panel title="Keyboard Shortcuts">
						<div className="space-y-1 text-sm">
							<ShortcutRow keys="⌘K" description="Command palette" />
							<ShortcutRow keys="g h" description="Go to Dashboard" />
							<ShortcutRow keys="g s" description="Go to Servers" />
							<ShortcutRow keys="g ," description="Go to Settings" />
							<ShortcutRow keys="?" description="Show help" />
							<ShortcutRow keys="j / k" description="Navigate list" />
							<ShortcutRow keys="r" description="Refresh" />
							<ShortcutRow keys="c" description="Create new" />
						</div>
					</Panel>

					{/* Agent Tools */}
					<Panel title={`Agent Tools (${Object.values(toolsGrouped).flat().length})`}>
						{Object.keys(toolsGrouped).length > 0 ? (
							<div className="space-y-1.5 max-h-64 overflow-y-auto">
								{Object.entries(toolsGrouped).map(([category, tools]) => (
									<div key={category} className="border border-border rounded overflow-hidden">
										<button
											type="button"
											onClick={() => toggleCategory(category)}
											className="w-full flex items-center justify-between px-2 py-1.5 bg-surface-elevated/50 hover:bg-surface-elevated transition-colors text-left"
										>
											<div className="flex items-center gap-1.5">
												<Wrench size={10} className="text-text-tertiary" />
												<span className="text-xs font-medium">{category}</span>
												<span className="text-xs text-text-tertiary">({tools.length})</span>
											</div>
											{expandedCategories.has(category) ? (
												<ChevronDown size={12} className="text-text-tertiary" />
											) : (
												<ChevronRight size={12} className="text-text-tertiary" />
											)}
										</button>
										{expandedCategories.has(category) && (
											<div className="divide-y divide-border">
												{tools.map((tool) => (
													<div key={tool.name} className="px-2 py-1.5">
														<code className="text-xs text-accent font-mono">{tool.name}</code>
														<p className="text-xs text-text-tertiary mt-0.5 leading-tight">
															{tool.description}
														</p>
													</div>
												))}
											</div>
										)}
									</div>
								))}
							</div>
						) : (
							<div className="text-center py-4 text-text-tertiary text-xs">Loading tools...</div>
						)}
					</Panel>

					{/* About */}
					<Panel title="About">
						<div className="space-y-1">
							<PanelRow label="Dashboard" value="Superbloom" />
							<PanelRow label="Stack" value="React + Vite + Tailwind" />
						</div>
					</Panel>
				</div>
			)}
		</div>
	);
}

function ShortcutRow({ keys, description }: { keys: string; description: string }) {
	return (
		<div className="flex items-center justify-between py-1">
			<span className="text-text-tertiary">{description}</span>
			<kbd className="bg-background px-2 py-0.5 rounded text-xs text-accent font-mono">{keys}</kbd>
		</div>
	);
}

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
