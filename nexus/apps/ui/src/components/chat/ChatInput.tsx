import { Send } from "lucide-react";
import { useEffect, useRef } from "react";

export function ChatInput({
	value,
	onChange,
	onSubmit,
	isLoading,
}: {
	value: string;
	onChange: (value: string) => void;
	onSubmit: () => void;
	isLoading: boolean;
}) {
	const inputRef = useRef<HTMLTextAreaElement>(null);

	// Focus on mount
	useEffect(() => {
		inputRef.current?.focus();
	}, []);

	// Re-expose ref for external focus calls
	useEffect(() => {
		if (!isLoading) {
			setTimeout(() => inputRef.current?.focus(), 100);
		}
	}, [isLoading]);

	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			onSubmit();
		}
	};

	const handleInput = (e: React.FormEvent<HTMLTextAreaElement>) => {
		const target = e.currentTarget;
		target.style.height = "auto";
		target.style.height = `${Math.min(target.scrollHeight, 160)}px`;
		target.style.overflow = target.scrollHeight > 160 ? "auto" : "hidden";
	};

	return (
		<div className="border-t border-border p-3">
			<div className="flex gap-2">
				<textarea
					ref={inputRef}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onKeyDown={handleKeyDown}
					onInput={handleInput}
					placeholder="Ask something..."
					rows={1}
					className="max-h-40 min-h-[42px] flex-1 resize-none rounded border border-border bg-surface px-3 py-2 text-sm text-text-primary placeholder-text-tertiary focus:border-accent focus:outline-none"
					disabled={isLoading}
					style={{ height: "auto", overflow: "hidden" }}
				/>
				<button
					type="button"
					onClick={onSubmit}
					disabled={!value.trim() || isLoading}
					className={`self-end rounded bg-accent px-3 py-2 text-white transition-colors hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50 ${
						isLoading ? "animate-pulse" : ""
					}`}
				>
					<Send className="h-5 w-5" />
				</button>
			</div>
		</div>
	);
}
