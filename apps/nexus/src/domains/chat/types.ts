import { t } from "elysia";

export const ConversationSchema = t.Object({
	id: t.String(),
	title: t.Nullable(t.String()),
	createdAt: t.String(),
	updatedAt: t.String(),
});

export const MessageSchema = t.Object({
	id: t.String(),
	conversationId: t.String(),
	role: t.String(),
	content: t.Nullable(t.String()),
	parts: t.Nullable(t.String()), // JSON string
	createdAt: t.String(),
});

// Message part structure (used by TanStack AI)
export const MessagePartSchema = t.Object({
	type: t.String(),
	content: t.Optional(t.String()),
	text: t.Optional(t.String()),
	id: t.Optional(t.String()),
	name: t.Optional(t.String()),
	toolName: t.Optional(t.String()),
	toolCallId: t.Optional(t.String()),
	arguments: t.Optional(t.String()),
	state: t.Optional(t.String()),
});

// Message with parsed parts (returned by service)
export const MessageWithPartsSchema = t.Object({
	id: t.String(),
	role: t.String(),
	content: t.Nullable(t.String()),
	parts: t.Nullable(t.Array(MessagePartSchema)),
	createdAt: t.String(),
});

// TypeScript types derived from schemas
export type ConversationType = typeof ConversationSchema.static;
export type MessageType = typeof MessageSchema.static;
export type MessagePartType = typeof MessagePartSchema.static;
export type MessageWithPartsType = typeof MessageWithPartsSchema.static;
