import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle,
	Clock,
	Loader2,
	Play,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Panel } from "../components/ui";
import { client } from "../lib/api";
import { useEvents } from "../lib/useEvents";

export const Route = createFileRoute("/debug")({
	component: DebugPage,
});

type QueueStats = {
	name: string;
	queue?: string; // Alternative field from WebSocket events
	waiting: number;
	active: number;
	completed: number;
	failed: number;
	delayed: number;
	paused?: number;
};

type JobInfo = {
	id: string;
	name: string;
	data: unknown;
	status: string;
	attemptsMade: number;
	timestamp: number;
	delay?: number;
	processedOn?: number;
	finishedOn?: number;
	failedReason?: string;
};

function DebugPage() {
	const [queues, setQueues] = useState<QueueStats[]>([]);
	const [selectedQueue, setSelectedQueue] = useState<string | null>(null);
	const [selectedStatus, setSelectedStatus] = useState<string>("delayed");
	const [jobs, setJobs] = useState<JobInfo[]>([]);
	const [loading, setLoading] = useState(true);
	const [jobsLoading, setJobsLoading] = useState(false);
	const [testDelay, setTestDelay] = useState("10");
	const fetchQueuesRef = useRef<() => void>(undefined);
	const fetchJobsRef = useRef<() => void>(undefined);
	const initialLoadDone = useRef(false);
	const selectedQueueRef = useRef(selectedQueue);
	selectedQueueRef.current = selectedQueue;

	// Subscribe to queue stats updates (real-time, no polling needed)
	useEvents("queue:stats:updated", (stats) => {
		const queueName = stats.queue;
		setQueues((prev) => {
			const exists = prev.some((q) => q.name === queueName);
			if (exists) {
				return prev.map((q) => (q.name === queueName ? { ...stats, name: queueName } : q));
			}
			return [...prev, { ...stats, name: queueName }];
		});
	});

	// Refetch jobs when jobs change
	useEvents("queue:job:added", () => {
		fetchJobsRef.current?.();
	});

	useEvents("queue:job:completed", () => {
		fetchJobsRef.current?.();
	});

	useEvents("queue:job:failed", () => {
		fetchJobsRef.current?.();
	});

	const fetchQueues = useCallback(async () => {
		try {
			const { data, error } = await client.api.debug.queues.get();
			if (error) throw error;
			if (data?.queues) {
				setQueues(data.queues);
				if (!selectedQueueRef.current && data.queues.length > 0) {
					setSelectedQueue(data.queues[0].name);
				}
			}
		} catch {
			toast.error("Failed to fetch queues");
		}
		if (!initialLoadDone.current) {
			initialLoadDone.current = true;
			setLoading(false);
		}
	}, []);

	const fetchJobs = useCallback(async () => {
		if (!selectedQueue) return;
		setJobsLoading(true);
		try {
			const { data, error } = await client.api.debug
				.queues({ name: selectedQueue })
				.jobs.get({ query: { status: selectedStatus as "delayed", limit: "50" } });
			if (error) throw error;
			if (data?.jobs) {
				setJobs(data.jobs);
			}
		} catch {
			toast.error("Failed to fetch jobs");
		}
		setJobsLoading(false);
	}, [selectedQueue, selectedStatus]);

	// Keep refs updated for WebSocket callbacks
	useEffect(() => {
		fetchQueuesRef.current = fetchQueues;
		fetchJobsRef.current = fetchJobs;
	}, [fetchQueues, fetchJobs]);

	// Initial load only - WebSocket handles updates
	useEffect(() => {
		fetchQueues();
	}, [fetchQueues]);

	useEffect(() => {
		fetchJobs();
	}, [fetchJobs]);

	const handleClean = async (status: "completed" | "failed") => {
		if (!selectedQueue) return;
		toast.promise(
			client.api.debug.queues({ name: selectedQueue }).clean.post({ query: { status } }),
			{
				loading: `Cleaning ${status} jobs...`,
				success: (res) => `Removed ${res.data?.removed ?? 0} jobs`,
				error: "Failed to clean jobs",
			}
		);
		setTimeout(() => {
			fetchQueues();
			fetchJobs();
		}, 500);
	};

	const handleAddTestJob = async () => {
		if (!selectedQueue) return;
		const delay = parseInt(testDelay, 10);
		toast.promise(
			client.api.debug.queues({ name: selectedQueue }).test.post({
				name: "test-job",
				delay: delay > 0 ? String(delay) : undefined,
				data: { test: true, createdAt: new Date().toISOString() },
			}),
			{
				loading: "Adding test job...",
				success: (res) =>
					res.data?.delay
						? `Added test job (delay: ${res.data.delay})`
						: "Added test job (immediate)",
				error: "Failed to add test job",
			}
		);
	};

	const statuses = ["delayed", "waiting", "active", "completed", "failed"] as const;

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-4">
					<span className="text-text-secondary uppercase tracking-wider">Queue Debug</span>
					<span className="text-text-tertiary">{queues.length} queues</span>
				</div>
				<div className="flex items-center gap-2">
					{selectedQueue && (
						<>
							<input
								type="number"
								value={testDelay}
								onChange={(e) => setTestDelay(e.target.value)}
								className="w-16 px-2 py-1 rounded bg-surface-elevated border border-border text-text-primary text-xs"
								placeholder="Delay (s)"
								min="0"
							/>
							<button
								type="button"
								onClick={handleAddTestJob}
								className="flex items-center gap-1 px-2 py-1 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
								title="Add test job"
							>
								<Plus size={12} />
								Test Job
							</button>
						</>
					)}
					<button
						type="button"
						onClick={() => {
							fetchQueues();
							fetchJobs();
						}}
						className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
						title="Refresh"
					>
						<RefreshCw size={12} />
					</button>
				</div>
			</div>

			{loading && <p className="text-text-tertiary text-sm px-3">Loading...</p>}

			{/* Queue Stats */}
			{!loading && (
				<div className="grid grid-cols-2 md:grid-cols-4 gap-3">
					{queues.map((queue) => (
						<div
							key={queue.name}
							role="button"
							tabIndex={0}
							className={`px-3 py-3 bg-surface border border-border rounded cursor-pointer transition-all hover:bg-surface-elevated ${
								selectedQueue === queue.name ? "ring-2 ring-accent" : ""
							}`}
							onClick={() => setSelectedQueue(queue.name)}
							onKeyDown={(e) => e.key === "Enter" && setSelectedQueue(queue.name)}
						>
							<div className="text-xs font-medium text-text-primary mb-3 truncate">
								{queue.name}
							</div>
							<div className="grid grid-cols-2 gap-y-2 gap-x-3 text-xs">
								<div className="flex items-center gap-1.5">
									<Clock size={12} className="text-warning shrink-0" />
									<span className="text-warning font-bold">{queue.delayed}</span>
									<span className="text-text-tertiary">delayed</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Loader2 size={12} className="text-info shrink-0" />
									<span className="text-info font-bold">{queue.waiting}</span>
									<span className="text-text-tertiary">waiting</span>
								</div>
								<div className="flex items-center gap-1.5">
									<Play size={12} className="text-accent shrink-0" />
									<span className="text-accent font-bold">{queue.active}</span>
									<span className="text-text-tertiary">active</span>
								</div>
								<div className="flex items-center gap-1.5">
									<CheckCircle size={12} className="text-success shrink-0" />
									<span className="text-success font-bold">{queue.completed}</span>
									<span className="text-text-tertiary">done</span>
								</div>
								<div className="flex items-center gap-1.5">
									<AlertCircle size={12} className="text-error shrink-0" />
									<span className="text-error font-bold">{queue.failed}</span>
									<span className="text-text-tertiary">failed</span>
								</div>
							</div>
						</div>
					))}
				</div>
			)}

			{/* Jobs Section */}
			{selectedQueue && (
				<Panel title={`Jobs - ${selectedQueue}`}>
					{/* Status Tabs */}
					<div className="flex items-center gap-2 mb-4 border-b border-border pb-2">
						{statuses.map((status) => (
							<button
								key={status}
								type="button"
								onClick={() => setSelectedStatus(status)}
								className={`px-3 py-1 rounded text-xs transition-colors ${
									selectedStatus === status
										? "bg-accent text-white"
										: "text-text-tertiary hover:text-text-primary hover:bg-surface-elevated"
								}`}
							>
								{status.charAt(0).toUpperCase() + status.slice(1)}
							</button>
						))}
						<div className="flex-1" />
						<button
							type="button"
							onClick={() => handleClean("completed")}
							className="px-2 py-1 rounded text-xs text-text-tertiary hover:text-success hover:bg-success-bg transition-colors"
						>
							<Trash2 size={12} className="inline mr-1" />
							Clean Done
						</button>
						<button
							type="button"
							onClick={() => handleClean("failed")}
							className="px-2 py-1 rounded text-xs text-text-tertiary hover:text-error hover:bg-error-bg transition-colors"
						>
							<Trash2 size={12} className="inline mr-1" />
							Clean Failed
						</button>
					</div>

					{/* Jobs List */}
					{jobsLoading && (
						<div className="flex items-center justify-center py-8 text-text-tertiary">
							<Loader2 size={20} className="animate-spin mr-2" />
							Loading jobs...
						</div>
					)}

					{!jobsLoading && jobs.length === 0 && (
						<div className="text-center py-8 text-text-tertiary text-sm">
							No {selectedStatus} jobs
						</div>
					)}

					{!jobsLoading && jobs.length > 0 && (
						<div className="divide-y divide-border">
							{jobs.map((job) => (
								<div key={job.id} className="py-3">
									<div className="flex items-start justify-between gap-4">
										<div className="min-w-0 flex-1">
											<div className="flex items-center gap-2">
												<span className="font-mono text-sm">{job.id}</span>
												<span className="text-xs px-1.5 py-0.5 rounded bg-surface-elevated text-text-secondary">
													{job.name}
												</span>
											</div>
											<div className="mt-1 text-xs text-text-tertiary">
												{job.delay && (
													<span className="mr-3">
														<Clock size={10} className="inline mr-1" />
														Delay: {Math.round(job.delay / 1000)}s
													</span>
												)}
												<span>Created: {new Date(job.timestamp).toLocaleString()}</span>
												{job.processedOn && (
													<span className="ml-3">
														Started: {new Date(job.processedOn).toLocaleString()}
													</span>
												)}
												{job.finishedOn && (
													<span className="ml-3">
														Finished: {new Date(job.finishedOn).toLocaleString()}
													</span>
												)}
											</div>
											{job.failedReason && (
												<div className="mt-1 text-xs text-error">{job.failedReason}</div>
											)}
										</div>
									</div>
									<details className="mt-2">
										<summary className="text-xs text-text-tertiary cursor-pointer hover:text-text-secondary">
											View Data
										</summary>
										<pre className="mt-2 p-2 rounded bg-surface-elevated text-xs overflow-x-auto">
											{JSON.stringify(job.data, null, 2)}
										</pre>
									</details>
								</div>
							))}
						</div>
					)}
				</Panel>
			)}
		</div>
	);
}
