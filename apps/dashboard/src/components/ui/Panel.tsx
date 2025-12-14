import type { ReactNode } from "react";

interface PanelProps {
	title: ReactNode;
	children: ReactNode;
	actions?: ReactNode;
	className?: string;
}

export function Panel({ title, children, actions, className = "" }: PanelProps) {
	return (
		<section className={`border border-border rounded bg-surface ${className}`}>
			<header className="flex items-center justify-between px-3 py-2 border-b border-border bg-surface-elevated/50">
				<h2 className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
					{title}
				</h2>
				{actions && <div className="flex items-center gap-1">{actions}</div>}
			</header>
			<div className="p-3">{children}</div>
		</section>
	);
}

interface PanelRowProps {
	label: string;
	value: ReactNode;
	mono?: boolean;
}

export function PanelRow({ label, value, mono = false }: PanelRowProps) {
	return (
		<div className="flex items-center justify-between py-1 text-sm">
			<span className="text-text-tertiary">{label}</span>
			<span className={mono ? "font-mono text-text-secondary" : "text-text-primary"}>{value}</span>
		</div>
	);
}

interface StatBlockProps {
	label: string;
	value: string | number;
	unit?: string;
	status?: "normal" | "warning" | "error";
}

export function StatBlock({ label, value, unit, status = "normal" }: StatBlockProps) {
	const statusColors = {
		normal: "text-text-primary",
		warning: "text-warning",
		error: "text-error",
	};

	return (
		<div className="text-center">
			<div className={`text-lg font-semibold tabular-nums ${statusColors[status]}`}>
				{value}
				{unit && <span className="text-xs text-text-tertiary ml-0.5">{unit}</span>}
			</div>
			<div className="text-[10px] uppercase tracking-wider text-text-tertiary">{label}</div>
		</div>
	);
}
