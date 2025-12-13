import { cn } from "@/lib/utils";

interface PageHeaderProps {
	title: string;
	description?: string;
	actions?: React.ReactNode;
	className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
	return (
		<div className={cn("mb-6", className)}>
			<div className="flex flex-wrap justify-between items-center gap-x-4 gap-y-2">
				<h1 className="text-2xl md:text-3xl font-semibold tracking-tight">{title}</h1>
				{actions && <div className="flex items-center gap-2">{actions}</div>}
			</div>
			{description && (
				<p className="mt-2 text-sm text-text-secondary max-w-xl">{description}</p>
			)}
		</div>
	);
}
