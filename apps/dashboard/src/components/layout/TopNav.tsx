import { Link } from "@tanstack/react-router";
import { FileText, Home, Server, Settings } from "lucide-react";

const navItems = [
	{ to: "/", icon: Home, label: "Home" },
	{ to: "/servers", icon: Server, label: "Servers" },
	{ to: "/logs", icon: FileText, label: "Logs" },
	{ to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function TopNav() {
	return (
		<header className="bg-background border-b border-border sticky top-0 z-50">
			<div className="container mx-auto px-4">
				{/* Header row - always visible */}
				<div className="flex justify-between items-center py-3">
					<Link to="/" className="flex items-center gap-2 text-lg font-semibold">
						<span className="text-accent">⚡</span>
						<span>The Machine</span>
					</Link>
					<div className="text-xs text-text-tertiary">v1.0</div>
				</div>

				{/* Desktop navigation tabs - hidden on mobile */}
				<nav className="hidden md:flex items-center -mb-px">
					{navItems.map(({ to, icon: Icon, label }) => (
						<Link
							key={to}
							to={to}
							className="whitespace-nowrap py-2 group relative"
							activeProps={{ className: "whitespace-nowrap py-2 group relative" }}
						>
							{({ isActive }) => (
								<div
									className={`
										px-3 py-2 flex items-center rounded-md transition-colors
										${
											isActive
												? "text-text-primary"
												: "text-text-secondary hover:text-text-primary hover:bg-surface-elevated"
										}
									`}
								>
									<Icon size={18} className="mr-2" />
									<span className={isActive ? "font-medium" : ""}>{label}</span>
									{isActive && (
										<span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
									)}
								</div>
							)}
						</Link>
					))}
				</nav>
			</div>
		</header>
	);
}

export function BottomNav() {
	return (
		<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-background border-t border-border z-50 pb-safe">
			<div className="flex justify-around items-center">
				{navItems.map(({ to, icon: Icon, label }) => (
					<Link key={to} to={to} className="flex-1 py-3" activeProps={{ className: "flex-1 py-3" }}>
						{({ isActive }) => (
							<div className="flex flex-col items-center gap-1">
								<Icon size={22} className={isActive ? "text-accent" : "text-text-secondary"} />
								<span
									className={`text-xs ${isActive ? "text-accent font-medium" : "text-text-secondary"}`}
								>
									{label}
								</span>
							</div>
						)}
					</Link>
				))}
			</div>
		</nav>
	);
}
