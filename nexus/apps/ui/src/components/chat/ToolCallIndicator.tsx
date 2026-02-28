import { Check, Loader2 } from "lucide-react";

export function ToolCallIndicator({ name, state }: { name: string; state: string }) {
	const isComplete = state === "input-complete" || state === "approval-responded";

	return (
		<div className="flex items-center gap-2 px-3 py-1.5 text-sm">
			<span className="text-text-tertiary">$</span>
			{isComplete ? (
				<Check className="h-3 w-3 text-success" />
			) : (
				<Loader2 className="h-3 w-3 animate-spin text-accent" />
			)}
			<span className="text-accent">{name}</span>
		</div>
	);
}
