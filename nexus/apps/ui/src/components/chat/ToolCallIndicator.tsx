import { Loader2 } from "lucide-react";

type ToolCall = {
	toolName: string;
	status: "calling" | "complete" | "error";
	args?: Record<string, unknown>;
};

export function ToolCallIndicator({ toolCalls }: { toolCalls: Map<string, ToolCall> }) {
	if (toolCalls.size === 0) return null;

	return (
		<div className="space-y-1 py-1">
			{Array.from(toolCalls.values()).map((tc) => (
				<div key={tc.toolName} className="flex items-center gap-2 px-3 py-1.5 text-sm">
					<span className="text-text-tertiary">$</span>
					<Loader2 className="h-3 w-3 animate-spin text-accent" />
					<span className="text-accent">{tc.toolName}</span>
				</div>
			))}
		</div>
	);
}
