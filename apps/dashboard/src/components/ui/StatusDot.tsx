import { cn } from "@/lib/utils";

type Status = "running" | "starting" | "stopping" | "stopped" | "error" | "unknown";

const statusColors: Record<Status, string> = {
	running: "bg-[var(--status-running)]",
	starting: "bg-[var(--status-starting)]",
	stopping: "bg-[var(--status-stopping)]",
	stopped: "bg-[var(--status-stopped)]",
	error: "bg-[var(--status-error)]",
	unknown: "bg-[var(--status-unknown)]",
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
