import { Link, useNavigate } from "@tanstack/react-router";
import { Wifi, WifiOff } from "lucide-react";
import { useConnection } from "../../lib/ConnectionContext";
import { useHotkeys } from "../../lib/useHotkeys";

const navItems = [
	{ to: "/", label: "Dashboard", key: "1" },
	{ to: "/servers", label: "Servers", key: "2" },
	{ to: "/settings", label: "Settings", key: "3" },
] as const;

export function TopNav() {
	const { connected } = useConnection();
	const navigate = useNavigate();

	useHotkeys({
		"g+h": () => navigate({ to: "/" }),
		"g+s": () => navigate({ to: "/servers" }),
		"g+,": () => navigate({ to: "/settings" }),
	});

	return (
		<header className="bg-surface border-b border-border sticky top-0 z-50">
			<div className="container mx-auto px-4">
				<div className="flex justify-between items-center h-12">
					<div className="flex items-center gap-6">
						<Link to="/" className="flex items-center gap-1.5 text-sm font-semibold group">
							<pre className="text-[10px] leading-none text-accent group-hover:text-accent-hover transition-colors">
								{`┌─┐
│▪│
└─┘`}
							</pre>
							<span className="hidden sm:inline text-text-primary">the-machine</span>
						</Link>

						<nav className="hidden md:flex items-center">
							{navItems.map(({ to, label, key }) => (
								<Link
									key={to}
									to={to}
									className="relative px-3 py-1"
									activeProps={{ className: "relative px-3 py-1" }}
								>
									{({ isActive }) => (
										<>
											<span
												className={`text-sm transition-colors ${
													isActive ? "text-accent" : "text-text-secondary hover:text-text-primary"
												}`}
											>
												<span className="text-text-tertiary mr-1">{key}</span>
												{label}
											</span>
											{isActive && (
												<span className="absolute bottom-0 left-2 right-2 h-px bg-accent" />
											)}
										</>
									)}
								</Link>
							))}
						</nav>
					</div>

					<div className="flex items-center gap-4 text-xs text-text-tertiary">
						<span className="hidden sm:inline">v1.0.0</span>
						<div className="flex items-center gap-1">
							{connected ? (
								<>
									<Wifi size={12} className="text-success" />
									<span className="text-success">live</span>
								</>
							) : (
								<>
									<WifiOff size={12} />
									<span>offline</span>
								</>
							)}
						</div>
					</div>
				</div>
			</div>
		</header>
	);
}
