import { t } from "elysia";

// === Internal schemas ===

export const ThreadStatus = t.Union([
	t.Literal("active"),
	t.Literal("sleeping"),
	t.Literal("complete"),
	t.Literal("failed"),
]);
export type ThreadStatusType = typeof ThreadStatus.static;

export const ThreadSource = t.Union([
	t.Literal("chat"),
	t.Literal("discord"),
	t.Literal("event"),
	t.Literal("scheduled"),
	t.Literal("alert"),
]);
export type ThreadSourceType = typeof ThreadSource.static;

export const MessagePart = t.Object({
	type: t.String(),
	content: t.Optional(t.String()),
	text: t.Optional(t.String()),
	name: t.Optional(t.String()),
	toolName: t.Optional(t.String()),
	id: t.Optional(t.String()),
});
export type MessagePartType = typeof MessagePart.static;

export const ThreadMessage = t.Object({
	id: t.String(),
	role: t.Union([
		t.Literal("user"),
		t.Literal("assistant"),
		t.Literal("tool"),
		t.Literal("system"),
	]),
	content: t.Optional(t.Nullable(t.String())),
	parts: t.Optional(t.Nullable(t.Array(MessagePart))),
});
export type ThreadMessageType = typeof ThreadMessage.static;

// === API schemas ===

export const AgentThreadResponse = t.Object({
	id: t.String(),
	status: ThreadStatus,
	source: ThreadSource,
	sourceId: t.Nullable(t.String()),
	title: t.Nullable(t.String()),
	messageCount: t.Number(),
	context: t.Record(t.String(), t.Any()),
	wakeReason: t.Nullable(t.String()),
	createdAt: t.String(),
	updatedAt: t.String(),
});

export const AgentThreadDetail = t.Object({
	id: t.String(),
	status: ThreadStatus,
	source: ThreadSource,
	sourceId: t.Nullable(t.String()),
	title: t.Nullable(t.String()),
	messages: t.Array(ThreadMessage),
	context: t.Record(t.String(), t.Any()),
	wakeJobId: t.Nullable(t.String()),
	wakeReason: t.Nullable(t.String()),
	createdAt: t.String(),
	updatedAt: t.String(),
});

export const CreateThreadRequest = t.Object({
	source: ThreadSource,
	sourceId: t.Optional(t.String()),
	initialMessage: t.Optional(t.String()),
});

export const SendMessageRequest = t.Object({
	content: t.String(),
});

export const ThreadIdParam = t.Object({
	id: t.String(),
});

export const ThreadsQueryParams = t.Object({
	status: t.Optional(ThreadStatus),
	source: t.Optional(ThreadSource),
	limit: t.Optional(t.String()),
});

export const ApiError = t.Object({
	error: t.String(),
});

// === TanStack AI chat request (for useChat integration) ===

export const ChatMessage = t.Object({
	id: t.Optional(t.String()),
	role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("tool")]),
	content: t.Optional(t.Nullable(t.String())),
	parts: t.Optional(t.Array(MessagePart)),
});
export type ChatMessageType = typeof ChatMessage.static;

export const ChatRequest = t.Object({
	messages: t.Array(ChatMessage),
	threadId: t.Optional(t.String()),
});
export type ChatRequestType = typeof ChatRequest.static;

// === Wake job data ===

export const WakeJobData = t.Object({
	threadId: t.String(),
	reason: t.String(),
});
export type WakeJobDataType = typeof WakeJobData.static;

// === System event job data ===

export const SystemEventType = t.Union([
	t.Literal("grafana-alert"),
	t.Literal("alertmanager-alert"),
]);
export type SystemEventTypeValue = typeof SystemEventType.static;

export const SystemEventJob = t.Object({
	type: SystemEventType,
	payload: t.Record(t.String(), t.Unknown()),
	receivedAt: t.String(),
});
export type SystemEventJobType = typeof SystemEventJob.static;

// Grafana alert structure (from webhook payload)
// Based on actual Grafana Cloud webhook payload
export const GrafanaAlert = t.Object({
	status: t.String(), // "firing" | "resolved"
	labels: t.Record(t.String(), t.String()),
	annotations: t.Optional(t.Record(t.String(), t.String())),
	startsAt: t.String(), // ISO timestamp
	endsAt: t.Optional(t.String()), // ISO timestamp, "0001-01-01T00:00:00Z" when not resolved
	generatorURL: t.Optional(t.String()),
	fingerprint: t.String(),
	silenceURL: t.Optional(t.String()),
	dashboardURL: t.Optional(t.String()),
	panelURL: t.Optional(t.String()),
	values: t.Optional(t.Nullable(t.Record(t.String(), t.Unknown()))),
	valueString: t.Optional(t.String()), // e.g. "[ metric='foo' labels={instance=bar} value=10 ]"
});
export type GrafanaAlertType = typeof GrafanaAlert.static;

export const GrafanaAlertPayload = t.Object({
	receiver: t.Optional(t.String()), // Contact point name, e.g. "webhook"
	status: t.String(), // "firing" | "resolved"
	alerts: t.Array(GrafanaAlert),
	groupLabels: t.Optional(t.Record(t.String(), t.String())),
	commonLabels: t.Optional(t.Record(t.String(), t.String())),
	commonAnnotations: t.Optional(t.Record(t.String(), t.String())),
	externalURL: t.Optional(t.String()), // Alertmanager URL
	version: t.Optional(t.String()), // "1"
	groupKey: t.Optional(t.String()), // e.g. "webhook-57c6d9296de2ad39-1765846417"
	truncatedAlerts: t.Optional(t.Number()), // Number of alerts truncated
	orgId: t.Optional(t.Number()), // Grafana org ID
	title: t.Optional(t.String()), // e.g. "[FIRING:1] TestAlert Grafana"
	state: t.Optional(t.String()), // "alerting" | "ok" | "pending" | "nodata"
	message: t.Optional(t.String()), // Formatted alert message with labels/annotations
});
export type GrafanaAlertPayloadType = typeof GrafanaAlertPayload.static;

// Alertmanager alert structure
export const AlertmanagerAlert = t.Object({
	status: t.String(),
	labels: t.Record(t.String(), t.String()),
	annotations: t.Optional(t.Record(t.String(), t.String())),
	startsAt: t.String(),
	fingerprint: t.String(),
	generatorURL: t.Optional(t.String()),
});

export const AlertmanagerPayload = t.Object({
	status: t.String(),
	alerts: t.Array(AlertmanagerAlert),
});
export type AlertmanagerPayloadType = typeof AlertmanagerPayload.static;

// === Embeddings job data ===

export const EmbeddingJobData = t.Object({
	threadId: t.String(),
	messageId: t.String(),
	role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("system")]),
	content: t.String(),
	createdAt: t.String(), // ISO timestamp
});
export type EmbeddingJobDataType = typeof EmbeddingJobData.static;

// === Discord ask job data ===

export const DiscordAskJobData = t.Object({
	threadId: t.String(),
	content: t.String(),
	// Discord interaction details for replying
	interactionToken: t.String(),
	applicationId: t.String(),
});
export type DiscordAskJobDataType = typeof DiscordAskJobData.static;
