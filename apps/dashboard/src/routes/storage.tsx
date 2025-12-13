import { createFileRoute } from "@tanstack/react-router";
import { HardDrive } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, PageHeader } from "../components/ui";

export const Route = createFileRoute("/storage")({
	component: StoragePage,
});

function StoragePage() {
	return (
		<div>
			<PageHeader title="Storage" description="ZFS pool status and snapshots" />

			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex items-center gap-3">
							<HardDrive className="text-[var(--text-secondary)]" size={20} />
							<CardTitle>ZFS Pool: tank</CardTitle>
						</div>
					</CardHeader>
					<CardContent>
						<p className="text-[var(--text-secondary)] text-sm">
							Storage monitoring coming soon...
						</p>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}
