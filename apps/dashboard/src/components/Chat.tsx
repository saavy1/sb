import { fetchServerSentEvents, useChat } from "@tanstack/ai-react";
import { Bot, Loader2, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Markdown from "react-markdown";
import { z } from "zod";
import { API_URL, client } from "../lib/api";

// Zod schemas for TanStack AI message parts (loose types from library)
const MessagePartSchema = z.object({
	type: z.string(),
	content: z.string().optional(),
	text: z.string().optional(),
	name: z.string().optional(),
	toolName: z.string().optional(),
	id: z.string().optional(),
});

const UIMessageSchema = z.object({
	id: z.string(),
	role: z.enum(["user", "assistant"]),
	content: z.string().nullish(),
	parts: z.array(MessagePartSchema).nullish(),
});

type MessagePart = z.infer<typeof MessagePartSchema>;
type UIMessage = z.infer<typeof UIMessageSchema>;

// Type for API message response
type ApiMessage = {
	id: string;
	role: string;
	content: string | null;
	parts: unknown[] | null;
	createdAt: string;
};

type Props = {
	conversationId?: string;
	onConversationChange?: (id: string | null) => void;
};

export function Chat({ conversationId, onConversationChange }: Props) {
	const [input, setInput] = useState("");
	const [activeConversationId, setActiveConversationId] = useState<string | null>(
		conversationId ?? null
	);
	const lastMessageCountRef = useRef(0);

	const { messages, sendMessage, isLoading, error, setMessages } = useChat({
		connection: fetchServerSentEvents(`${API_URL}/api/ai/chat`),
	});

	// Load conversation messages when switching
	useEffect(() => {
		if (!activeConversationId) {
			setMessages([]);
			lastMessageCountRef.current = 0;
			return;
		}

		const loadConversation = async () => {
			const { data } = await client.api.conversations({ id: activeConversationId }).get();
			if (data && "messages" in data && Array.isArray(data.messages)) {
				const uiMessages = data.messages.map((m: ApiMessage) => ({
					id: m.id,
					role: m.role as "user" | "assistant",
					parts: (m.parts as MessagePart[]) || [{ type: "text", content: m.content ?? undefined }],
				}));
				// Cast needed due to TanStack AI's internal UIMessage type
				setMessages(uiMessages as unknown as Parameters<typeof setMessages>[0]);
				lastMessageCountRef.current = uiMessages.length;
			}
		};

		loadConversation();
	}, [activeConversationId, setMessages]);

	// Save new messages to backend
	useEffect(() => {
		if (!activeConversationId || messages.length <= lastMessageCountRef.current) return;

		const saveNewMessages = async () => {
			const newMessages = messages.slice(lastMessageCountRef.current);
			for (const msg of newMessages) {
				const typedMsg = msg as unknown as UIMessage;
				await client.api.conversations({ id: activeConversationId }).messages.post({
					role: msg.role,
					content: typedMsg.content ?? undefined,
					parts: typedMsg.parts ?? undefined,
				});
			}
			lastMessageCountRef.current = messages.length;
		};

		if (!isLoading) {
			saveNewMessages();
		}
	}, [messages, isLoading, activeConversationId]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		if (!input.trim() || isLoading) return;

		// Create conversation if none active
		if (!activeConversationId) {
			const { data } = await client.api.conversations.post({});
			if (data && "id" in data) {
				setActiveConversationId(data.id);
				onConversationChange?.(data.id);
			}
		}

		sendMessage(input);
		setInput("");
	};

	return (
		<div className="flex h-full flex-col">
			{/* Messages area */}
			<div className="flex-1 space-y-4 overflow-y-auto p-4">
				{messages.length === 0 && (
					<div className="flex h-full flex-col items-center justify-center text-zinc-500">
						<Bot className="mb-4 h-12 w-12" />
						<p className="text-lg font-medium">The Machine</p>
						<p className="text-sm">Ask me about your homelab</p>
					</div>
				)}

				{messages.map((message) => (
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
							<MessageContent message={message} />
						</div>

						{message.role === "user" && (
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-600">
								<User className="h-4 w-4 text-zinc-300" />
							</div>
						)}
					</div>
				))}

				{isLoading && messages.length > 0 && messages[messages.length - 1]?.role === "user" && (
					<div className="flex gap-3">
						<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/20">
							<Loader2 className="h-4 w-4 animate-spin text-emerald-400" />
						</div>
						<div className="rounded-lg bg-zinc-800 px-4 py-2 text-zinc-400">Thinking...</div>
					</div>
				)}

				{error && (
					<div className="rounded-lg bg-red-900/20 px-4 py-2 text-red-400">
						Error: {error.message}
					</div>
				)}
			</div>

			{/* Input area */}
			<form onSubmit={handleSubmit} className="border-t border-zinc-800 p-4">
				<div className="flex gap-2">
					<input
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

function MessageContent({ message: rawMessage }: { message: unknown }) {
	// Cast to our local type - TanStack AI's internal types are complex
	const message = rawMessage as UIMessage;
	// Clean DeepSeek tool call markers from text
	const cleanText = (text: string): string => {
		return text
			.replace(/<｜tool▁calls▁begin｜>[\s\S]*?<｜tool▁calls▁end｜>/g, "")
			.replace(/<｜tool▁call▁begin｜>[\s\S]*?<｜tool▁call▁end｜>/g, "")
			.replace(/```json\s*\{\s*\}\s*```/g, "")
			.trim();
	};

	// Extract text content from various possible formats
	const getTextContent = (): string | null => {
		// Direct content string
		if (typeof message.content === "string" && message.content) {
			return cleanText(message.content);
		}

		// Parts array - check for text parts
		if (Array.isArray(message.parts)) {
			// Try type: "text" with content property (TanStack AI format)
			let textParts = message.parts
				.filter((p) => p.type === "text" && p.content)
				.map((p) => cleanText(p.content ?? ""))
				.filter((t) => t)
				.join("\n\n");
			if (textParts) return textParts;

			// Try type: "text" with text property
			textParts = message.parts
				.filter((p) => p.type === "text" && p.text)
				.map((p) => cleanText(p.text ?? ""))
				.filter((t) => t)
				.join("\n\n");
			if (textParts) return textParts;
		}

		return null;
	};

	const textContent = getTextContent();
	const toolParts = Array.isArray(message.parts)
		? message.parts.filter((p) => p.type === "tool-call" || p.type === "tool-result")
		: [];

	return (
		<>
			{textContent && (
				<div className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-code:text-emerald-400 prose-code:before:content-none prose-code:after:content-none">
					<Markdown>{textContent}</Markdown>
				</div>
			)}
			{toolParts.map((part) => {
				if (part.type === "tool-call") {
					return (
						<div
							key={part.id ?? part.name ?? part.toolName}
							className="my-1 rounded bg-zinc-700/50 px-2 py-1 text-xs text-zinc-400"
						>
							⚡ {part.name || part.toolName}
						</div>
					);
				}
				return null;
			})}
			{!textContent && toolParts.length === 0 && <p className="text-zinc-500">...</p>}
		</>
	);
}
