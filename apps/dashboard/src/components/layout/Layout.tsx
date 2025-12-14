import { Toaster } from "sonner";
import { CommandBar, CommandPalette, HelpModal, MobileNav } from "../ui";
import { TopNav } from "./TopNav";

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
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
			<main className="container mx-auto px-4 py-4 pb-24 md:pb-12">{children}</main>
			<CommandBar />
			<MobileNav />
		</div>
	);
}
