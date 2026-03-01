import type { UIMessage } from "@tanstack/ai-react";
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
			<div className="flex h-full flex-col items-center justify-center gap-3">
				<div className="h-8 w-8 rounded-lg bg-accent/20 flex items-center justify-center">
					<div className="h-3 w-3 rounded-sm bg-accent" />
				</div>
				<p className="font-display text-sm text-text-tertiary">Ask the machine...</p>
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
