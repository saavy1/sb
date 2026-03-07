import type { ModelMessage } from "@tanstack/ai";
import { modelMessagesToUIMessages } from "@tanstack/ai";
import { fetchServerSentEvents } from "@tanstack/ai-client";
import type { UIMessage } from "@tanstack/ai-react";
import { useChat } from "@tanstack/ai-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { API_URL, client } from "../../lib/api";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

function convertModelToUIMessages(messages: ModelMessage[]): UIMessage[] {
	const wakeMessages: UIMessage[] = [];
	const regularMessages: ModelMessage[] = [];

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];
		if (
			m.role === "user" &&
			typeof m.content === "string" &&
			m.content.startsWith("[SYSTEM WAKE]")
		) {
			wakeMessages.push({
				id: `wake-${i}`,
				role: "system",
				parts: [{ type: "text" as const, content: m.content.replace("[SYSTEM WAKE]", "").trim() }],
			});
		} else {
			regularMessages.push(m);
		}
	}

	const converted = modelMessagesToUIMessages(regularMessages);
	if (wakeMessages.length === 0) return converted;
	return [...wakeMessages, ...converted];
}

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

/**
 * Outer component that loads thread messages, then renders ChatViewInner
 * keyed on threadId so useChat gets a fresh instance with correct initialMessages.
 */
export function ChatView({ threadId, onThreadChange }: Props) {
	const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(threadId ? null : []);

	useEffect(() => {
		if (!threadId) {
			setInitialMessages([]);
			return;
		}

		let cancelled = false;
		setInitialMessages(null);

		const load = async () => {
			const { data } = await client.api.agent.threads({ id: threadId }).get();
			if (cancelled) return;

			if (data && "messages" in data && Array.isArray(data.messages) && data.messages.length > 0) {
				setInitialMessages(convertModelToUIMessages(data.messages as ModelMessage[]));
			} else {
				setInitialMessages([]);
			}
		};

		load();
		return () => {
			cancelled = true;
		};
	}, [threadId]);

	// Show loading state while fetching thread messages
	if (initialMessages === null) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-text-tertiary">
				Loading...
			</div>
		);
	}

	return (
		<ChatViewInner
			key={threadId ?? "new"}
			threadId={threadId}
			initialMessages={initialMessages}
			onThreadChange={onThreadChange}
		/>
	);
}

type InnerProps = {
	threadId?: string;
	initialMessages: UIMessage[];
	onThreadChange?: (id: string | null) => void;
};

function ChatViewInner({ threadId: initialThreadId, initialMessages, onThreadChange }: InnerProps) {
	const [input, setInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const threadIdRef = useRef<string | undefined>(initialThreadId);

	const persistMessages = useCallback(async (msgs: UIMessage[]) => {
		const id = threadIdRef.current;
		if (!id || msgs.length === 0) return;

		try {
			await fetch(`${API_URL}/api/agent/threads/${id}/persist`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages: msgs }),
			});
		} catch (err) {
			console.error("Failed to persist messages:", err);
		}
	}, []);

	const { messages, sendMessage, isLoading, error } = useChat({
		initialMessages,
		connection: fetchServerSentEvents(
			() =>
				`${API_URL}/api/agent/chat${threadIdRef.current ? `?threadId=${threadIdRef.current}` : ""}`
		),
		onFinish: () => {
			persistMessages(chatRef.current.messages);
		},
	});

	const chatRef = useRef({ messages });
	chatRef.current.messages = messages;

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
					onThreadChange?.(data.id);
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
