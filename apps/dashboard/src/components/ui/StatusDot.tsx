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

interface StatusDotProps {
	status: Status;
	pulse?: boolean;
	className?: string;
}

export function StatusDot({ status, pulse, className }: StatusDotProps) {
	return (
		<span
			className={cn(
				"inline-block w-2 h-2 rounded-full",
				statusColors[status],
				pulse && "animate-pulse",
				className
			)}
		/>
	);
}
