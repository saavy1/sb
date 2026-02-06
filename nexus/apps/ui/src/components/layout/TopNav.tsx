import { Link, useNavigate } from "@tanstack/react-router";
import { Menu, Wifi, WifiOff, X } from "lucide-react";
import { useState } from "react";
import { useConnection } from "../../lib/ConnectionContext";
import { useHotkeys } from "../../lib/useHotkeys";

const navItems = [
  { to: "/", label: "Dashboard", key: "1" },
  { to: "/chat", label: "Chat", key: "2" },
  { to: "/apps", label: "Apps", key: "3" },
  { to: "/settings", label: "Settings", key: "4" },
] as const;

export function TopNav() {
  const { connected } = useConnection();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  useHotkeys({
    "g+h": () => navigate({ to: "/" }),
    "g+c": () => navigate({ to: "/chat" }),
    "g+a": () => navigate({ to: "/apps" }),
    "g+,": () => navigate({ to: "/settings" }),
  });

  return (
    <header className="bg-surface border-b border-border sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-12">
          <div className="flex items-center gap-6">
            <Link
              to="/"
              className="flex items-center gap-1.5 text-sm font-semibold group"
            >
              <pre className="text-[10px] leading-none text-accent group-hover:text-accent-hover transition-colors">
                {`┌─┐
│▪│
└─┘`}
              </pre>
              <span className="hidden sm:inline text-text-primary">
                the-machine
              </span>
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
                          isActive
                            ? "text-accent"
                            : "text-text-secondary hover:text-text-primary"
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
            {/* Mobile menu button */}
            <button
              type="button"
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-1.5 rounded text-text-secondary hover:text-text-primary hover:bg-surface-elevated md:hidden"
            >
              {menuOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile dropdown menu */}
      {menuOpen && (
        <nav className="md:hidden border-t border-border bg-surface">
          {navItems.map(({ to, label, key }) => (
            <Link
              key={to}
              to={to}
              className="block px-4 py-3 border-b border-border last:border-b-0"
              onClick={() => setMenuOpen(false)}
            >
              {({ isActive }) => (
                <span
                  className={`text-sm ${
                    isActive ? "text-accent" : "text-text-secondary"
                  }`}
                >
                  <span className="text-text-tertiary mr-2">{key}</span>
                  {label}
                </span>
              )}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
