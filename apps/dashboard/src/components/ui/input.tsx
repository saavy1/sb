import type * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
	return (
		<input
			type={type}
			data-slot="input"
			className={cn(
				"h-9 w-full min-w-0 rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary transition-colors duration-150 outline-none",
				"placeholder:text-text-tertiary",
				"focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:border-accent",
				"disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				"file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium",
				className
			)}
			{...props}
		/>
	);
}

export { Input };
