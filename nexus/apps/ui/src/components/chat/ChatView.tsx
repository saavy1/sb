import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../lib/api";
import { useEvents } from "../../lib/useEvents";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

type Message = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
};

type ToolCall = {
	toolName: string;
	status: "calling" | "complete" | "error";
	args?: Record<string, unknown>;
};

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

export function ChatView({ threadId: propThreadId, onThreadChange }: Props) {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(propThreadId ?? null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCall>>(new Map());

	// Use ref for threadId to avoid stale closure in event handler
	const activeThreadIdRef = useRef<string | null>(activeThreadId);
	// Track if we just created a thread (skip loading, messages come via WebSocket)
	const justCreatedThreadRef = useRef(false);

	useEffect(() => {
		activeThreadIdRef.current = activeThreadId;
	}, [activeThreadId]);

	// Sync prop to state when parent changes threadId (clicking sidebar)
	useEffect(() => {
		setActiveThreadId(propThreadId ?? null);
	}, [propThreadId]);

	// Load thread messages when switching threads
	useEffect(() => {
		if (!activeThreadId) {
			setMessages([]);
			return;
		}

		// Skip loading if we just created this thread - messages will come via WebSocket
		if (justCreatedThreadRef.current) {
			justCreatedThreadRef.current = false;
			return;
		}

		const loadThread = async () => {
			const { data } = await client.api.agent.threads({ id: activeThreadId }).get();
			if (data && "messages" in data && Array.isArray(data.messages)) {
				setMessages(
					data.messages.map((m: { id: string; role: string; content?: string | null }) => ({
						id: m.id,
						role: m.role as "user" | "assistant" | "system",
						content: m.content || "",
					}))
				);
			}
		};

		loadThread();
	}, [activeThreadId]);

	// Handle WebSocket message events
	const handleMessageEvent = useCallback(
		(payload: {
			threadId: string;
			messageId: string;
			role: string;
			content: string;
			done: boolean;
		}) => {
			const currentThreadId = activeThreadIdRef.current;

			// Only process events for the active thread
			if (payload.threadId !== currentThreadId) return;

			setMessages((prev) => {
				const existingIdx = prev.findIndex((m) => m.id === payload.messageId);

				const newMessage: Message = {
					id: payload.messageId,
					role: payload.role as "user" | "assistant" | "system",
					content: payload.content,
				};

				if (existingIdx >= 0) {
					const updated = [...prev];
					updated[existingIdx] = newMessage;
					return updated;
				}

				// For user messages, check if we already added it optimistically (temp ID)
				if (payload.role === "user") {
					const tempIdx = prev.findIndex(
						(m) => m.role === "user" && m.id.startsWith("temp-") && m.content === payload.content
					);
					if (tempIdx >= 0) {
						const updated = [...prev];
						updated[tempIdx] = newMessage;
						return updated;
					}
				}

				return [...prev, newMessage];
			});

			// Clear loading state when we get a done assistant message
			if (payload.done && payload.role === "assistant") {
				setIsLoading(false);
			}
		},
		[] // No dependencies - uses ref instead
	);

	useEvents("thread:message", handleMessageEvent);

	// Handle tool call events
	const handleToolCallEvent = useCallback(
		(payload: {
			threadId: string;
			toolName: string;
			status: "calling" | "complete" | "error";
			args?: Record<string, unknown>;
		}) => {
			const currentThreadId = activeThreadIdRef.current;
			if (payload.threadId !== currentThreadId) return;

			setActiveToolCalls((prev) => {
				const next = new Map(prev);
				if (payload.status === "calling") {
					next.set(payload.toolName, {
						toolName: payload.toolName,
						status: "calling",
						args: payload.args,
					});
				} else {
					next.delete(payload.toolName);
				}
				return next;
			});
		},
		[]
	);

	useEvents("thread:tool-call", handleToolCallEvent);

	// Clear tool calls when loading finishes
	useEffect(() => {
		if (!isLoading) {
			const timeout = setTimeout(() => {
				setActiveToolCalls(new Map());
			}, 500);
			return () => clearTimeout(timeout);
		}
	}, [isLoading]);

	// Clear tool calls when switching threads
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on thread change
	useEffect(() => {
		setActiveToolCalls(new Map());
	}, [activeThreadId]);

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const messageContent = input.trim();
		setInput("");
		setIsLoading(true);
		setError(null);

		try {
			let threadId = activeThreadId;
			if (!threadId) {
				const { data } = await client.api.agent.threads.post({
					source: "chat",
				});
				if (data && "id" in data) {
					threadId = data.id;
					activeThreadIdRef.current = threadId;
					justCreatedThreadRef.current = true;
					setActiveThreadId(threadId);
					onThreadChange?.(threadId);
				} else {
					throw new Error("Failed to create thread");
				}
			}

			// Add user message optimistically
			const tempUserMsgId = `temp-${Date.now()}`;
			setMessages((prev) => [
				...prev,
				{ id: tempUserMsgId, role: "user", content: messageContent },
			]);

			// Send message - assistant response comes via WebSocket
			await client.api.agent.chat.post(
				{ messages: [{ role: "user", content: messageContent }] },
				{ query: { threadId } }
			);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to send message");
			setIsLoading(false);
		}
	};

	return (
		<div className="flex h-full flex-col">
			<div className="flex-1 overflow-hidden">
				<ChatMessages
					messages={messages}
					isLoading={isLoading}
					error={error}
					activeToolCalls={activeToolCalls}
				/>
			</div>
			<ChatInput value={input} onChange={setInput} onSubmit={handleSubmit} isLoading={isLoading} />
		</div>
	);
}
