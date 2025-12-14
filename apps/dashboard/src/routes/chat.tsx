import { createFileRoute } from "@tanstack/react-router";
import { Check, MessageSquarePlus, Pencil, Trash2, X } from "lucide-react";
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
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editTitle, setEditTitle] = useState("");
	const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

	const fetchConversations = useCallback(async () => {
		const { data } = await client.api.conversations.get();
		if (Array.isArray(data)) {
			setConversations(data);
		}
	}, []);

	useEffect(() => {
		fetchConversations();
	}, [fetchConversations]);

	const handleNewChat = () => {
		setActiveId(null);
	};

	const handleStartEdit = (conv: Conversation, e: React.MouseEvent) => {
		e.stopPropagation();
		setEditingId(conv.id);
		setEditTitle(conv.title || "");
	};

	const handleSaveTitle = async (id: string) => {
		if (editTitle.trim()) {
			await client.api.conversations({ id }).patch({ title: editTitle.trim() });
			fetchConversations();
		}
		setEditingId(null);
	};

	const handleCancelEdit = () => {
		setEditingId(null);
		setEditTitle("");
	};

	const handleDeleteClick = (id: string, e: React.MouseEvent) => {
		e.stopPropagation();
		setDeleteConfirmId(id);
	};

	const handleConfirmDelete = async () => {
		if (deleteConfirmId) {
			await client.api.conversations({ id: deleteConfirmId }).delete();
			if (activeId === deleteConfirmId) setActiveId(null);
			setDeleteConfirmId(null);
			fetchConversations();
		}
	};

	const handleConversationChange = (id: string | null) => {
		setActiveId(id);
		fetchConversations();
	};

	return (
		// Break out of container constraints for full-width layout
		<div className="-mx-4 -my-4 flex h-[calc(100vh-3rem)]">
			{/* Sidebar */}
			<div className="w-64 flex-shrink-0 border-r border-zinc-800 flex flex-col bg-zinc-900/50">
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
								type="button"
								key={conv.id}
								onClick={() => !editingId && setActiveId(conv.id)}
								className={`w-full text-left px-3 py-2 rounded-lg text-sm group flex items-center justify-between cursor-pointer ${
									activeId === conv.id
										? "bg-zinc-700 text-white"
										: "text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200"
								}`}
							>
								{editingId === conv.id ? (
									<div
										className="flex items-center gap-1 flex-1"
										onClick={(e) => e.stopPropagation()}
										onKeyDown={(e) => e.stopPropagation()}
										role="group"
									>
										<input
											type="text"
											value={editTitle}
											onChange={(e) => setEditTitle(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") handleSaveTitle(conv.id);
												if (e.key === "Escape") handleCancelEdit();
											}}
											className="flex-1 bg-zinc-800 border border-zinc-600 rounded px-2 py-0.5 text-sm text-white focus:outline-none focus:border-emerald-500"
											// biome-ignore lint/a11y/noAutofocus: needed for inline edit UX
											autoFocus
										/>
										<button
											type="button"
											onClick={() => handleSaveTitle(conv.id)}
											className="p-1 hover:text-emerald-400"
										>
											<Check size={14} />
										</button>
										<button
											type="button"
											onClick={handleCancelEdit}
											className="p-1 hover:text-zinc-200"
										>
											<X size={14} />
										</button>
									</div>
								) : (
									<>
										<span className="truncate flex-1">{conv.title || "New conversation"}</span>
										<div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
											<button
												type="button"
												onClick={(e) => handleStartEdit(conv, e)}
												className="p-1 hover:text-emerald-400"
											>
												<Pencil size={12} />
											</button>
											<button
												type="button"
												onClick={(e) => handleDeleteClick(conv.id, e)}
												className="p-1 hover:text-red-400"
											>
												<Trash2 size={12} />
											</button>
										</div>
									</>
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
					<Chat
						key={activeId ?? "new"}
						conversationId={activeId ?? undefined}
						onConversationChange={handleConversationChange}
					/>
				</div>
			</div>

			{/* Delete confirmation modal */}
			{deleteConfirmId && (
				<div className="fixed inset-0 z-50 flex items-center justify-center">
					<button
						type="button"
						className="fixed inset-0 bg-black/60 cursor-default"
						onClick={() => setDeleteConfirmId(null)}
						aria-label="Close modal"
					/>
					<div className="relative bg-zinc-900 border border-zinc-700 rounded-lg p-6 max-w-sm mx-4 shadow-xl">
						<h3 className="text-lg font-semibold text-white mb-2">Delete conversation?</h3>
						<p className="text-sm text-zinc-400 mb-4">
							This will permanently delete this conversation and all its messages.
						</p>
						<div className="flex gap-2 justify-end">
							<button
								type="button"
								onClick={() => setDeleteConfirmId(null)}
								className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleConfirmDelete}
								className="px-4 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg transition-colors"
							>
								Delete
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
