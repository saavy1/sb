import type { ServerStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

type Status = ServerStatus | "unknown";

const statusColors: Record<Status, string> = {
	running: "bg-status-running",
	starting: "bg-status-starting",
	stopping: "bg-status-stopping",
	stopped: "bg-status-stopped",
	error: "bg-status-error",
	unknown: "bg-status-unknown",
};

const sizes = {
	sm: "w-1.5 h-1.5",
	md: "w-2 h-2",
	lg: "w-2.5 h-2.5",
};

interface StatusDotProps {
	status: Status;
	pulse?: boolean;
	size?: "sm" | "md" | "lg";
	className?: string;
}

export function StatusDot({ status, pulse, size = "md", className }: StatusDotProps) {
	const isTransitioning = status === "starting" || status === "stopping";

	return (
		<span className={cn("relative inline-flex shrink-0", className)}>
			<span
				className={cn(
					"inline-block rounded-full",
					sizes[size],
					statusColors[status],
					(pulse || isTransitioning) && "animate-pulse"
				)}
			/>
			{isTransitioning && (
				<span
					className={cn(
						"absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping",
						statusColors[status]
					)}
				/>
			)}
		</span>
	);
}
