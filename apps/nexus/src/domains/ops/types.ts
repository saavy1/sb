import { t } from "elysia";

// === Internal schemas ===

export const OperationType = t.Union([t.Literal("nixos-rebuild"), t.Literal("flux-reconcile")]);
export type OperationTypeValue = typeof OperationType.static;

export const TriggerSource = t.Union([
	t.Literal("webhook"),
	t.Literal("dashboard"),
	t.Literal("cli"),
	t.Literal("ai"),
]);
export type TriggerSourceValue = typeof TriggerSource.static;

export const OperationStatus = t.Union([
	t.Literal("running"),
	t.Literal("success"),
	t.Literal("failed"),
]);
export type OperationStatusValue = typeof OperationStatus.static;

export const CommandResult = t.Object({
	success: t.Boolean(),
	output: t.String(),
	errorMessage: t.Optional(t.String()),
	durationMs: t.Number(),
});
export type CommandResultType = typeof CommandResult.static;

// === API schemas ===

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
	type: t.Optional(t.Union([t.Literal("nixos-rebuild"), t.Literal("flux-reconcile")])),
});

export const ApiError = t.Object({
	error: t.String(),
});
