import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { client } from "../lib/api";
import { PageHeader, Card, CardHeader, CardContent, StatusDot, Badge } from "../components/ui";
import { Activity, Server, HardDrive, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: OverviewPage,
});

type HealthResponse = Awaited<ReturnType<typeof client.health.get>>["data"];
type ServersResponse = Awaited<ReturnType<typeof client.api.gameServers.get>>["data"];

function OverviewPage() {
  const [health, setHealth] = useState<HealthResponse>(null);
  const [servers, setServers] = useState<ServersResponse>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      client.health.get().then(({ data }) => setHealth(data)),
      client.api.gameServers.get().then(({ data }) => setServers(data)),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const runningCount = servers?.filter((s) => s.status === "running").length ?? 0;
  const totalCount = servers?.length ?? 0;

  return (
    <div>
      <PageHeader title="Overview" />

      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Activity size={16} />
              <span className="text-sm font-medium">API Status</span>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-[var(--text-tertiary)]">Checking...</p>
            ) : health ? (
              <div className="flex items-center gap-2">
                <StatusDot status="running" />
                <span className="text-lg font-medium">Healthy</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <StatusDot status="error" />
                <span className="text-lg font-medium text-[var(--error)]">Unreachable</span>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <Server size={16} />
              <span className="text-sm font-medium">Game Servers</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-semibold">{runningCount}</span>
              <span className="text-[var(--text-secondary)]">/ {totalCount} running</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2 text-[var(--text-secondary)]">
              <HardDrive size={16} />
              <span className="text-sm font-medium">Storage</span>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-[var(--text-tertiary)] text-sm">Coming soon</p>
          </CardContent>
        </Card>
      </div>

      {/* Game Servers List */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium">Game Servers</h2>
          <Link
            to="/servers"
            className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1"
          >
            View all <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <Card>
            <CardContent>
              <p className="text-[var(--text-tertiary)]">Loading...</p>
            </CardContent>
          </Card>
        ) : servers && servers.length > 0 ? (
          <div className="space-y-2">
            {servers.slice(0, 5).map((server) => (
              <Card key={server.id} interactive>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <StatusDot status={server.status as "running" | "stopped" | "starting" | "stopping" | "error"} />
                    <div>
                      <p className="font-medium">{server.name}</p>
                      <p className="text-sm text-[var(--text-secondary)]">
                        {server.modpack || "vanilla"}
                      </p>
                    </div>
                  </div>
                  <Badge status={server.status as "running" | "stopped" | "starting" | "stopping" | "error"}>
                    {server.status}
                  </Badge>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <Card>
            <CardContent>
              <p className="text-[var(--text-tertiary)]">No servers yet</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
