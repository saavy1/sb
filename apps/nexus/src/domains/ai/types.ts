import { t } from "elysia";
import { MessagePartSchema } from "../chat/types";

export const ChatMessage = t.Object({
	id: t.Optional(t.String()),
	role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("tool")]),
	content: t.Optional(t.Union([t.String(), t.Null()])),
	parts: t.Optional(t.Array(MessagePartSchema)),
});

export const ChatRequestBody = t.Object({
	messages: t.Array(ChatMessage),
});

export const ErrorResponse = t.Object({
	error: t.String(),
});

export type ChatMessageType = typeof ChatMessage.static;
export type ChatRequestBodyType = typeof ChatRequestBody.static;
