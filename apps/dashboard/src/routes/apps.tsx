import { useForm } from "@tanstack/react-form";
import { createFileRoute } from "@tanstack/react-router";
import {
	AlertCircle,
	CheckCircle,
	Circle,
	ExternalLink,
	Film,
	Hammer,
	Laptop,
	LayoutGrid,
	Loader2,
	MonitorDot,
	Plus,
	RefreshCw,
	Trash2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button, Input, Label, Panel } from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/apps")({
	component: AppsPage,
});

type AppsResponse = Awaited<ReturnType<typeof client.api.apps.get>>["data"];
type App = NonNullable<AppsResponse>[number];
type AppCategory = App["category"];

const categoryIcons: Record<string, React.ReactNode> = {
	media: <Film size={14} />,
	tools: <Hammer size={14} />,
	monitoring: <MonitorDot size={14} />,
	development: <Laptop size={14} />,
	other: <LayoutGrid size={14} />,
};

const categoryLabels: Record<string, string> = {
	media: "Media",
	tools: "Tools",
	monitoring: "Monitoring",
	development: "Development",
	other: "Other",
};

function AppsPage() {
	const [apps, setApps] = useState<NonNullable<AppsResponse>>([]);
	const [loading, setLoading] = useState(true);
	const [showAddForm, setShowAddForm] = useState(false);

	const fetchApps = useCallback(async () => {
		try {
			const { data } = await client.api.apps.get();
			if (Array.isArray(data)) setApps(data);
		} catch (error) {
			console.error("Failed to fetch apps:", error);
			toast.error("Failed to load apps");
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchApps();
	}, [fetchApps]);

	const handleDelete = async (id: string, name: string) => {
		if (!confirm(`Delete "${name}"?`)) return;
		try {
			await client.api.apps({ id }).delete();
			toast.success(`${name} deleted`);
			fetchApps();
		} catch {
			toast.error(`Failed to delete ${name}`);
		}
	};

	const handleRefresh = async (id: string) => {
		try {
			await client.api.apps({ id }).refresh.post();
			fetchApps();
		} catch {
			toast.error("Failed to refresh status");
		}
	};

	// Group apps by category
	const groupedApps = apps.reduce(
		(acc, app) => {
			const cat = app.category || "other";
			if (!acc[cat]) acc[cat] = [];
			acc[cat].push(app);
			return acc;
		},
		{} as Record<string, App[]>
	);

	const categoryOrder = ["media", "tools", "monitoring", "development", "other"];
	const sortedCategories = categoryOrder.filter((cat) => groupedApps[cat]?.length > 0);

	return (
		<div className="space-y-4">
			{/* Header */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-4">
					<span className="text-text-primary font-medium">App Launcher</span>
					<span className="text-text-tertiary">{apps.length} apps</span>
				</div>
				<div className="flex items-center gap-2">
					<Button size="sm" variant="ghost" onClick={fetchApps} title="Refresh">
						<RefreshCw size={12} />
					</Button>
					<Button size="sm" onClick={() => setShowAddForm(true)}>
						<Plus size={12} />
						Add App
					</Button>
				</div>
			</div>

			{/* Add Form */}
			{showAddForm && (
				<AddAppForm
					onClose={() => setShowAddForm(false)}
					onSuccess={() => {
						setShowAddForm(false);
						fetchApps();
					}}
				/>
			)}

			{/* Apps Grid */}
			{loading ? (
				<div className="text-center py-12 text-text-tertiary">Loading...</div>
			) : apps.length === 0 ? (
				<Panel title="No Apps">
					<div className="text-center py-8 text-text-tertiary">
						<p>No apps configured yet.</p>
						<Button size="sm" className="mt-4" onClick={() => setShowAddForm(true)}>
							<Plus size={12} />
							Add your first app
						</Button>
					</div>
				</Panel>
			) : (
				<div className="space-y-4">
					{sortedCategories.map((category) => (
						<Panel
							key={category}
							title={
								<span className="flex items-center gap-2">
									{categoryIcons[category]}
									{categoryLabels[category]}
								</span>
							}
						>
							<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
								{groupedApps[category].map((app) => (
									<AppCard
										key={app.id}
										app={app}
										onDelete={() => handleDelete(app.id, app.name)}
										onRefresh={() => handleRefresh(app.id)}
									/>
								))}
							</div>
						</Panel>
					))}
				</div>
			)}
		</div>
	);
}

function AppCard({
	app,
	onDelete,
	onRefresh,
}: {
	app: App;
	onDelete: () => void;
	onRefresh: () => void;
}) {
	const statusIcon =
		app.status === "up" ? (
			<CheckCircle size={12} className="text-success" />
		) : app.status === "down" ? (
			<AlertCircle size={12} className="text-error" />
		) : (
			<Circle size={12} className="text-text-tertiary" />
		);

	return (
		<div className="group relative p-3 bg-surface-elevated/50 hover:bg-surface-elevated rounded border border-border transition-colors">
			{/* Action buttons - positioned above the link */}
			<div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity z-10 bg-surface-elevated rounded">
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onRefresh();
					}}
					className="p-1 rounded text-text-tertiary hover:text-text-primary hover:bg-surface"
					title="Refresh status"
				>
					<RefreshCw size={10} />
				</button>
				<button
					type="button"
					onClick={(e) => {
						e.preventDefault();
						e.stopPropagation();
						onDelete();
					}}
					className="p-1 rounded text-text-tertiary hover:text-error hover:bg-error-bg"
					title="Delete"
				>
					<Trash2 size={10} />
				</button>
			</div>
			<a href={app.url} target="_blank" rel="noopener noreferrer" className="block">
				<div className="flex items-start gap-3">
					<div className="text-2xl">{app.icon || "🔗"}</div>
					<div className="flex-1 min-w-0 pr-12">
						<div className="flex items-center gap-2">
							<span className="font-medium text-sm truncate">{app.name}</span>
							{statusIcon}
						</div>
						{app.description && (
							<p className="text-xs text-text-tertiary mt-0.5 line-clamp-2">{app.description}</p>
						)}
					</div>
					<ExternalLink
						size={12}
						className="text-text-tertiary opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
					/>
				</div>
			</a>
		</div>
	);
}

