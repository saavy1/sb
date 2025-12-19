import { useForm } from "@tanstack/react-form";
import { Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { client } from "../lib/api";
import { Button, Input, Label } from "./ui";

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

type CreateServerDialogProps = {
	open: boolean;
	onClose: () => void;
	onCreated: () => void;
};

export function CreateServerDialog({ open, onClose, onCreated }: CreateServerDialogProps) {
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

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

				form.reset();
				onCreated();
				onClose();
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to create server");
			} finally {
				setIsSubmitting(false);
			}
		},
	});

	// Handle escape key
	useEffect(() => {
		if (!open) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" && !isSubmitting) {
				onClose();
			}
		};
		window.addEventListener("keydown", handler);
		return () => window.removeEventListener("keydown", handler);
	}, [open, isSubmitting, onClose]);

	// Reset form when dialog opens
	useEffect(() => {
		if (open) {
			form.reset();
			setError(null);
		}
	}, [open, form]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50">
			<button
				type="button"
				aria-label="Close dialog"
				className="fixed inset-0 bg-black/60 cursor-default"
				onClick={onClose}
			/>
			<div className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md">
				<div className="bg-surface border border-border rounded-lg shadow-2xl overflow-hidden">
					{/* Header */}
					<div className="flex items-center justify-between px-4 py-3 border-b border-border">
						<h2 className="text-sm font-medium">New Server</h2>
						<button
							type="button"
							onClick={onClose}
							className="p-1 rounded hover:bg-surface-elevated text-text-tertiary"
						>
							<X size={16} />
						</button>
					</div>

					{/* Form */}
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="p-4 space-y-4"
					>
						<form.Field
							name="name"
							children={(field) => (
								<div>
									<Label className="text-xs text-text-tertiary mb-1.5 block">Name</Label>
									<Input
										type="text"
										placeholder="my-server"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										className="font-mono"
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-xs mt-1">
											{getErrorMessage(field.state.meta.errors[0])}
										</p>
									)}
									<p className="text-[10px] text-text-tertiary mt-1">
										lowercase, numbers, hyphens only
									</p>
								</div>
							)}
						/>

						<form.Field
							name="modpack"
							children={(field) => (
								<div>
									<Label className="text-xs text-text-tertiary mb-1.5 block">Modpack</Label>
									<Input
										type="text"
										placeholder="all-the-mods-10"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
										className="font-mono"
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-xs mt-1">
											{getErrorMessage(field.state.meta.errors[0])}
										</p>
									)}
								</div>
							)}
						/>

						<div className="grid grid-cols-2 gap-4">
							<form.Field
								name="memory"
								children={(field) => (
									<div>
										<Label className="text-xs text-text-tertiary mb-1.5 block">Memory</Label>
										<Input
											type="text"
											placeholder="4G"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
											className="font-mono"
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-error text-xs mt-1">
												{getErrorMessage(field.state.meta.errors[0])}
											</p>
										)}
									</div>
								)}
							/>

							<form.Field
								name="createdBy"
								children={(field) => (
									<div>
										<Label className="text-xs text-text-tertiary mb-1.5 block">Created By</Label>
										<Input
											type="text"
											placeholder="@username"
											value={field.state.value}
											onBlur={field.handleBlur}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
										{field.state.meta.errors.length > 0 && (
											<p className="text-error text-xs mt-1">
												{getErrorMessage(field.state.meta.errors[0])}
											</p>
										)}
									</div>
								)}
							/>
						</div>

						{error && (
							<div className="px-3 py-2 rounded bg-error-bg border border-error text-error text-sm">
								{error}
							</div>
						)}

						<div className="flex items-center justify-end gap-2 pt-2">
							<Button type="button" variant="ghost" onClick={onClose} disabled={isSubmitting}>
								Cancel
							</Button>
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting && <Loader2 size={14} className="animate-spin mr-1" />}
								{isSubmitting ? "Creating..." : "Create"}
							</Button>
						</div>
					</form>
				</div>
			</div>
		</div>
	);
}
