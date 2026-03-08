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
	const [threadId, setThreadId] = useState<string | undefined>(propThreadId);
	const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
	const [loading, setLoading] = useState(false);

	// Sync prop changes (e.g. clicking sidebar)
	useEffect(() => {
		setThreadId(propThreadId);
	}, [propThreadId]);

	// Load thread messages when threadId changes
	useEffect(() => {
		if (!threadId) {
			setInitialMessages([]);
			return;
		}

		setLoading(true);
		client.api.agent
			.threads({ id: threadId })
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
	}, [threadId]);

	if (initialMessages === null || loading) {
		return (
			<div className="flex h-full items-center justify-center">
				<div className="h-3 w-3 rounded-sm bg-accent animate-pulse" />
			</div>
		);
	}

	return (
		<ChatSession
			key={threadId ?? "new"}
			threadId={threadId ?? null}
			initialMessages={initialMessages}
			onThreadCreated={(id) => {
				setThreadId(id);
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

	const { messages, sendMessage, isLoading, error } = useChat({
		connection: fetchServerSentEvents(
			() =>
				`${API_URL}/api/agent/chat${threadIdRef.current ? `?threadId=${threadIdRef.current}` : ""}`
		),
		initialMessages,
	});

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
