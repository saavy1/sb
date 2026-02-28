import { Wrench } from "lucide-react";
import { useState } from "react";

export function ToolResultBlock({ content }: { content: string }) {
	const [expanded, setExpanded] = useState(false);

	// Try to parse as JSON for pretty display
	let displayContent = content;
	let summary = content.slice(0, 80);
	try {
		const parsed = JSON.parse(content);
		displayContent = JSON.stringify(parsed, null, 2);
		summary = generateSummary(parsed);
	} catch {
		// Not JSON, use raw content
	}

	return (
		<div className="rounded border border-border bg-surface text-sm">
			<button
				type="button"
				onClick={() => setExpanded(!expanded)}
				className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-surface-elevated"
			>
				<Wrench className="h-3.5 w-3.5 text-accent" />
				<span className="text-text-secondary truncate">{summary}</span>
				<span className="ml-auto text-text-tertiary">{expanded ? "▼" : "▶"}</span>
			</button>
			{expanded && (
				<pre className="max-h-64 overflow-x-auto overflow-y-auto border-t border-border px-3 py-2 text-xs text-text-tertiary">
					{displayContent}
				</pre>
			)}
		</div>
	);
}

function generateSummary(result: unknown): string {
	if (typeof result !== "object" || result === null) {
		return String(result).slice(0, 80);
	}

	const obj = result as Record<string, unknown>;

	if ("results" in obj && Array.isArray(obj.results)) {
		const count = obj.results.length;
		const firstTitle = (obj.results[0] as Record<string, unknown>)?.title || (obj.results[0] as Record<string, unknown>)?.name;
		if (firstTitle) {
			return `Found ${count} result${count !== 1 ? "s" : ""}: "${firstTitle}"${count > 1 ? "..." : ""}`;
		}
		return `Found ${count} result${count !== 1 ? "s" : ""}`;
	}

	if ("success" in obj) {
		if (obj.success === false && obj.error) {
			return `Failed: ${String(obj.error).slice(0, 50)}`;
		}
		if (obj.message) {
			return String(obj.message).slice(0, 60);
		}
	}

	const keys = Object.keys(obj).slice(0, 3);
	return `Result: {${keys.join(", ")}${Object.keys(obj).length > 3 ? "..." : ""}}`;
}
