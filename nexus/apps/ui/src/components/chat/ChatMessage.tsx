import type { UIMessage } from "@tanstack/ai-react";
import { Bell } from "lucide-react";
import Markdown from "react-markdown";
import { ToolCallIndicator } from "./ToolCallIndicator";
import { ToolResultBlock } from "./ToolResultBlock";
import { ToolErrorBlock } from "./ToolErrorBlock";

export function ChatMessage({ message }: { message: UIMessage }) {
	if (message.role === "system") {
		return (
			<div className="flex justify-center py-1">
				<div className="flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-xs text-accent">
					<Bell className="h-3 w-3" />
					<span>{getTextContent(message)}</span>
				</div>
			</div>
		);
	}

	if (message.role === "user") {
		return (
			<div className="border-l-2 border-accent bg-accent/5 px-3 py-2">
				<div className="text-sm text-text-primary whitespace-pre-wrap">
					{getTextContent(message)}
				</div>
			</div>
		);
	}

	// Assistant - render parts
	return (
		<div className="px-3 py-2">
			<MessageParts message={message} />
		</div>
	);
}

function getTextContent(message: UIMessage): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => (p as { type: "text"; content: string }).content)
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
						const textPart = part as { type: "text"; content: string };
						if (!textPart.content.trim()) return null;
						return (
							<div
								key={`text-${i}`}
								className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-surface prose-pre:border prose-pre:border-border prose-code:text-accent prose-code:before:content-none prose-code:after:content-none"
							>
								<Markdown>{textPart.content}</Markdown>
							</div>
						);
					}

					case "tool-call": {
						const toolPart = part as {
							type: "tool-call";
							id: string;
							name: string;
							state: string;
						};
						return (
							<ToolCallIndicator
								key={`tool-${toolPart.id}`}
								name={toolPart.name}
								state={toolPart.state}
							/>
						);
					}

					case "tool-result": {
						const resultPart = part as {
							type: "tool-result";
							toolCallId: string;
							content: string;
							state: string;
							error?: string;
						};
						if (resultPart.state === "error" || resultPart.error) {
							return (
								<ToolErrorBlock
									key={`result-${resultPart.toolCallId}`}
									error={resultPart.error || resultPart.content}
								/>
							);
						}
						return (
							<ToolResultBlock
								key={`result-${resultPart.toolCallId}`}
								content={resultPart.content}
							/>
						);
					}

					case "thinking": {
						const thinkingPart = part as { type: "thinking"; content: string };
						return (
							<div
								key={`thinking-${i}`}
								className="rounded border border-border/50 bg-surface/50 px-3 py-2 text-xs text-text-tertiary italic"
							>
								{thinkingPart.content}
							</div>
						);
					}

					default:
						return null;
				}
			})}
		</div>
	);
}