function AddAppForm({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const form = useForm({
		defaultValues: {
			name: "",
			url: "",
			icon: "",
			category: "other" as AppCategory,
			description: "",
			healthCheckUrl: "",
		},
		onSubmit: async ({ value }) => {
			setIsSubmitting(true);
			setError(null);

			try {
				const { error: apiError } = await client.api.apps.post({
					name: value.name.trim(),
					url: value.url.trim(),
					icon: value.icon?.trim() || undefined,
					category: value.category,
					description: value.description?.trim() || undefined,
					healthCheckUrl: value.healthCheckUrl?.trim() || undefined,
				});

				if (apiError) {
					const errorValue = apiError.value;
					const errorMessage =
						errorValue && typeof errorValue === "object" && "error" in errorValue
							? String(errorValue.error)
							: "Failed to add app";
					setError(errorMessage);
					setIsSubmitting(false);
					return;
				}

				toast.success(`${value.name} added`);
				onSuccess();
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to add app");
				setIsSubmitting(false);
			}
		},
	});

	return (
		<Panel title="Add App">
			<form
				onSubmit={(e) => {
					e.preventDefault();
					e.stopPropagation();
					form.handleSubmit();
				}}
				className="space-y-4"
			>
				<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
					<form.Field
						name="name"
						children={(field) => (
							<FormField label="Name" required>
								<Input
									id="name"
									type="text"
									placeholder="Jellyfin"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</FormField>
						)}
					/>

					<form.Field
						name="url"
						children={(field) => (
							<FormField label="URL" required>
								<Input
									id="url"
									type="url"
									placeholder="https://jellyfin.example.com"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono"
								/>
							</FormField>
						)}
					/>

					<form.Field
						name="icon"
						children={(field) => (
							<FormField label="Icon (emoji)">
								<Input
									id="icon"
									type="text"
									placeholder="🎬"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									maxLength={4}
									className="w-20"
								/>
							</FormField>
						)}
					/>

					<form.Field
						name="category"
						children={(field) => (
							<FormField label="Category">
								<select
									id="category"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value as AppCategory)}
									className="w-full px-3 py-2 bg-background border border-border rounded text-sm focus:outline-none focus:border-accent"
								>
									<option value="media">Media</option>
									<option value="tools">Tools</option>
									<option value="monitoring">Monitoring</option>
									<option value="development">Development</option>
									<option value="other">Other</option>
								</select>
							</FormField>
						)}
					/>

					<form.Field
						name="description"
						children={(field) => (
							<FormField label="Description" fullWidth>
								<Input
									id="description"
									type="text"
									placeholder="Media streaming server"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</FormField>
						)}
					/>

					<form.Field
						name="healthCheckUrl"
						children={(field) => (
							<FormField label="Health Check URL" hint="Used to show up/down status" fullWidth>
								<Input
									id="healthCheckUrl"
									type="url"
									placeholder="https://jellyfin.example.com/health"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono"
								/>
							</FormField>
						)}
					/>
				</div>

				{/* Error Message */}
				{error && (
					<div className="px-3 py-2 rounded bg-error-bg border border-error text-error text-sm">
						{error}
					</div>
				)}

				{/* Actions */}
				<div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
					<Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
						Cancel
					</Button>
					<Button type="submit" disabled={isSubmitting}>
						{isSubmitting && <Loader2 size={14} className="animate-spin" />}
						{isSubmitting ? "Adding..." : "Add App"}
					</Button>
				</div>
			</form>
		</Panel>
	);
}

function FormField({
	label,
	hint,
	error,
	required,
	fullWidth,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	required?: boolean;
	fullWidth?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className={fullWidth ? "md:col-span-2" : ""}>
			<Label className="block text-xs text-text-tertiary mb-1">
				{label}
				{required && " *"}
			</Label>
			{children}
			{error && <p className="text-error text-xs mt-1">{error}</p>}
			{hint && !error && <p className="text-xs text-text-tertiary mt-1">{hint}</p>}
		</div>
	);
}
