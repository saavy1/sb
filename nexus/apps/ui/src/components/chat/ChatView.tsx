import type { UIMessage } from "@tanstack/ai-client";
import { fetchServerSentEvents, modelMessagesToUIMessages } from "@tanstack/ai-client";
import { Chat, ChatInput, ChatMessages, useChatContext } from "@tanstack/ai-react-ui";
import { Send } from "lucide-react";
import type { MutableRefObject, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { API_URL, client } from "../../lib/api";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessage } from "./ChatMessage";

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
			knownThreadRef.current = undefined;
			setSessionId(crypto.randomUUID());
			setInitialMessages([]);
			setLoading(false);
			return;
		}

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
	const threadIdRef = useRef(threadId);

	return (
		<Chat
			connection={fetchServerSentEvents(
				() =>
					`${API_URL}/api/agent/chat${threadIdRef.current ? `?threadId=${threadIdRef.current}` : ""}`
			)}
			initialMessages={initialMessages}
			className="flex h-full flex-col"
		>
			<ChatContent threadIdRef={threadIdRef} onThreadCreated={onThreadCreated} />
		</Chat>
	);
}

function ChatContent({
	threadIdRef,
	onThreadCreated,
}: {
	threadIdRef: MutableRefObject<string | null>;
	onThreadCreated: (id: string) => void;
}) {
	const { messages, isLoading, error } = useChatContext();
	const [submitError, setSubmitError] = useState<string | null>(null);

	// Persist messages when streaming finishes
	const wasLoading = useRef(false);
	useEffect(() => {
		if (wasLoading.current && !isLoading && threadIdRef.current) {
			fetch(`${API_URL}/api/agent/threads/${threadIdRef.current}/persist`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ messages }),
			}).catch((err) => console.error("Failed to persist messages:", err));
		}
		wasLoading.current = isLoading;
	}, [isLoading, messages, threadIdRef]);

	return (
		<>
			<div className="flex-1 overflow-hidden">
				<ScrollArea className="h-full">
					<ChatMessages
						className="space-y-1 py-4"
						emptyState={
							<div className="flex h-full flex-col items-center justify-center gap-3 py-20">
								<div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
									<div className="h-3 w-3 rounded-sm bg-accent" />
								</div>
								<p className="font-display text-sm text-text-tertiary">Ask the machine...</p>
							</div>
						}
					>
						{(message) => <ChatMessage message={message} />}
					</ChatMessages>

					<LoadingDots />
					<div className="h-1" />
				</ScrollArea>
			</div>

			{(submitError || error) && (
				<div className="mx-4 rounded border border-error/30 bg-error-bg px-3 py-2 text-sm text-error">
					{submitError ?? error?.message}
				</div>
			)}

			<ChatInput>
				{({ value, onChange, onSubmit, isLoading: inputLoading, inputRef }) => (
					<StyledInput
						value={value}
						onChange={onChange}
						isLoading={inputLoading}
						inputRef={inputRef as RefObject<HTMLTextAreaElement | null>}
						onSubmit={async () => {
							if (!value.trim() || inputLoading) return;
							setSubmitError(null);
							try {
								if (!threadIdRef.current) {
									const { data } = await client.api.agent.threads.post({
										source: "chat",
									});
									if (data && "id" in data) {
										threadIdRef.current = data.id;
										onThreadCreated(data.id);
									} else {
										throw new Error("Failed to create thread");
									}
								}
								onSubmit();
							} catch (err) {
								const message = err instanceof Error ? err.message : "Failed to send message";
								console.error("Failed to send message:", err);
								setSubmitError(message);
							}
						}}
					/>
				)}
			</ChatInput>
		</>
	);
}

function LoadingDots() {
	const { messages, isLoading } = useChatContext();
	const showDots =
		isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user");
	if (!showDots) return null;

	return (
		<div className="flex items-center gap-2.5 px-4 py-2">
			<div className="mt-0.5 h-6 w-6 shrink-0 rounded bg-accent/20 flex items-center justify-center">
				<div className="h-2 w-2 rounded-sm bg-accent animate-pulse" />
			</div>
			<div className="flex items-center gap-1">
				<span className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent/60" />
				<span
					className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent/60"
					style={{ animationDelay: "0.15s" }}
				/>
				<span
					className="thinking-dot h-1.5 w-1.5 rounded-full bg-accent/60"
					style={{ animationDelay: "0.3s" }}
				/>
			</div>
		</div>
	);
}

function StyledInput({
	value,
	onChange,
	onSubmit,
	isLoading,
	inputRef,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isLoading: boolean;
	inputRef: RefObject<HTMLTextAreaElement | null>;
}) {
	// Focus on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, [inputRef]);

	// Re-focus after response
	useEffect(() => {
		if (!isLoading) {
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [isLoading, inputRef]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	};

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const target = e.currentTarget;
		target.style.height = "auto";
		target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
		target.style.overflow = target.scrollHeight > 160 ? "auto" : "hidden";
	};

	return (
		<div className="border-t border-border p-3">
			<div className="flex gap-2">
				<textarea
					ref={inputRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onInput={handleInput}
					placeholder="Ask something..."
					rows={1}
					className="max-h-40 min-h-[42px] flex-1 resize-none rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
					disabled={isLoading}
					style={{ height: "auto", overflow: "hidden" }}
				/>
				<button
					type="button"
					onClick={onSubmit}
					disabled={!value.trim() || isLoading}
					className={`self-end rounded bg-accent px-3 py-2 text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${
						isLoading ? "animate-pulse" : ""
					}`}
				>
					<Send className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}
