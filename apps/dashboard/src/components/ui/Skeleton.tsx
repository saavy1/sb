import { cn } from "@/lib/utils";

interface SkeletonProps {
	className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
	return <div className={cn("animate-pulse rounded bg-surface-elevated", className)} />;
}

export function SkeletonText({ className, lines = 1 }: SkeletonProps & { lines?: number }) {
	return (
		<div className={cn("space-y-2", className)}>
			{Array.from({ length: lines }).map((_, i) => (
				<Skeleton
					key={i}
					className={cn("h-4", i === lines - 1 && lines > 1 ? "w-3/4" : "w-full")}
				/>
			))}
		</div>
	);
}

export function SkeletonCard({ className }: SkeletonProps) {
	return (
		<div className={cn("border border-border rounded p-3 space-y-3", className)}>
			<Skeleton className="h-4 w-1/3" />
			<div className="space-y-2">
				<Skeleton className="h-3 w-full" />
				<Skeleton className="h-3 w-4/5" />
			</div>
		</div>
	);
}

export function SkeletonRow({ className }: SkeletonProps) {
	return (
		<div className={cn("flex items-center gap-3 py-2", className)}>
			<Skeleton className="w-2 h-2 rounded-full" />
			<Skeleton className="h-4 flex-1" />
			<Skeleton className="h-4 w-16" />
		</div>
	);
}

export function SkeletonStats({ className }: SkeletonProps) {
	return (
		<div className={cn("flex items-center gap-6", className)}>
			{Array.from({ length: 4 }).map((_, i) => (
				<div key={i} className="flex items-center gap-2">
					<Skeleton className="h-3 w-8" />
					<Skeleton className="h-4 w-12" />
				</div>
			))}
		</div>
	);
}
