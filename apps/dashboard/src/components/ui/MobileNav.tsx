import { Link, useLocation } from "@tanstack/react-router";
import { Home, Plus, Server, Settings } from "lucide-react";

const navItems = [
	{ to: "/", icon: Home, label: "Home" },
	{ to: "/servers", icon: Server, label: "Servers" },
	{ to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function MobileNav() {
	const location = useLocation();

	return (
		<nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-border z-50 pb-safe">
			<div className="grid grid-cols-4 items-center">
				{navItems.map(({ to, icon: Icon, label }) => {
					const isActive =
						location.pathname === to || (to !== "/" && location.pathname.startsWith(to));
					return (
						<Link key={to} to={to} className="flex flex-col items-center gap-0.5 py-3 px-2">
							<Icon size={20} className={isActive ? "text-accent" : "text-text-tertiary"} />
							<span
								className={`text-[10px] ${
									isActive ? "text-accent font-medium" : "text-text-tertiary"
								}`}
							>
								{label}
							</span>
						</Link>
					);
				})}
				{/* Quick action - Create Server */}
				<Link to="/servers/new" className="flex flex-col items-center gap-0.5 py-3 px-2">
					<div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center">
						<Plus size={18} className="text-white" />
					</div>
					<span className="text-[10px] text-text-tertiary">New</span>
				</Link>
			</div>
		</nav>
	);
}
