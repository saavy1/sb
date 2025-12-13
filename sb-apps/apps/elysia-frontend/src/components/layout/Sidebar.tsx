import { Link } from "@tanstack/react-router";
import { Home, Server, HardDrive, FileText, Settings } from "lucide-react";

const navItems = [
  { to: "/", icon: Home, label: "Overview" },
  { to: "/servers", icon: Server, label: "Servers" },
  { to: "/storage", icon: HardDrive, label: "Storage" },
  { to: "/logs", icon: FileText, label: "Logs" },
  { to: "/settings", icon: Settings, label: "Settings" },
] as const;

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 h-full w-60 bg-[var(--background)] border-r border-[var(--border)] flex flex-col p-6">
      <div className="mb-8">
        <Link to="/" className="flex items-center gap-2 text-xl font-semibold">
          <span className="text-[var(--accent)]">⚡</span>
          The Machine
        </Link>
      </div>

      <nav className="flex-1 space-y-1">
        {navItems.map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] transition-colors"
            activeProps={{
              className: "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium bg-[var(--surface)] text-[var(--text-primary)]",
            }}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>

      <div className="pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--text-tertiary)]">The Machine v1.0</p>
      </div>
    </aside>
  );
}
