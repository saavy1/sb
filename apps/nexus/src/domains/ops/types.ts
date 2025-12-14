import { t } from "elysia";

// Elysia types for API contracts (shared with frontend via Eden Treaty)

export const Operation = t.Object({
	id: t.String(),
	type: t.String(),
	status: t.String(),
	triggeredBy: t.String(),
	triggeredByUser: t.Nullable(t.String()),
	output: t.Nullable(t.String()),
	errorMessage: t.Nullable(t.String()),
	startedAt: t.String(),
	completedAt: t.Nullable(t.String()),
	durationMs: t.Nullable(t.Number()),
});

export const TriggerOperationRequest = t.Object({
	type: t.Union([t.Literal("nixos-rebuild"), t.Literal("flux-reconcile")]),
	source: t.Optional(t.Union([t.Literal("webhook"), t.Literal("dashboard"), t.Literal("cli")])),
	user: t.Optional(t.String()),
});

export const TriggerOperationResponse = t.Object({
	id: t.String(),
	status: t.String(),
	message: t.String(),
});

export const OperationIdParam = t.Object({
	id: t.String(),
});

export const OperationsQueryParams = t.Object({
	limit: t.Optional(t.String()),
});

export const LatestQueryParams = t.Object({
	type: t.Optional(t.String()),
});

export const ApiError = t.Object({
	error: t.String(),
});
