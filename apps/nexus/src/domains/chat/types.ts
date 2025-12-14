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

// TypeScript types for consumers (Dashboard)
export type ConversationType = typeof ConversationSchema.static;
export type MessageType = typeof MessageSchema.static;
