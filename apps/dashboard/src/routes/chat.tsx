import { createFileRoute } from "@tanstack/react-router";
import { MessageSquarePlus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Chat } from "../components/Chat";
import { client } from "../lib/api";

// Infer type from API
type ConversationsResponse = Awaited<ReturnType<typeof client.api.conversations.get>>["data"];
type Conversation = NonNullable<ConversationsResponse>[number];

export const Route = createFileRoute("/chat")({
	component: ChatPage,
});

function ChatPage() {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	const fetchConversations = useCallback(async () => {
		const { data } = await client.api.conversations.get();
		if (Array.isArray(data)) {
			setConversations(data);
		}
	}, []);

	useEffect(() => {
		fetchConversations();
	}, [fetchConversations]);

	const handleNewChat = async () => {
		setActiveId(null);
	};

	const handleDelete = async (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		await client.api.conversations({ id }).delete();
		if (activeId === id) setActiveId(null);
		fetchConversations();
	};

	const handleConversationChange = (id: string | null) => {
		setActiveId(id);
		fetchConversations();
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
					{conversations.length === 0 ? (
						<p className="text-xs text-zinc-500 text-center py-4">No conversations yet</p>
					) : (
						conversations.map((conv) => (
							<button
								key={conv.id}
								type="button"
								onClick={() => setActiveId(conv.id)}
								className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate group flex items-center justify-between ${
									activeId === conv.id
										? "bg-zinc-700 text-white"
										: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
								}`}
							>
								<span className="truncate">{conv.title || "New conversation"}</span>
								<button
									type="button"
									onClick={(e) => handleDelete(conv.id, e)}
									className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
								>
									<Trash2 size={14} />
								</button>
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
					<Chat
						key={activeId ?? "new"}
						conversationId={activeId ?? undefined}
						onConversationChange={handleConversationChange}
					/>
				</div>
			</div>
		</div>
	);
}
