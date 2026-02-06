import { Toaster } from "sonner";
import { CommandPalette, HelpModal } from "../ui";
import { TopNav } from "./TopNav";

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background font-mono">
      <CommandPalette />
      <HelpModal />
      <Toaster
        position="top-right"
        toastOptions={{
          className: "font-mono text-sm",
          style: {
            background: "var(--surface)",
            border: "1px solid var(--border)",
            color: "var(--text-primary)",
          },
        }}
      />
      <TopNav />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
