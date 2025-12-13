import { useForm } from "@tanstack/react-form";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useState } from "react";
import { z } from "zod";
import {
	Button,
	Card,
	CardContent,
	CardHeader,
	CardTitle,
	Input,
	Label,
	PageHeader,
} from "../components/ui";
import { client } from "../lib/api";

export const Route = createFileRoute("/servers_/new")({
	component: NewServerPage,
});

const createServerSchema = z.object({
	name: z
		.string()
		.min(1, "Name is required")
		.max(32, "Name must be 32 characters or less")
		.regex(/^[a-z0-9-]+$/, "Name must contain only lowercase letters, numbers, and hyphens"),
	modpack: z.string().min(1, "Modpack is required"),
	memory: z.string().optional(),
	createdBy: z.string().min(1, "Creator is required"),
});

function NewServerPage() {
	const navigate = useNavigate();
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
					setError(apiError?.value?.error || "Failed to create server");
					setIsSubmitting(false);
					return;
				}

				// Success! Navigate to servers list
				navigate({ to: "/servers" });
			} catch (e) {
				setError(e instanceof Error ? e.message : "Failed to create server");
				setIsSubmitting(false);
			}
		},
	});

	return (
		<div>
			<PageHeader
				title="Create New Server"
				description="Set up a new Minecraft game server"
				actions={
					<Button variant="outline" onClick={() => navigate({ to: "/servers" })}>
						<ArrowLeft size={16} />
						Back to Servers
					</Button>
				}
			/>

			<Card className="max-w-2xl">
				<CardHeader>
					<CardTitle>Server Configuration</CardTitle>
				</CardHeader>
				<CardContent>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
						className="space-y-6"
					>
						{/* Name Field */}
						<form.Field
							name="name"
							children={(field) => (
								<div className="space-y-2">
									<Label htmlFor="name">Server Name</Label>
									<Input
										id="name"
										type="text"
										placeholder="my-awesome-server"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-sm">{field.state.meta.errors[0]}</p>
									)}
									{field.state.meta.errors.length === 0 && (
										<p className="text-text-tertiary text-xs">
											Lowercase letters, numbers, and hyphens only
										</p>
									)}
								</div>
							)}
						/>

						{/* Modpack Field */}
						<form.Field
							name="modpack"
							children={(field) => (
								<div className="space-y-2">
									<Label htmlFor="modpack">Modpack</Label>
									<Input
										id="modpack"
										type="text"
										placeholder="all-the-mods-10"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-sm">{field.state.meta.errors[0]}</p>
									)}
									{field.state.meta.errors.length === 0 && (
										<p className="text-text-tertiary text-xs">The modpack identifier or name</p>
									)}
								</div>
							)}
						/>

						{/* Memory Field */}
						<form.Field
							name="memory"
							children={(field) => (
								<div className="space-y-2">
									<Label htmlFor="memory">Memory Allocation</Label>
									<Input
										id="memory"
										type="text"
										placeholder="4G"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-sm">{field.state.meta.errors[0]}</p>
									)}
									{field.state.meta.errors.length === 0 && (
										<p className="text-text-tertiary text-xs">
											e.g., 2G, 4G, 8G (optional, defaults to 4G)
										</p>
									)}
								</div>
							)}
						/>

						{/* Created By Field */}
						<form.Field
							name="createdBy"
							children={(field) => (
								<div className="space-y-2">
									<Label htmlFor="createdBy">Created By</Label>
									<Input
										id="createdBy"
										type="text"
										placeholder="@username"
										value={field.state.value}
										onBlur={field.handleBlur}
										onChange={(e) => field.handleChange(e.target.value)}
									/>
									{field.state.meta.errors.length > 0 && (
										<p className="text-error text-sm">{field.state.meta.errors[0]}</p>
									)}
								</div>
							)}
						/>

						{/* Error Message */}
						{error && (
							<div className="p-4 rounded-md bg-error-bg border border-error">
								<p className="text-error text-sm">{error}</p>
							</div>
						)}

						{/* Submit Buttons */}
						<div className="flex items-center gap-3 pt-4">
							<Button type="submit" disabled={isSubmitting}>
								{isSubmitting && <Loader2 size={16} className="animate-spin" />}
								{isSubmitting ? "Creating..." : "Create Server"}
							</Button>
							<Button
								type="button"
								variant="outline"
								onClick={() => navigate({ to: "/servers" })}
								disabled={isSubmitting}
							>
								Cancel
							</Button>
						</div>
					</form>
				</CardContent>
			</Card>
		</div>
	);
}
