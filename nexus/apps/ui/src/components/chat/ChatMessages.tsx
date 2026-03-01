import type { UIMessage } from "@tanstack/ai-react";
import { Loader2 } from "lucide-react";
import { useEffect, useRef } from "react";
import { ScrollArea } from "../ui/scroll-area";
import { ChatMessage } from "./ChatMessage";

export function ChatMessages({
	messages,
	isLoading,
	error,
}: {
	messages: UIMessage[];
	isLoading: boolean;
	error: string | null;
}) {
	const messagesEndRef = useRef<HTMLDivElement>(null);

	// Scroll to bottom on new messages
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional trigger on messages change
	useEffect(() => {
		messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
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
		<ScrollArea className="h-full">
			<div className="space-y-1 py-4">
				{messages.map((message) => (
					<ChatMessage key={message.id} message={message} />
				))}

				{isLoading && (messages.length === 0 || messages[messages.length - 1]?.role === "user") && (
					<div className="flex items-center gap-2 px-4 py-2 text-sm text-text-tertiary">
						<Loader2 className="h-3 w-3 animate-spin" />
						<span>thinking...</span>
					</div>
				)}

				{error && (
					<div className="mx-4 rounded border border-error/30 bg-error-bg px-3 py-2 text-sm text-error">
						{error}
					</div>
				)}

				<div ref={messagesEndRef} />
			</div>
		</ScrollArea>
	);
}
