import { Bell, Bot, Check, Copy, Loader2, Send, User, Wrench } from "lucide-react";
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

// Tool call tracking
type ToolCall = {
	toolName: string;
	status: "calling" | "complete" | "error";
	args?: Record<string, unknown>;
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
	const [activeToolCalls, setActiveToolCalls] = useState<Map<string, ToolCall>>(new Map());
	const [copied, setCopied] = useState(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
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
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on messages change
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
					// Remove completed/errored tool calls after a brief delay
					next.delete(payload.toolName);
				}
				return next;
			});
		},
		[]
	);

	useEvents("thread:tool-call", handleToolCallEvent);

	// Clear tool calls when loading finishes or thread changes (prevents memory leak)
	useEffect(() => {
		if (!isLoading) {
			// Give a brief delay for any final events to arrive
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

	// Copy all messages to clipboard with nice formatting
	const handleCopyMessages = useCallback(async () => {
		const formatted = messages
			.filter((m) => m.role !== "system")
			.map((m) => {
				const role = m.role === "user" ? "User" : "Assistant";
				// Strip tool result JSON blocks for cleaner copy
				const cleanContent = m.content.replace(/\n\s*\{[\s\S]*?\}\s*(?=\n|$)/g, "").trim();
				return `${role}: ${cleanContent}`;
			})
			.join("\n\n");

		await navigator.clipboard.writeText(formatted);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [messages]);

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
			<div className="relative flex-1 overflow-y-auto p-3 md:p-4">
				{/* Copy button - only show when there are messages */}
				{messages.length > 0 && (
					<button
						type="button"
						onClick={handleCopyMessages}
						className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-zinc-800 px-2 py-1.5 text-xs text-zinc-400 transition-colors hover:bg-zinc-700 hover:text-zinc-300 md:right-4 md:top-4 md:px-2.5"
						title="Copy conversation"
					>
						{copied ? (
							<>
								<Check className="h-3.5 w-3.5 text-emerald-400" />
								<span className="hidden text-emerald-400 sm:inline">Copied</span>
							</>
						) : (
							<>
								<Copy className="h-3.5 w-3.5" />
								<span className="hidden sm:inline">Copy</span>
							</>
						)}
					</button>
				)}

				<div className="space-y-4">
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
									className={`max-w-[85%] rounded-lg px-3 py-2 md:max-w-[80%] md:px-4 ${
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

					{/* Active tool calls */}
					{activeToolCalls.size > 0 && (
						<div className="flex gap-3">
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-500/20">
								<Wrench className="h-4 w-4 text-amber-400" />
							</div>
							<div className="space-y-1">
								{Array.from(activeToolCalls.values()).map((tc) => (
									<div
										key={tc.toolName}
										className="flex items-center gap-2 rounded-lg bg-zinc-800 px-3 py-1.5 text-sm"
									>
										<Loader2 className="h-3 w-3 animate-spin text-amber-400" />
										<span className="font-mono text-amber-300">{tc.toolName}</span>
									</div>
								))}
							</div>
						</div>
					)}

					{isLoading &&
						activeToolCalls.size === 0 &&
						(messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
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
			</div>

			{/* Input area */}
			<form onSubmit={handleSubmit} className="border-t border-zinc-800 p-3 md:p-4">
				<div className="flex gap-2">
					<textarea
						ref={inputRef}
						value={input}
						onChange={(e) => setInput(e.target.value)}
						onKeyDown={(e) => {
							// Enter submits, Shift+Enter adds newline
							if (e.key === "Enter" && !e.shiftKey) {
								e.preventDefault();
								handleSubmit(e);
							}
						}}
						placeholder="Ask something... (Shift+Enter for new line)"
						rows={1}
						className="max-h-40 min-h-[42px] flex-1 resize-none rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-white placeholder-zinc-500 focus:border-emerald-500 focus:outline-none md:px-4 md:text-base"
						disabled={isLoading}
						style={{
							height: "auto",
							overflow: "hidden",
						}}
						onInput={(e) => {
							// Auto-resize textarea
							const target = e.target as HTMLTextAreaElement;
							target.style.height = "auto";
							target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
							target.style.overflow = target.scrollHeight > 160 ? "auto" : "hidden";
						}}
					/>
					<button
						type="submit"
						disabled={!input.trim() || isLoading}
						className="self-end rounded-lg bg-emerald-600 px-3 py-2 text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50 md:px-4"
					>
						<Send className="h-5 w-5" />
					</button>
				</div>
			</form>
		</div>
	);
}

function MessageContent({ content }: { content: string }) {
	// Parse content into segments: text and tool results
	const segments = parseMessageContent(content);

	if (segments.length === 0) {
		return <span className="text-zinc-500">...</span>;
	}

	return (
		<div className="space-y-2">
			{segments.map((segment) => {
				if (segment.type === "text") {
					if (!segment.content.trim()) return null;
					return (
						<div
							key={segment.key}
							className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-code:text-emerald-400 prose-code:before:content-none prose-code:after:content-none"
						>
							<Markdown>{segment.content}</Markdown>
						</div>
					);
				}

				if (segment.type === "tool-error") {
					return (
						<ToolErrorBlock key={segment.key} error={segment.error} toolName={segment.toolName} />
					);
				}

				if (segment.type === "tool-result") {
					return <ToolResultBlock key={segment.key} result={segment.result} />;
				}

				return null;
			})}
		</div>
	);
}

type ContentSegment =
	| { type: "text"; content: string; key: string }
	| { type: "tool-result"; result: Record<string, unknown>; key: string }
	| { type: "tool-error"; error: string; toolName?: string; key: string };

function parseMessageContent(content: string): ContentSegment[] {
	// Clean DeepSeek tool call markers
	const cleaned = content
		.replace(/<｜tool▁calls▁begin｜>[\s\S]*?<｜tool▁calls▁end｜>/g, "")
		.replace(/<｜tool▁call▁begin｜>[\s\S]*?<｜tool▁call▁end｜>/g, "")
		.replace(/```json\s*\{\s*\}\s*```/g, "");

	const segments: ContentSegment[] = [];
	let segmentIndex = 0;

	// Pattern to match JSON objects at the start of lines or after newlines
	// This catches tool results that appear as standalone JSON
	const jsonPattern = /(?:^|\n)\s*(\{[\s\S]*?\})\s*(?=\n|$)/g;

	let lastIndex = 0;
	let match = jsonPattern.exec(cleaned);

	while (match !== null) {
		const jsonStr = match[1];

		// Try to parse as JSON
		try {
			const parsed = JSON.parse(jsonStr);

			// Add text before this JSON block
			const textBefore = cleaned.slice(lastIndex, match.index);
			if (textBefore.trim()) {
				segments.push({ type: "text", content: textBefore.trim(), key: `text-${segmentIndex++}` });
			}

			// Determine if it's an error or result
			if (parsed.error && typeof parsed.error === "string") {
				// Check if it's a tool validation error
				const toolMatch = parsed.error.match(/tool (\w+):/);
				segments.push({
					type: "tool-error",
					error: parsed.error,
					toolName: toolMatch?.[1],
					key: `error-${segmentIndex++}`,
				});
			} else {
				segments.push({ type: "tool-result", result: parsed, key: `result-${segmentIndex++}` });
			}

			lastIndex = match.index + match[0].length;
		} catch {
			// Not valid JSON, skip
		}

		match = jsonPattern.exec(cleaned);
	}

	// Add remaining text
	const remaining = cleaned.slice(lastIndex).trim();
	if (remaining) {
		segments.push({ type: "text", content: remaining, key: `text-${segmentIndex++}` });
	}

	// If no segments were created, return the whole content as text
	if (segments.length === 0 && cleaned.trim()) {
		segments.push({ type: "text", content: cleaned.trim(), key: "text-0" });
	}

	return segments;
}

function ToolErrorBlock({ error, toolName }: { error: string; toolName?: string }) {
	const [expanded, setExpanded] = useState(false);

	// Extract the main error message
	const mainError = error.includes("Input validation failed")
		? "Input validation failed"
		: error.slice(0, 100);

	return (
		<div className="rounded-md border border-red-800/50 bg-red-900/20 text-sm">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-red-900/30"
			>
				<span className="text-red-400">✕</span>
				<span className="font-mono text-red-300">{toolName || "tool"}</span>
				<span className="text-red-400/80">{mainError}</span>
				<span className="ml-auto text-red-400/60">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="border-t border-red-800/50 px-3 py-2 text-xs text-red-300/70 overflow-x-auto">
					{error}
				</pre>
			)}
		</div>
	);
}

function ToolResultBlock({ result }: { result: Record<string, unknown> }) {
	const [expanded, setExpanded] = useState(false);

	// Generate a summary based on common patterns
	const summary = generateResultSummary(result);

	return (
		<div className="rounded-md border border-zinc-700/50 bg-zinc-800/50 text-sm">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-700/30"
			>
				<Wrench className="h-3.5 w-3.5 text-emerald-400" />
				<span className="text-zinc-300">{summary}</span>
				<span className="ml-auto text-zinc-500">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="border-t border-zinc-700/50 px-3 py-2 text-xs text-zinc-400 overflow-x-auto max-h-64 overflow-y-auto">
					{JSON.stringify(result, null, 2)}
				</pre>
			)}
		</div>
	);
}

function generateResultSummary(result: Record<string, unknown>): string {
	// Handle common result patterns

	// Search results
	if ("results" in result && Array.isArray(result.results)) {
		const count = result.results.length;
		const firstTitle = result.results[0]?.title || result.results[0]?.name;
		if (firstTitle) {
			return `Found ${count} result${count !== 1 ? "s" : ""}: "${firstTitle}"${count > 1 ? "..." : ""}`;
		}
		return `Found ${count} result${count !== 1 ? "s" : ""}`;
	}

	// Media status
	if ("status" in result && "media" in result && typeof result.media === "object") {
		const media = result.media as Record<string, unknown>;
		const title = media.title || media.name || "media";
		const status = result.status;
		const seasons = Array.isArray(media.seasons) ? media.seasons.length : 0;
		if (seasons > 0) {
			return `${title}: ${status} (${seasons} seasons)`;
		}
		return `${title}: ${status}`;
	}

	// TV/Movie with seasons
	if ("seasons" in result && Array.isArray(result.seasons)) {
		const title = result.name || result.title || "Show";
		const seasonCount = result.seasons.length;
		return `${title}: ${seasonCount} season${seasonCount !== 1 ? "s" : ""}`;
	}

	// Success/error pattern
	if ("success" in result) {
		if (result.success === false && result.error) {
			return `Failed: ${String(result.error).slice(0, 50)}`;
		}
		if (result.message) {
			return String(result.message).slice(0, 60);
		}
	}

	// Server list
	if (Array.isArray(result)) {
		return `${result.length} item${result.length !== 1 ? "s" : ""}`;
	}

	// Generic object - show first few keys
	const keys = Object.keys(result).slice(0, 3);
	return `Result: {${keys.join(", ")}${Object.keys(result).length > 3 ? "..." : ""}}`;
}
