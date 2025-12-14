import { useForm } from "@tanstack/react-form";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Input, Label, Panel } from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/servers_/new")({
	component: NewServerPage,
});

const createServerSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(32, "Name must be 32 characters or less")
		.regex(/^[a-z0-9-]+$/, "Lowercase letters, numbers, and hyphens only"),
	modpack: z.string().min(1, "Modpack is required"),
	memory: z.string().min(1),
	createdBy: z.string().min(1, "Creator is required"),
});

function getErrorMessage(error: unknown): string {
	if (typeof error === "string") return error;
	if (error && typeof error === "object" && "message" in error) {
		return String(error.message);
	}
	return "Invalid value";
}

function NewServerPage() {
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	// Escape to go back (only when not focused on inputs)
	useEffect(() => {
		const isEditable = (el: Element | null) =>
			el?.tagName === "INPUT" || el?.tagName === "TEXTAREA" || el?.tagName === "SELECT";

		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isSubmitting && !isEditable(document.activeElement)) {
				navigate({ to: "/servers" });
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [navigate, isSubmitting]);

	const form = useForm({
		defaultValues: {
			name: "",
			modpack: "",
			memory: "4G",
			createdBy: "",
		},
		validators: {
			onChange: createServerSchema,
		},
		onSubmit: async ({ value }) => {
			setIsSubmitting(true);
			setError(null);

			try {
				const { data, error: apiError } = await client.api.gameServers.post(value);

				if (apiError || !data) {
					const errorValue = apiError?.value;
					const errorMessage =
						errorValue && typeof errorValue === "object" && "error" in errorValue
							? String(errorValue.error)
							: "Failed to create server";
					setError(errorMessage);
					setIsSubmitting(false);
					return;
				}

				navigate({ to: "/servers" });
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to create server");
				setIsSubmitting(false);
			}
		},
	});

	return (
		<div className="space-y-4 max-w-xl">
			{/* Header Strip */}
			<div className="flex items-center justify-between px-3 py-2 bg-surface border border-border rounded text-xs">
				<div className="flex items-center gap-4">
					<span className="text-text-secondary uppercase tracking-wider">New Server</span>
					<span className="text-text-tertiary">Configure a new game server</span>
				</div>
				<Link
					to="/servers"
					className="text-text-tertiary hover:text-text-primary transition-colors"
				>
					<kbd className="bg-background px-1.5 py-0.5 rounded text-[10px]">esc</kbd>
					<span className="ml-1.5">Cancel</span>
				</Link>
			</div>

			{/* Form Panel */}
			<Panel title="Server Configuration">
				<form
					onSubmit={(e) => {
						e.preventDefault();
						e.stopPropagation();
						form.handleSubmit();
					}}
					className="space-y-4"
				>
					{/* Name Field */}
					<form.Field
						name="name"
						children={(field) => (
							<FormField
								label="Name"
								hint="lowercase, numbers, hyphens"
								error={
									field.state.meta.errors.length > 0
										? getErrorMessage(field.state.meta.errors[0])
										: undefined
								}
							>
								<Input
									id="name"
									type="text"
									placeholder="my-server"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono"
								/>
							</FormField>
						)}
					/>

					{/* Modpack Field */}
					<form.Field
						name="modpack"
						children={(field) => (
							<FormField
								label="Modpack"
								hint="modpack identifier"
								error={
									field.state.meta.errors.length > 0
										? getErrorMessage(field.state.meta.errors[0])
										: undefined
								}
							>
								<Input
									id="modpack"
									type="text"
									placeholder="all-the-mods-10"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono"
								/>
							</FormField>
						)}
					/>

					{/* Memory Field */}
					<form.Field
						name="memory"
						children={(field) => (
							<FormField
								label="Memory"
								hint="e.g., 4G, 8G, 16G"
								error={
									field.state.meta.errors.length > 0
										? getErrorMessage(field.state.meta.errors[0])
										: undefined
								}
							>
								<Input
									id="memory"
									type="text"
									placeholder="4G"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
									className="font-mono w-24"
								/>
							</FormField>
						)}
					/>

					{/* Created By Field */}
					<form.Field
						name="createdBy"
						children={(field) => (
							<FormField
								label="Created By"
								error={
									field.state.meta.errors.length > 0
										? getErrorMessage(field.state.meta.errors[0])
										: undefined
								}
							>
								<Input
									id="createdBy"
									type="text"
									placeholder="@username"
									value={field.state.value}
									onBlur={field.handleBlur}
									onChange={(e) => field.handleChange(e.target.value)}
								/>
							</FormField>
						)}
					/>

					{/* Error Message */}
					{error && (
						<div className="px-3 py-2 rounded bg-error-bg border border-error text-error text-sm">
							{error}
						</div>
					)}

					{/* Actions */}
					<div className="flex items-center gap-3 pt-2 border-t border-border">
						<button
							type="submit"
							disabled={isSubmitting}
							className="flex items-center gap-2 px-4 py-2 rounded bg-accent text-white text-sm hover:bg-accent-hover disabled:opacity-50 transition-colors"
						>
							{isSubmitting && <Loader2 size={14} className="animate-spin" />}
							{isSubmitting ? "Creating..." : "Create Server"}
						</button>
						<button
							type="button"
							onClick={() => navigate({ to: "/servers" })}
							disabled={isSubmitting}
							className="px-4 py-2 rounded border border-border text-text-secondary text-sm hover:bg-surface-elevated disabled:opacity-50 transition-colors"
						>
							Cancel
						</button>
					</div>
				</form>
			</Panel>
		</div>
	);
}

function FormField({
	label,
	hint,
	error,
	children,
}: {
	label: string;
	hint?: string;
	error?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="grid grid-cols-1 md:grid-cols-4 gap-2 md:gap-4 items-start">
			<div className="md:text-right">
				<Label className="text-sm text-text-secondary">{label}</Label>
				{hint && <p className="text-[10px] text-text-tertiary hidden md:block">{hint}</p>}
			</div>
			<div className="md:col-span-3">
				{children}
				{error && <p className="text-error text-xs mt-1">{error}</p>}
				{hint && !error && <p className="text-[10px] text-text-tertiary mt-1 md:hidden">{hint}</p>}
			</div>
		</div>
	);
}
