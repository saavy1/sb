import { Bell, Bot, Loader2, Send, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { client } from "../lib/api";
import { useEvents } from "../lib/useEvents";

// Message type matching what comes from the server
type Message = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
};

type Props = {
	threadId?: string;
	onThreadChange?: (id: string | null) => void;
};

export function Chat({ threadId: propThreadId, onThreadChange }: Props) {
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<Message[]>([]);
	const [activeThreadId, setActiveThreadId] = useState<string | null>(propThreadId ?? null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);
	const messagesEndRef = useRef<HTMLDivElement>(null);

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
		setTimeout(() => inputRef.current?.focus(), 100);
	}, [propThreadId]);

	// Focus input on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

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

	// Scroll to bottom when messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	// Handle WebSocket message events - this is the primary way we receive updates
	const handleMessageEvent = useCallback(
		(payload: {
			threadId: string;
			messageId: string;
			role: string;
			content: string;
			done: boolean;
		}) => {
			// Use ref to get current threadId (avoids stale closure)
			const currentThreadId = activeThreadIdRef.current;

			console.log("[Chat] Received event:", {
				payloadThreadId: payload.threadId,
				currentThreadId,
				messageId: payload.messageId,
				role: payload.role,
				contentLength: payload.content.length,
				done: payload.done,
			});

			// Only process events for the active thread
			if (payload.threadId !== currentThreadId) {
				console.log("[Chat] Ignoring event - threadId mismatch");
				return;
			}

			setMessages((prev) => {
				const existingIdx = prev.findIndex((m) => m.id === payload.messageId);

				const newMessage: Message = {
					id: payload.messageId,
					role: payload.role as "user" | "assistant" | "system",
					content: payload.content,
				};

				if (existingIdx >= 0) {
					// Update existing message (streaming update)
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
						// Replace temp message with real one from server
						const updated = [...prev];
						updated[tempIdx] = newMessage;
						return updated;
					}
				}

				// Add new message
				return [...prev, newMessage];
			});

			// Clear loading state when we get a done assistant message
			if (payload.done && payload.role === "assistant") {
				setIsLoading(false);
				setTimeout(() => inputRef.current?.focus(), 100);
			}
		},
		[] // No dependencies - uses ref instead
	);

	useEvents("thread:message", handleMessageEvent);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;

		const messageContent = input.trim();
		setInput("");
		setIsLoading(true);
		setError(null);

		console.log("[Chat] Submitting message:", { messageContent, activeThreadId });

		try {
			// Create thread if none active
			let threadId = activeThreadId;
			if (!threadId) {
				console.log("[Chat] Creating new thread...");
				const { data } = await client.api.agent.threads.post({ source: "chat" });
				console.log("[Chat] Thread created:", data);
				if (data && "id" in data) {
					threadId = data.id;
					// Update refs immediately so event handler can use them
					activeThreadIdRef.current = threadId;
					justCreatedThreadRef.current = true; // Skip loading effect, messages via WebSocket
					setActiveThreadId(threadId);
					onThreadChange?.(threadId);
				} else {
					throw new Error("Failed to create thread");
				}
			}

			console.log("[Chat] Sending message to thread:", threadId);

			// Add user message optimistically (don't wait for WebSocket)
			const tempUserMsgId = `temp-${Date.now()}`;
			setMessages((prev) => [
				...prev,
				{ id: tempUserMsgId, role: "user", content: messageContent },
			]);

			// Send message - assistant response will come via WebSocket
			const result = await client.api.agent.chat.post(
				{ messages: [{ role: "user", content: messageContent }] },
				{ query: { threadId } }
			);
			console.log("[Chat] Message sent, result:", result);
		} catch (err) {
			console.error("[Chat] Error:", err);
			setError(err instanceof Error ? err.message : "Failed to send message");
			setIsLoading(false);
		}
	};

	return (
		<div className="flex h-full flex-col">
			{/* Messages area */}
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{messages.length === 0 && !isLoading && (
					<div className="flex h-full flex-col items-center justify-center text-zinc-500">
						<Bot className="mb-4 h-12 w-12" />
						<p className="text-lg font-medium">The Machine</p>
						<p className="text-sm">Ask me about your homelab</p>
					</div>
				)}

				{messages.map((message) => {
					// System messages (wake notifications) get special centered styling
					if (message.role === "system") {
						return (
							<div key={message.id} className="flex justify-center">
								<div className="flex items-center gap-2 rounded-full bg-amber-500/10 px-4 py-2 text-sm text-amber-400">
									<Bell className="h-4 w-4" />
									<span>{message.content}</span>
								</div>
							</div>
						);
					}

					return (
						<div
							key={message.id}
							className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
						>
							{message.role === "assistant" && (
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
									<Bot className="h-4 w-4 text-emerald-400" />
								</div>
							)}

							<div
								className={`max-w-[80%] rounded-lg px-4 py-2 ${
									message.role === "user" ? "bg-zinc-700 text-white" : "bg-zinc-800 text-zinc-100"
								}`}
							>
								<MessageContent content={message.content} />
							</div>

							{message.role === "user" && (
								<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-600">
									<User className="h-4 w-4 text-zinc-300" />
								</div>
							)}
						</div>
					);
				})}

				{isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
					<div className="flex gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
							<Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
						</div>
						<div className="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-400">Thinking...</div>
					</div>
				)}

				{error && (
					<div className="rounded-lg bg-red-900/20 px-4 py-2 text-red-400">Error: {error}</div>
				)}

				<div ref={messagesEndRef} />
			</div>

			{/* Input area */}
			<form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4">
				<div className="flex gap-2">
					<input
						ref={inputRef}
						type="text"
						value={input}
						onChange={(e) => setInput(e.target.value)}
						placeholder="Ask about servers, system stats..."
						className="flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2 text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
						disabled={isLoading}
					/>
					<button
						type="submit"
						disabled={!input.trim() || isLoading}
						className="rounded-lg bg-emerald-600 px-4 py-2 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
					>
						<Send className="h-5 w-5" />
					</button>
				</div>
			</form>
		</div>
	);
}

function MessageContent({ content }: { content: string }) {
	// Clean DeepSeek tool call markers from text
	const cleanText = (text: string): string => {
		return text
			.replace(/<｜tool▁calls▁begin｜>[\s\S]*?<｜tool▁calls▁end｜>/g, "")
			.replace(/<｜tool▁call▁begin｜>[\s\S]*?<｜tool▁call▁end｜>/g, "")
			.replace(/```json\s*\{\s*\}\s*```/g, "")
			.trim();
	};

	const cleaned = cleanText(content);
	if (!cleaned) return <span className="text-zinc-500">...</span>;

	return (
		<div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-code:text-emerald-400 prose-code:before:content-none prose-code:after:content-none">
			<Markdown>{cleaned}</Markdown>
		</div>
	);
}
