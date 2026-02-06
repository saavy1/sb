import { createFileRoute } from "@tanstack/react-router";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { ChatView } from "../components/chat";
import { ScrollArea } from "../components/ui/scroll-area";
import { client } from "../lib/api";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

type AgentThread = NonNullable<
  Awaited<ReturnType<typeof client.api.agent.threads.get>>["data"]
>[number];

function ChatPage() {
  const [threads, setThreads] = useState<AgentThread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    setDrawerOpen(false);
  };

  const handleThreadChange = (id: string | null) => {
    setActiveId(id);
    setDrawerOpen(false);
    fetchThreads();
  };

  const handleThreadSelect = (id: string) => {
    setActiveId(id);
    setDrawerOpen(false);
  };

  const getThreadTitle = (thread: AgentThread) => {
    if (thread.title) return thread.title;
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
    <div className="flex h-full overflow-hidden">
      {/* Mobile drawer overlay */}
      {drawerOpen && (
        <div
          role="button"
          tabIndex={0}
          aria-label="Close drawer"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setDrawerOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setDrawerOpen(false)}
        />
      )}

      {/* Thread sidebar / drawer */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 flex-col overflow-hidden border-r border-border bg-surface
          transition-transform duration-200 ease-in-out
          md:relative md:flex md:translate-x-0
          ${drawerOpen ? "flex translate-x-0" : "-translate-x-full"}
        `}
      >
        {/* Spacer for TopNav on mobile */}
        <div className="h-12 shrink-0 md:hidden" />

        <div className="flex items-center justify-between border-b border-border p-3">
          <button
            type="button"
            onClick={handleNewChat}
            className="flex flex-1 items-center gap-2 rounded bg-accent px-3 py-2 text-sm text-white transition-colors hover:bg-accent-hover"
          >
            <MessageSquarePlus size={16} />
            New Chat
          </button>
          <button
            type="button"
            onClick={() => setDrawerOpen(false)}
            className="ml-2 rounded p-2 text-text-tertiary hover:bg-surface-elevated hover:text-text-primary md:hidden"
          >
            <X size={20} />
          </button>
        </div>

        <ScrollArea className="flex-1">
          <div className="space-y-0.5 p-2">
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
                  className={`group flex w-full items-center justify-between rounded px-3 py-2 text-left text-sm transition-colors ${
                    activeId === thread.id
                      ? "border-l-2 border-accent bg-surface-elevated text-text-primary"
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
        </ScrollArea>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat header */}
        <header className="flex items-center gap-3 border-b border-border px-4 py-2">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="rounded p-1.5 text-text-tertiary hover:bg-surface-elevated hover:text-text-primary md:hidden"
          >
            <Menu size={20} />
          </button>
          <h1 className="text-sm font-medium text-text-secondary">
            the-machine
          </h1>
        </header>

        <div className="flex-1 overflow-hidden">
          <ChatView
            threadId={activeId ?? undefined}
            onThreadChange={handleThreadChange}
          />
        </div>
      </div>
    </div>
  );
}
