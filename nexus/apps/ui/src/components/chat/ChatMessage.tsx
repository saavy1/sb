import { Bell } from "lucide-react";
import Markdown from "react-markdown";
import { parseMessageContent } from "./message-parser";
import { ToolErrorBlock } from "./ToolErrorBlock";
import { ToolResultBlock } from "./ToolResultBlock";

type Message = {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
};

export function ChatMessage({ message }: { message: Message }) {
	if (message.role === "system") {
		return (
			<div className="flex justify-center py-1">
				<div className="flex items-center gap-2 rounded-full bg-accent/10 px-4 py-1.5 text-xs text-accent">
					<Bell className="h-3 w-3" />
					<span>{message.content}</span>
				</div>
			</div>
		);
	}

	if (message.role === "user") {
		return (
			<div className="border-l-2 border-accent bg-accent/5 px-3 py-2">
				<div className="text-sm text-text-primary whitespace-pre-wrap">{message.content}</div>
			</div>
		);
	}

	// Assistant
	return (
		<div className="px-3 py-2">
			<MessageContent content={message.content} />
		</div>
	);
}

function MessageContent({ content }: { content: string }) {
	const segments = parseMessageContent(content);

	if (segments.length === 0) {
		return <span className="text-text-tertiary">...</span>;
	}

	return (
		<div className="space-y-2">
			{segments.map((segment) => {
				if (segment.type === "text") {
					if (!segment.content.trim()) return null;
					return (
						<div
							key={segment.key}
							className="prose prose-invert prose-sm max-w-none prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-ol:my-1 prose-li:my-0 prose-pre:bg-surface prose-pre:border prose-pre:border-border prose-code:text-accent prose-code:before:content-none prose-code:after:content-none"
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
