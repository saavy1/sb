import { useLocation } from "@tanstack/react-router";
import { Toaster } from "sonner";
import { CommandPalette, HelpModal } from "../ui";
import { TopNav } from "./TopNav";

interface LayoutProps {
  children: React.ReactNode;
}

// Routes that need full-width layout without container padding
const fullWidthRoutes = ["/chat"];

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const isFullWidth = fullWidthRoutes.some((route) =>
    location.pathname.startsWith(route),
  );

  return (
    <div className="min-h-screen bg-background font-mono">
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
      <main className={isFullWidth ? "" : "container mx-auto px-4 py-4"}>
        {children}
      </main>
    </div>
  );
}
