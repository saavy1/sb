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
