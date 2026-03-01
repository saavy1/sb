import type { UIMessage } from "@tanstack/ai-react";
import { Bell, Check, Copy } from "lucide-react";
import { useCallback, useState } from "react";
import Markdown from "react-markdown";
import { ToolCallIndicator } from "./ToolCallIndicator";
import { ToolErrorBlock } from "./ToolErrorBlock";
import { ToolResultBlock } from "./ToolResultBlock";

function MachineAvatar() {
	return (
		<div className="mt-0.5 h-6 w-6 shrink-0 rounded bg-accent/20 flex items-center justify-center">
			<div className="h-2 w-2 rounded-sm bg-accent" />
		</div>
	);
}

export function ChatMessage({ message }: { message: UIMessage }) {
	if (message.role === "system") {
		return (
			<div className="flex justify-center py-1">
				<div className="flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-xs font-display text-accent">
					<Bell className="h-3 w-3" />
					<span>{getTextContent(message)}</span>
				</div>
			</div>
		);
	}

	if (message.role === "user") {
		return (
			<div className="flex justify-end px-4 py-1">
				<div className="max-w-[70%] rounded-2xl rounded-br-md bg-accent/15 px-4 py-2.5">
					<div className="text-sm text-text-primary whitespace-pre-wrap">
						{getTextContent(message)}
					</div>
				</div>
			</div>
		);
	}

	// Assistant - render parts with avatar and copy button
	return (
		<div className="group flex justify-start gap-2.5 px-4 py-1">
			<MachineAvatar />
			<div className="relative max-w-[85%] min-w-0">
				<MessageParts message={message} />
				<CopyButton text={getTextContent(message)} />
			</div>
		</div>
	);
}

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	const handleCopy = useCallback(async () => {
		if (!text.trim()) return;
		await navigator.clipboard.writeText(text);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}, [text]);

	if (!text.trim()) return null;

	return (
		<button
			type="button"
			onClick={handleCopy}
			className="absolute -bottom-5 right-0 flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 hover:text-text-secondary"
		>
			{copied ? <Check className="h-3 w-3 text-success" /> : <Copy className="h-3 w-3" />}
		</button>
	);
}

function getTextContent(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => ("content" in p ? p.content : ""))
		.join("");
}

function MessageParts({ message }: { message: UIMessage }) {
	const parts = message.parts;

	if (parts.length === 0) {
		return <span className="text-text-tertiary">...</span>;
	}

	return (
		<div className="space-y-2">
			{parts.map((part, i) => {
				switch (part.type) {
					case "text": {
						if (!part.content.trim()) return null;
						return (
							<div
								key={`text-${i}`}
								className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-surface prose-pre:border prose-pre:border-border prose-code:text-accent prose-code:before:content-none prose-code:after:content-none"
							>
								<Markdown>{part.content}</Markdown>
							</div>
						);
					}

					case "tool-call":
						return (
							<ToolCallIndicator key={`tool-${part.id}`} name={part.name} state={part.state} />
						);

					case "tool-result": {
						if (part.state === "error" || part.error) {
							return (
								<ToolErrorBlock
									key={`result-${part.toolCallId}`}
									error={part.error || part.content}
								/>
							);
						}
						return <ToolResultBlock key={`result-${part.toolCallId}`} content={part.content} />;
					}

					case "thinking":
						return (
							<div
								key={`thinking-${i}`}
								className="rounded border border-border/50 bg-surface/50 px-3 py-2 text-xs text-text-tertiary italic"
							>
								{part.content}
							</div>
						);

					default:
						return null;
				}
			})}
		</div>
	);
}
