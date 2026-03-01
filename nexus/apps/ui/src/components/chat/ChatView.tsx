import { fetchServerSentEvents } from "@tanstack/ai-client";
import type { UIMessage } from "@tanstack/ai-react";
import { useChat } from "@tanstack/ai-react";
import { useEffect, useRef, useState } from "react";
import { API_URL, client } from "../../lib/api";
import { ChatInput } from "./ChatInput";
import { ChatMessages } from "./ChatMessages";

type ModelMessage = {
	role: string;
	content?: string | null;
	toolCalls?: Array<{
		id: string;
		type: string;
		function: { name: string; arguments: string };
	}>;
	toolCallId?: string;
};

/** Convert DB ModelMessages to UIMessages, preserving tool-call/result parts */
function convertModelToUIMessages(messages: ModelMessage[]): UIMessage[] {
	const uiMessages: UIMessage[] = [];

	for (let i = 0; i < messages.length; i++) {
		const m = messages[i];

		// Wake messages → system role
		if (
			m.role === "user" &&
			typeof m.content === "string" &&
			m.content.startsWith("[SYSTEM WAKE]")
		) {
			uiMessages.push({
				id: `loaded-${i}`,
				role: "system",
				parts: [{ type: "text" as const, content: m.content.replace("[SYSTEM WAKE]", "").trim() }],
			});
			continue;
		}

		// Skip tool-role messages — they're attached to assistant messages below
		if (m.role === "tool") continue;

		// User messages
		if (m.role === "user") {
			uiMessages.push({
				id: `loaded-${i}`,
				role: "user",
				parts: [{ type: "text" as const, content: typeof m.content === "string" ? m.content : "" }],
			});
			continue;
		}

		// Assistant messages — include tool-call and tool-result parts
		if (m.role === "assistant") {
			const parts: UIMessage["parts"] = [];

			if (m.content) {
				parts.push({
					type: "text" as const,
					content: typeof m.content === "string" ? m.content : "",
				});
			}

			if (m.toolCalls) {
				for (const tc of m.toolCalls) {
					parts.push({
						type: "tool-call" as const,
						id: tc.id,
						name: tc.function.name,
						arguments: tc.function.arguments || "{}",
						state: "input-complete",
					});

					// Find matching tool result in subsequent messages
					const toolResult = messages.find((r) => r.role === "tool" && r.toolCallId === tc.id);
					if (toolResult) {
						parts.push({
							type: "tool-result" as const,
							toolCallId: tc.id,
							content:
								typeof toolResult.content === "string"
									? toolResult.content
									: JSON.stringify(toolResult.content),
							state: "complete",
						});
					}
				}
			}

			if (parts.length > 0) {
				uiMessages.push({ id: `loaded-${i}`, role: "assistant", parts });
			}
		}
	}

	return uiMessages;
}

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

export function ChatView({ threadId: propThreadId, onThreadChange }: Props) {
	const [activeThreadId, setActiveThreadId] = useState<string | null>(propThreadId ?? null);
	const [input, setInput] = useState("");
	const [submitError, setSubmitError] = useState<string | null>(null);
	const activeThreadIdRef = useRef<string | null>(activeThreadId);
	const skipNextLoadRef = useRef(false);

	useEffect(() => {
		activeThreadIdRef.current = activeThreadId;
	}, [activeThreadId]);

	// Sync prop to state when parent changes threadId (clicking sidebar)
	useEffect(() => {
		setActiveThreadId(propThreadId ?? null);
	}, [propThreadId]);

	const { messages, sendMessage, isLoading, error, setMessages } = useChat({
		connection: fetchServerSentEvents(
			() =>
				`${API_URL}/api/agent/chat${activeThreadIdRef.current ? `?threadId=${activeThreadIdRef.current}` : ""}`
		),
	});

	// Load existing thread messages on threadId change
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on activeThreadId
	useEffect(() => {
		if (!activeThreadId) {
			setMessages([]);
			return;
		}

		// Skip loading when we just created a new thread (prevents wiping in-flight stream)
		if (skipNextLoadRef.current) {
			skipNextLoadRef.current = false;
			return;
		}

		const loadThread = async () => {
			const { data } = await client.api.agent.threads({ id: activeThreadId }).get();
			if (data && "messages" in data && Array.isArray(data.messages)) {
				setMessages(convertModelToUIMessages(data.messages as ModelMessage[]));
			}
		};

		loadThread();
	}, [activeThreadId]);

	const handleSubmit = async () => {
		if (!input.trim() || isLoading) return;

		const messageContent = input.trim();
		setInput("");
		setSubmitError(null);

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
					skipNextLoadRef.current = true;
					setActiveThreadId(threadId);
					onThreadChange?.(threadId);
				} else {
					throw new Error("Failed to create thread");
				}
			}

			// Send message via useChat — SSE stream handles the rest
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
