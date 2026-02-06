import { Wrench } from "lucide-react";
import { useState } from "react";
import { generateResultSummary } from "./message-parser";

export function ToolResultBlock({ result }: { result: Record<string, unknown> }) {
	const [expanded, setExpanded] = useState(false);
	const summary = generateResultSummary(result);

	return (
		<div className="rounded border border-border bg-surface text-sm">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-elevated"
			>
				<Wrench className="h-3.5 w-3.5 text-accent" />
				<span className="text-text-secondary">{summary}</span>
				<span className="ml-auto text-text-tertiary">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="max-h-64 overflow-x-auto overflow-y-auto border-t border-border px-3 py-2 text-xs text-text-tertiary">
					{JSON.stringify(result, null, 2)}
				</pre>
			)}
		</div>
	);
}
