import { z } from "zod";

// === Infisical API response schemas ===

export const InfisicalSecretSchema = z.object({
	id: z.string(),
	workspace: z.string(),
	environment: z.string(),
	version: z.number(),
	type: z.string(),
	secretKey: z.string(),
	secretValue: z.string().optional(),
	secretComment: z.string().optional(),
	secretValueHidden: z.boolean().optional(),
	secretPath: z.string().optional(),
	createdAt: z.string().optional(),
	updatedAt: z.string().optional(),
	actor: z
		.object({
			actorId: z.string(),
			actorType: z.string(),
			name: z.string(),
		})
		.optional(),
	isRotatedSecret: z.boolean().optional(),
	tags: z
		.array(
			z.object({
				id: z.string(),
				slug: z.string(),
				name: z.string(),
				color: z.string(),
			}),
		)
		.optional(),
});
export type InfisicalSecret = z.infer<typeof InfisicalSecretSchema>;

export const InfisicalListResponseSchema = z.object({
	secrets: z.array(InfisicalSecretSchema),
	imports: z
		.array(
			z.object({
				secretPath: z.string(),
				environment: z.string(),
				secrets: z.array(InfisicalSecretSchema),
				folderId: z.string().optional(),
			}),
		)
		.optional(),
});
export type InfisicalListResponse = z.infer<typeof InfisicalListResponseSchema>;

export const InfisicalGetResponseSchema = z.object({
	secret: InfisicalSecretSchema,
});
export type InfisicalGetResponse = z.infer<typeof InfisicalGetResponseSchema>;

export const InfisicalSecretVersionSchema = z.object({
	id: z.string(),
	secretId: z.string(),
	version: z.number(),
	secretKey: z.string(),
	secretValue: z.string().optional(),
	secretValueHidden: z.boolean().optional(),
	createdAt: z.string(),
	actor: z
		.object({
			actorId: z.string(),
			actorType: z.string(),
			name: z.string(),
		})
		.optional(),
});
export type InfisicalSecretVersion = z.infer<
	typeof InfisicalSecretVersionSchema
>;

export const InfisicalVersionsResponseSchema = z.object({
	secretVersions: z.array(InfisicalSecretVersionSchema),
});
export type InfisicalVersionsResponse = z.infer<
	typeof InfisicalVersionsResponseSchema
>;

export const InfisicalEnvironmentSchema = z.object({
	name: z.string(),
	slug: z.string(),
	id: z.string(),
});
export type InfisicalEnvironment = z.infer<typeof InfisicalEnvironmentSchema>;

export const InfisicalProjectSchema = z.object({
	id: z.string(),
	name: z.string(),
	slug: z.string(),
	type: z.string(),
	orgId: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	environments: z.array(InfisicalEnvironmentSchema),
});
export type InfisicalProject = z.infer<typeof InfisicalProjectSchema>;

export const InfisicalProjectListResponseSchema = z.object({
	projects: z.array(InfisicalProjectSchema),
});
export type InfisicalProjectListResponse = z.infer<
	typeof InfisicalProjectListResponseSchema
>;
