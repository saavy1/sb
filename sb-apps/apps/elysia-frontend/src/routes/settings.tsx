import { createFileRoute } from "@tanstack/react-router";
import { PageHeader, Card, CardHeader, CardTitle, CardContent } from "../components/ui";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div>
      <PageHeader title="Settings" />

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>API Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--text-secondary)]">API URL</dt>
                <dd className="font-mono text-[var(--text-tertiary)]">
                  {import.meta.env.VITE_API_URL || "http://localhost:3000"}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
