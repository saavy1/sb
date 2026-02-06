import { createFileRoute } from "@tanstack/react-router";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "../components/Chat";
import { client } from "../lib/api";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

// Thread type inferred from Eden Treaty
type AgentThread = NonNullable<
  Awaited<ReturnType<typeof client.api.agent.threads.get>>["data"]
>[number];

function ChatPage() {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const fetchThreads = useCallback(async () => {
    const { data } = await client.api.agent.threads.get({
      query: { source: "chat" },
    });
    if (Array.isArray(data)) {
      setThreads(data);
    }
  }, []);

  useEffect(() => {
    fetchThreads();
  }, [fetchThreads]);

  // Listen for real-time thread title updates
  useEvents("thread:updated", (payload) => {
    setThreads((prev) =>
      prev.map((t) =>
        t.id === payload.id ? { ...t, title: payload.title } : t,
      ),
    );
  });

  const handleNewChat = () => {
    setActiveId(null);
    setSidebarOpen(false);
  };

  const handleThreadChange = (id: string | null) => {
    setActiveId(id);
    setSidebarOpen(false);
    fetchThreads();
  };

  const handleThreadSelect = (id: string) => {
    setActiveId(id);
    setSidebarOpen(false);
  };

  // Generate a display name from thread
  const getThreadTitle = (thread: AgentThread) => {
    if (thread.title) {
      return thread.title;
    }
    const date = new Date(thread.createdAt);
    const dateStr = date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    if (thread.status === "sleeping") {
      return `Sleeping (${thread.wakeReason?.slice(0, 20) || dateStr})`;
    }
    return `Chat from ${dateStr}`;
  };

  return (
    <div className="flex h-[calc(100vh-3rem)]">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close sidebar"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setSidebarOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex-col border-r border-border bg-surface
          transition-transform duration-200 ease-in-out
          md:relative md:flex md:translate-x-0
          ${sidebarOpen ? "flex translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Spacer for TopNav on mobile */}
        <div className="h-12 shrink-0 md:hidden" />

        <div className="flex items-center justify-between border-b border-border p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-1 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-white transition-colors hover:bg-accent-hover"
          >
            <MessageSquarePlus size={16} />
            New Chat
          </button>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-2 rounded-lg p-2 text-text-tertiary hover:bg-surface-elevated hover:text-text-primary md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 space-y-1 overflow-y-auto p-2">
          {threads.length === 0 ? (
            <p className="py-4 text-center text-xs text-text-tertiary">
              No threads yet
            </p>
          ) : (
            threads.map((thread) => (
              <button
                type="button"
                key={thread.id}
                onClick={() => handleThreadSelect(thread.id)}
                className={`group flex w-full cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-left text-sm ${
                  activeId === thread.id
                    ? "bg-surface-elevated text-text-primary"
                    : "text-text-secondary hover:bg-surface-elevated hover:text-text-primary"
                }`}
              >
                <span className="flex-1 truncate">
                  {getThreadTitle(thread)}
                </span>
                {thread.status === "sleeping" && (
                  <span className="ml-2 rounded bg-warning-bg px-1.5 py-0.5 text-xs text-warning">
                    zzz
                  </span>
                )}
                {thread.messageCount > 0 && thread.status !== "sleeping" && (
                  <span className="ml-2 text-xs text-text-tertiary">
                    {thread.messageCount}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-border px-4 py-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="rounded-lg p-2 text-text-tertiary hover:bg-surface-elevated hover:text-text-primary md:hidden"
          >
            <Menu size={20} />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-text-primary">
              The Machine
            </h1>
            <p className="hidden text-xs text-text-tertiary sm:block">
              AI assistant for your homelab
            </p>
          </div>
        </header>

        <div className="flex-1 overflow-hidden">
          <Chat
            threadId={activeId ?? undefined}
            onThreadChange={handleThreadChange}
          />
        </div>
      </div>
    </div>
  );
}
