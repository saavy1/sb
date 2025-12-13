import { cn } from "@/lib/utils";

interface PageHeaderProps {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
	return (
		<div className={cn("flex items-start justify-between mb-8", className)}>
			<div>
				<h1 className="text-2xl font-semibold">{title}</h1>
				{description && <p className="mt-1 text-sm text-[var(--text-secondary)]">{description}</p>}
			</div>
			{actions && <div className="flex items-center gap-3">{actions}</div>}
		</div>
	);
}
