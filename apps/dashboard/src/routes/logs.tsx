import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, PageHeader } from "../components/ui";

export const Route = createFileRoute("/logs")({
	component: LogsPage,
});

function LogsPage() {
	return (
		<div>
			<PageHeader title="Logs" description="View logs from K8s pods and services" />

			<Card>
				<CardContent>
					<div className="font-mono text-sm text-text-secondary p-4 bg-background rounded border border-border">
						<p className="text-text-tertiary">Log viewer coming soon...</p>
						<p className="text-text-tertiary">Select a service to view logs</p>
					</div>
				</CardContent>
			</Card>
		</div>
	);
}
