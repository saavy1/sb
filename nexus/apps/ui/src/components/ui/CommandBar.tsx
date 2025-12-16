import { useLocation, useNavigate } from "@tanstack/react-router";

interface Shortcut {
	keys: string;
	label: string;
	action?: () => void;
}

export function CommandBar() {
	const location = useLocation();
	const navigate = useNavigate();

	const globalShortcuts: Shortcut[] = [
		{ keys: "⌘K", label: "Command" },
		{ keys: "g h", label: "Home", action: () => navigate({ to: "/" }) },
		{ keys: "g s", label: "Servers", action: () => navigate({ to: "/servers" }) },
		{ keys: "?", label: "Help" },
	];

	const contextShortcuts: Shortcut[] = getContextShortcuts(location.pathname, navigate);

	return (
		<footer className="hidden md:block fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-40 font-mono">
			<div className="flex items-center justify-between px-4 py-1.5 text-xs">
				<div className="flex items-center gap-1">
					{contextShortcuts.map((shortcut) => (
						<ShortcutHint key={shortcut.keys} {...shortcut} />
					))}
				</div>
				<div className="flex items-center gap-1">
					{globalShortcuts.map((shortcut) => (
						<ShortcutHint key={shortcut.keys} {...shortcut} />
					))}
				</div>
			</div>
		</footer>
	);
}

function ShortcutHint({ keys, label, action }: Shortcut) {
	return (
		<button
			type="button"
			onClick={action}
			disabled={!action}
			className="flex items-center gap-1.5 px-2 py-1 rounded hover:bg-surface-elevated disabled:hover:bg-transparent transition-colors"
		>
			<kbd className="text-accent bg-background px-1.5 py-0.5 rounded text-[10px] font-semibold min-w-[1.5rem] text-center">
				{keys}
			</kbd>
			<span className="text-text-secondary">{label}</span>
		</button>
	);
}

function getContextShortcuts(
	pathname: string,
	navigate: ReturnType<typeof useNavigate>
): Shortcut[] {
	if (pathname === "/") {
		return [
			{ keys: "c", label: "Create", action: () => navigate({ to: "/servers/new" }) },
			{ keys: "r", label: "Refresh" },
		];
	}
	if (pathname === "/servers") {
		return [
			{ keys: "c", label: "Create", action: () => navigate({ to: "/servers/new" }) },
			{ keys: "j/k", label: "Navigate" },
			{ keys: "r", label: "Refresh" },
		];
	}
	if (pathname.startsWith("/servers/")) {
		return [{ keys: "esc", label: "Back", action: () => navigate({ to: "/servers" }) }];
	}
	return [];
}
