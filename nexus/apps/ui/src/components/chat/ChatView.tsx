import { useChat } from "@tanstack/ai-react";
import { fetchServerSentEvents } from "@tanstack/ai-client";
import type { UIMessage } from "@tanstack/ai-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

export function ChatView({ threadId: propThreadId, onThreadChange }: Props) {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(propThreadId ?? null);
	const [input, setInput] = useState("");
	const activeThreadIdRef = useRef<string | null>(activeThreadId);

	useEffect(() => {
		activeThreadIdRef.current = activeThreadId;
	}, [activeThreadId]);

	// Sync prop to state when parent changes threadId (clicking sidebar)
	useEffect(() => {
		setActiveThreadId(propThreadId ?? null);
	}, [propThreadId]);

	const {
		messages,
		sendMessage,
		isLoading,
		error,
		setMessages,
	} = useChat({
		connection: fetchServerSentEvents(
			() => `${API_URL}/api/agent/chat${activeThreadIdRef.current ? `?threadId=${activeThreadIdRef.current}` : ""}`,
		),
	});

	// Load existing thread messages on threadId change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on activeThreadId
	useEffect(() => {
		if (!activeThreadId) {
			setMessages([]);
			return;
		}

		const loadThread = async () => {
			const { data } = await client.api.agent.threads({ id: activeThreadId }).get();
			if (data && "messages" in data && Array.isArray(data.messages)) {
				// Convert ModelMessages from DB to UIMessages for display
				const uiMessages: UIMessage[] = data.messages
					.filter((m: { role: string; content?: string | null }) => m.content)
					.map((m: { role: string; content?: string | null }, i: number) => ({
						id: `loaded-${i}`,
						role: m.role as "user" | "assistant",
						parts: [{ type: "text" as const, content: m.content || "" }],
					}));
				setMessages(uiMessages);
			}
		};

		loadThread();
	}, [activeThreadId]);

	// Listen for thread:updated events (title changes from workers)
	const handleThreadUpdated = useCallback(
		(payload: { id: string; title: string | null }) => {
			if (payload.id === activeThreadIdRef.current) {
				// Thread was updated (e.g., by a worker) — could trigger refetch
				// For now, the title update is handled by the sidebar
			}
		},
		[]
	);
	useEvents("thread:updated", handleThreadUpdated);

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const messageContent = input.trim();
		setInput("");

		try {
			// Create thread if needed
			let threadId = activeThreadId;
			if (!threadId) {
				const { data } = await client.api.agent.threads.post({
					source: "chat",
				});
				if (data && "id" in data) {
					threadId = data.id;
					activeThreadIdRef.current = threadId;
					setActiveThreadId(threadId);
					onThreadChange?.(threadId);
				} else {
					throw new Error("Failed to create thread");
				}
			}

			// Send message via useChat — SSE stream handles the rest
			await sendMessage(messageContent);
		} catch (err) {
			console.error("Failed to send message:", err);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-hidden">
				<ChatMessages
					messages={messages}
					isLoading={isLoading}
					error={error?.message ?? null}
				/>
			</div>
			<ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
		</div>
	);
}
