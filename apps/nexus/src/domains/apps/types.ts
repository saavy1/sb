import { t } from "elysia";

export const AppCategory = t.Union([
	t.Literal("media"),
	t.Literal("tools"),
	t.Literal("monitoring"),
	t.Literal("development"),
	t.Literal("other"),
]);

export const AppParams = t.Object({
	id: t.String(),
});

export const CreateAppBody = t.Object({
	name: t.String({ minLength: 1 }),
	url: t.String({ minLength: 1 }),
	icon: t.Optional(t.String()),
	category: t.Optional(AppCategory),
	healthCheckUrl: t.Optional(t.String()),
	description: t.Optional(t.String()),
	sortOrder: t.Optional(t.Number()),
});

export const UpdateAppBody = t.Object({
	name: t.Optional(t.String({ minLength: 1 })),
	url: t.Optional(t.String({ minLength: 1 })),
	icon: t.Optional(t.Nullable(t.String())),
	category: t.Optional(AppCategory),
	healthCheckUrl: t.Optional(t.Nullable(t.String())),
	description: t.Optional(t.Nullable(t.String())),
	sortOrder: t.Optional(t.Number()),
});

export const AppResponse = t.Object({
	id: t.String(),
	name: t.String(),
	url: t.String(),
	icon: t.Nullable(t.String()),
	category: AppCategory,
	healthCheckUrl: t.Nullable(t.String()),
	description: t.Nullable(t.String()),
	sortOrder: t.Number(),
	createdAt: t.String(),
	updatedAt: t.String(),
});

export const AppWithStatusResponse = t.Object({
	id: t.String(),
	name: t.String(),
	url: t.String(),
	icon: t.Nullable(t.String()),
	category: AppCategory,
	healthCheckUrl: t.Nullable(t.String()),
	description: t.Nullable(t.String()),
	sortOrder: t.Number(),
	createdAt: t.String(),
	updatedAt: t.String(),
	status: t.Union([t.Literal("up"), t.Literal("down"), t.Literal("unknown")]),
});

export const AppListResponse = t.Array(AppWithStatusResponse);

export const ApiError = t.Object({
	error: t.String(),
});
