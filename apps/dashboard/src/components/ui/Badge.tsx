import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

type Variant = "success" | "warning" | "error" | "info" | "default";
type Status = "running" | "starting" | "stopping" | "stopped" | "error";

const variantStyles: Record<Variant, string> = {
	success: "bg-success-bg text-success",
	warning: "bg-warning-bg text-warning",
	error: "bg-error-bg text-error",
	info: "bg-info-bg text-info",
	default: "bg-surface text-text-secondary",
};

const statusToVariant: Record<Status, Variant> = {
	running: "success",
	starting: "warning",
	stopping: "warning",
	stopped: "error",
	error: "error",
};

interface BadgeProps {
	children: React.ReactNode;
	variant?: Variant;
	status?: Status;
	showDot?: boolean;
	className?: string;
}

export function Badge({ children, variant, status, showDot, className }: BadgeProps) {
	const resolvedVariant = status ? statusToVariant[status] : (variant ?? "default");

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full text-xs font-medium",
				"px-2 py-0.5",
				variantStyles[resolvedVariant],
				className
			)}
		>
			{showDot && status && <StatusDot status={status} />}
			{children}
		</span>
	);
}
