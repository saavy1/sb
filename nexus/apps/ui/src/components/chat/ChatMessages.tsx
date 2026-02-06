import { Check, Copy, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessage } from "./ChatMessage";
import { ToolCallIndicator } from "./ToolCallIndicator";

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

export function ChatMessages({
	messages,
	isLoading,
	error,
	activeToolCalls,
}: {
	messages: Message[];
	isLoading: boolean;
	error: string | null;
	activeToolCalls: Map<string, ToolCall>;
}) {
	const messagesEndRef = useRef<HTMLDivElement>(null);
	const [copied, setCopied] = useState(false);

	// Scroll to bottom on new messages
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	const handleCopyAll = useCallback(async () => {
		const formatted = messages
			.filter((m) => m.role !== "system")
			.map((m) => {
				const role = m.role === "user" ? "User" : "Assistant";
				const cleanContent = m.content.replace(/\n\s*\{[\s\S]*?\}\s*(?=\n|$)/g, "").trim();
				return `${role}: ${cleanContent}`;
			})
			.join("\n\n");

		await navigator.clipboard.writeText(formatted);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [messages]);

	// Empty state
	if (messages.length === 0 && !isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<p className="text-text-tertiary text-sm">Ask something...</p>
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col">
			{/* Copy button */}
			{messages.length > 0 && (
				<div className="flex items-center justify-end px-3 py-1.5 border-b border-border">
					<button
						type="button"
						onClick={handleCopyAll}
						className="flex items-center gap-1.5 rounded px-2 py-1 text-xs text-text-tertiary transition-colors hover:bg-surface-elevated hover:text-text-secondary"
					>
						{copied ? (
							<>
								<Check className="h-3 w-3 text-success" />
								<span className="text-success">Copied</span>
							</>
						) : (
							<>
								<Copy className="h-3 w-3" />
								<span className="hidden sm:inline">Copy all</span>
							</>
						)}
					</button>
				</div>
			)}

			{/* Messages */}
			<ScrollArea className="flex-1">
				<div className="space-y-1 py-2">
					{messages.map((message) => (
						<ChatMessage key={message.id} message={message} />
					))}

					<ToolCallIndicator toolCalls={activeToolCalls} />

					{isLoading &&
						activeToolCalls.size === 0 &&
						(messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
							<div className="flex items-center gap-2 px-3 py-2 text-sm text-text-tertiary">
								<span>$</span>
								<Loader2 className="h-3 w-3 animate-spin" />
								<span>thinking...</span>
							</div>
						)}

					{error && (
						<div className="mx-3 rounded border border-error/30 bg-error-bg px-3 py-2 text-sm text-error">
							{error}
						</div>
					)}

					<div ref={messagesEndRef} />
				</div>
			</ScrollArea>
		</div>
	);
}
