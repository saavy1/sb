import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card, CardContent } from "../components/ui";

export const Route = createFileRoute("/logs")({
  component: LogsPage,
});

function LogsPage() {
  return (
    <div>
      <PageHeader
        title="Logs"
        description="View logs from K8s pods and services"
      />

      <Card>
        <CardContent>
          <div className="font-mono text-sm text-[var(--text-secondary)] p-4 bg-[var(--background)] rounded border border-[var(--border)]">
            <p className="text-[var(--text-tertiary)]">Log viewer coming soon...</p>
            <p className="text-[var(--text-tertiary)]">Select a service to view logs</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
