import { BottomNav, TopNav } from "./TopNav";

interface LayoutProps {
	children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
	return (
		<div className="min-h-screen bg-background">
			<TopNav />
			<main className="container mx-auto px-4 py-6 pb-24 md:pb-6">{children}</main>
			<BottomNav />
		</div>
	);
}
