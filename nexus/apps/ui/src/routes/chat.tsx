import { createFileRoute } from "@tanstack/react-router";
import { MessageSquarePlus } from "lucide-react";
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

	const fetchThreads = useCallback(async () => {
		const { data } = await client.api.agent.threads.get({ query: { source: "chat" } });
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
			prev.map((t) => (t.id === payload.id ? { ...t, title: payload.title } : t))
		);
	});

	const handleNewChat = () => {
		setActiveId(null);
	};

	const handleThreadChange = (id: string | null) => {
		setActiveId(id);
		fetchThreads();
	};

	// Generate a display name from thread
	const getThreadTitle = (thread: AgentThread) => {
		// Use generated title if available
		if (thread.title) {
			return thread.title;
		}
		// Fallback: "Chat from Dec 14" or show status if sleeping
		const date = new Date(thread.createdAt);
		const dateStr = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
		if (thread.status === "sleeping") {
			return `Sleeping (${thread.wakeReason?.slice(0, 20) || dateStr})`;
		}
		return `Chat from ${dateStr}`;
	};

	return (
		<div className="flex h-[calc(100vh-4rem)]">
			{/* Sidebar */}
			<div className="w-64 flex-shrink-0 border-r border-zinc-800 flex flex-col">
				<div className="p-3 border-b border-zinc-800">
					<button
						type="button"
						onClick={handleNewChat}
						className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm transition-colors"
					>
						<MessageSquarePlus size={16} />
						New Chat
					</button>
				</div>
				<div className="flex-1 overflow-y-auto p-2 space-y-1">
					{threads.length === 0 ? (
						<p className="text-xs text-zinc-500 text-center py-4">No threads yet</p>
					) : (
						threads.map((thread) => (
							<button
								type="button"
								key={thread.id}
								onClick={() => setActiveId(thread.id)}
								className={`w-full text-left px-3 py-2 rounded-lg text-sm group flex items-center justify-between cursor-pointer ${
									activeId === thread.id
										? "bg-zinc-700 text-white"
										: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
								}`}
							>
								<span className="truncate flex-1">{getThreadTitle(thread)}</span>
								{thread.status === "sleeping" && (
									<span className="ml-2 px-1.5 py-0.5 text-xs bg-amber-500/20 text-amber-400 rounded">
										zzz
									</span>
								)}
								{thread.messageCount > 0 && thread.status !== "sleeping" && (
									<span className="ml-2 text-xs text-zinc-500">{thread.messageCount}</span>
								)}
							</button>
						))
					)}
				</div>
			</div>

			{/* Main chat area */}
			<div className="flex-1 flex flex-col overflow-hidden">
				<div className="border-b border-zinc-800 px-6 py-4">
					<h1 className="text-2xl font-bold text-white">The Machine</h1>
					<p className="text-sm text-zinc-400">AI assistant for your homelab</p>
				</div>
				<div className="flex-1 overflow-hidden">
					<Chat threadId={activeId ?? undefined} onThreadChange={handleThreadChange} />
				</div>
			</div>
		</div>
	);
}
