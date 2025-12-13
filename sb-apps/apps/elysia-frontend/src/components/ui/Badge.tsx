import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

type Variant = "success" | "warning" | "error" | "info" | "default";
type Status = "running" | "starting" | "stopping" | "stopped" | "error";

const variantStyles: Record<Variant, string> = {
  success: "bg-[var(--success-bg)] text-[var(--success)]",
  warning: "bg-[var(--warning-bg)] text-[var(--warning)]",
  error: "bg-[var(--error-bg)] text-[var(--error)]",
  info: "bg-[var(--info-bg)] text-[var(--info)]",
  default: "bg-[var(--surface)] text-[var(--text-secondary)]",
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
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium",
        variantStyles[resolvedVariant],
        className
      )}
    >
      {showDot && status && <StatusDot status={status} />}
      {children}
    </span>
  );
}
