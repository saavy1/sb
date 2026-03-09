import type { UIMessage } from "@tanstack/ai-client";
import { fetchServerSentEvents, modelMessagesToUIMessages } from "@tanstack/ai-client";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useRef, useState } from "react";
import { API_URL, client } from "../../lib/api";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

export function ChatView({ threadId: propThreadId, onThreadChange }: Props) {
	const [sessionId, setSessionId] = useState<string>(() => propThreadId ?? crypto.randomUUID());
	const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(
		propThreadId ? null : []
	);
	const [loading, setLoading] = useState(!!propThreadId);
	// Tracks the threadId we've already loaded/created — prevents re-loading
	// when onThreadCreated updates the URL and propThreadId catches up.
	const knownThreadRef = useRef<string | undefined>(propThreadId);

	useEffect(() => {
		if (!propThreadId) {
			// Always reset for new chat — use a fresh key to force remount
			knownThreadRef.current = undefined;
			setSessionId(crypto.randomUUID());
			setInitialMessages([]);
			setLoading(false);
			return;
		}

		// Skip reload if propThreadId matches what our session already knows about.
		// This happens when ChatSession creates a thread and the URL catches up.
		if (propThreadId === knownThreadRef.current) return;

		knownThreadRef.current = propThreadId;
		setSessionId(propThreadId);
		setLoading(true);
		client.api.agent
			.threads({ id: propThreadId })
			.get()
			.then(({ data }) => {
				if (data && "messages" in data && Array.isArray(data.messages)) {
					setInitialMessages(modelMessagesToUIMessages(data.messages));
				} else {
					setInitialMessages([]);
				}
			})
			.catch(() => setInitialMessages([]))
			.finally(() => setLoading(false));
	}, [propThreadId]);

	if (initialMessages === null || loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-3 w-3 rounded-sm bg-accent animate-pulse" />
			</div>
		);
	}

	return (
		<ChatSession
			key={sessionId}
			threadId={knownThreadRef.current ?? null}
			initialMessages={initialMessages}
			onThreadCreated={(id) => {
				// Update the ref so the effect skips reload when URL catches up
				knownThreadRef.current = id;
				onThreadChange?.(id);
			}}
		/>
	);
}

function ChatSession({
	threadId,
	initialMessages,
	onThreadCreated,
}: {
	threadId: string | null;
	initialMessages: UIMessage[];
	onThreadCreated: (id: string) => void;
}) {
	const [input, setInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const threadIdRef = useRef(threadId);
	const messagesRef = useRef<UIMessage[]>(initialMessages);

	const { messages, sendMessage, isLoading, error } = useChat({
		connection: fetchServerSentEvents(
			() =>
				`${API_URL}/api/agent/chat${threadIdRef.current ? `?threadId=${threadIdRef.current}` : ""}`
		),
		initialMessages,
		onFinish: () => {
			const tid = threadIdRef.current;
			if (!tid) return;
			fetch(`${API_URL}/api/agent/threads/${tid}/persist`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: messagesRef.current }),
			}).catch((err) => console.error("Failed to persist messages:", err));
		},
	});

	messagesRef.current = messages;

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const messageContent = input.trim();
		setInput("");
		setSubmitError(null);

		try {
			if (!threadIdRef.current) {
				const { data } = await client.api.agent.threads.post({ source: "chat" });
				if (data && "id" in data) {
					threadIdRef.current = data.id;
					onThreadCreated(data.id);
				} else {
					throw new Error("Failed to create thread");
				}
			}

			await sendMessage(messageContent);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Failed to send message";
			console.error("Failed to send message:", err);
			setSubmitError(message);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-hidden">
				<ChatMessages
					messages={messages}
					isLoading={isLoading}
					error={submitError ?? error?.message ?? null}
				/>
			</div>
			<ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
		</div>
	);
}
