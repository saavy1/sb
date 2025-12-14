import { createFileRoute } from "@tanstack/react-router";
import { Panel, PanelRow } from "../components/ui";

export const Route = createFileRoute("/settings")({
	component: SettingsPage,
});

function SettingsPage() {
	const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";
	const wsUrl = apiUrl.replace(/^http/, "ws");

	return (
		<div className="space-y-4 max-w-xl">
			{/* Header Strip */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<span className="text-text-secondary uppercase tracking-wider">Settings</span>
				<span className="text-text-tertiary">System configuration</span>
			</div>

			{/* API Configuration */}
			<Panel title="API Configuration">
				<div className="space-y-1">
					<PanelRow label="API URL" value={apiUrl} mono />
					<PanelRow label="WebSocket URL" value={wsUrl} mono />
					<PanelRow label="Environment" value={import.meta.env.MODE} />
				</div>
			</Panel>

			{/* Keyboard Shortcuts */}
			<Panel title="Keyboard Shortcuts">
				<div className="space-y-1 text-sm">
					<ShortcutRow keys="⌘K" description="Open command palette" />
					<ShortcutRow keys="g h" description="Go to Dashboard" />
					<ShortcutRow keys="g s" description="Go to Servers" />
					<ShortcutRow keys="g ," description="Go to Settings" />
					<ShortcutRow keys="?" description="Show help" />
					<ShortcutRow keys="j / k" description="Navigate list (Servers)" />
					<ShortcutRow keys="r" description="Refresh" />
					<ShortcutRow keys="c" description="Create new server" />
					<ShortcutRow keys="esc" description="Cancel / Go back" />
				</div>
			</Panel>

			{/* About */}
			<Panel title="About">
				<div className="space-y-1">
					<PanelRow label="Version" value="1.0.0" />
					<PanelRow label="Dashboard" value="The Machine" />
					<PanelRow label="Stack" value="React + Vite + Tailwind" />
				</div>
			</Panel>
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
