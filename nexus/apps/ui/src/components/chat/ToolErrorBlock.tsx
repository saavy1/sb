import { useState } from "react";

export function ToolErrorBlock({ error, toolName }: { error: string; toolName?: string }) {
	const [expanded, setExpanded] = useState(false);

	const mainError = error.includes("Input validation failed")
		? "Input validation failed"
		: error.slice(0, 100);

	return (
		<div className="rounded border border-error/30 bg-error-bg text-sm">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-error-bg"
			>
				<span className="text-error">✕</span>
				{toolName && <span className="text-error/80">{toolName}</span>}
				<span className="text-error/60">{mainError}</span>
				<span className="ml-auto text-error/40">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="overflow-x-auto border-t border-error/30 px-3 py-2 text-xs text-error/60">
					{error}
				</pre>
			)}
		</div>
	);
}
