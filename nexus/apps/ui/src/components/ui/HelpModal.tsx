import { useEffect, useState } from "react";

const shortcuts = [
	{
		category: "Navigation",
		items: [
			{ keys: "⌘K", description: "Command palette" },
			{ keys: "g h", description: "Go to Dashboard" },
			{ keys: "g s", description: "Go to Servers" },
			{ keys: "g ,", description: "Go to Settings" },
		],
	},
	{
		category: "Actions",
		items: [
			{ keys: "c", description: "Create new server" },
			{ keys: "r", description: "Refresh data" },
			{ keys: "j / k", description: "Navigate list up/down" },
			{ keys: "↵", description: "Select / Confirm" },
		],
	},
	{
		category: "General",
		items: [
			{ keys: "?", description: "Show this help" },
			{ keys: "esc", description: "Close / Cancel / Go back" },
		],
	},
];

export function HelpModal() {
	const [open, setOpen] = useState(false);

	useEffect(() => {
		const isEditable = (el: Element | null) =>
			el?.tagName === "INPUT" ||
			el?.tagName === "TEXTAREA" ||
			el?.tagName === "SELECT" ||
			el?.getAttribute("contenteditable") === "true";

		const handler = (e: KeyboardEvent) => {
			if (e.key === "?" && !e.metaKey && !e.ctrlKey && !isEditable(document.activeElement)) {
				e.preventDefault();
				setOpen((o) => !o);
			}
			if (e.key === "Escape") {
				setOpen(false);
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, []);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center">
			<button
				type="button"
				className="fixed inset-0 bg-black/60"
				onClick={() => setOpen(false)}
				aria-label="Close help"
			/>
			<div className="relative bg-surface border border-border rounded-lg shadow-2xl max-w-md w-full mx-4 font-mono">
				<header className="flex items-center justify-between px-4 py-3 border-b border-border">
					<h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
					<button
						type="button"
						onClick={() => setOpen(false)}
						className="text-text-tertiary hover:text-text-primary"
					>
						<kbd className="bg-background px-1.5 py-0.5 rounded text-[10px]">esc</kbd>
					</button>
				</header>
				<div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
					{shortcuts.map((group) => (
						<div key={group.category}>
							<h3 className="text-xs text-text-tertiary uppercase tracking-wider mb-2">
								{group.category}
							</h3>
							<div className="space-y-1">
								{group.items.map((item) => (
									<div key={item.keys} className="flex items-center justify-between py-1">
										<span className="text-sm text-text-secondary">{item.description}</span>
										<kbd className="bg-background px-2 py-0.5 rounded text-xs text-accent">
											{item.keys}
										</kbd>
									</div>
								))}
							</div>
						</div>
					))}
				</div>
				<footer className="px-4 py-2 border-t border-border text-xs text-text-tertiary">
					Press <kbd className="bg-background px-1 py-0.5 rounded">?</kbd> to toggle this help
				</footer>
			</div>
		</div>
	);
}
