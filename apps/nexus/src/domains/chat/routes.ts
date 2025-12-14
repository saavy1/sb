import { Elysia, t } from "elysia";
import logger from "logger";
import { generateConversationTitle } from "../../infra/ai";
import { appEvents } from "../../infra/events";
import { chatService } from "./service";

const log = logger.child({ module: "chat" });

// Helper to extract text content from message (content string or parts array)
type MessageLike = {
	content?: string | null;
	parts?: { type: string; content?: string; text?: string }[] | null;
};

function extractTextContent(message: MessageLike | undefined): string {
	if (!message) return "";

	// Try direct content first
	if (message.content) return message.content;

	// Try parts array - look for text parts
	if (Array.isArray(message.parts)) {
		const textParts = message.parts
			.filter((p) => p.type === "text")
			.map((p) => p.content || p.text || "")
			.filter(Boolean);
		if (textParts.length > 0) return textParts.join("\n");
	}

	return "";
}

// Request body types
const MessagePartSchema = t.Object({
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

export const chatRoutes = new Elysia({ prefix: "/conversations" })
	.get(
		"/",
		() => {
			return chatService.listConversations();
		},
		{
			detail: { tags: ["Chat"], summary: "List all conversations" },
		}
	)
	.post(
		"/",
		({ body }) => {
			return chatService.createConversation(body.title);
		},
		{
			body: t.Object({
				title: t.Optional(t.String()),
			}),
			detail: { tags: ["Chat"], summary: "Create a new conversation" },
		}
	)
	.get(
		"/:id",
		({ params, set }) => {
			const conversation = chatService.getConversation(params.id);
			if (!conversation) {
				set.status = 404;
				return { error: "Conversation not found" };
			}
			return conversation;
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			detail: { tags: ["Chat"], summary: "Get a conversation by ID" },
		}
	)
	.patch(
		"/:id",
		({ params, body, set }) => {
			const conversation = chatService.updateConversationTitle(params.id, body.title);
			if (!conversation) {
				set.status = 404;
				return { error: "Conversation not found" };
			}
			return conversation;
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				title: t.String(),
			}),
			detail: { tags: ["Chat"], summary: "Update conversation title" },
		}
	)
	.delete(
		"/:id",
		({ params, set }) => {
			const deleted = chatService.deleteConversation(params.id);
			if (!deleted) {
				set.status = 404;
				return { error: "Conversation not found" };
			}
			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			detail: { tags: ["Chat"], summary: "Delete a conversation" },
		}
	)
	.post(
		"/:id/messages",
		async ({ params, body, set }) => {
			log.info(
				{
					conversationId: params.id,
					role: body.role,
					hasContent: !!body.content,
				},
				"adding message to conversation"
			);

			const conversation = chatService.getConversation(params.id);
			if (!conversation) {
				log.warn({ conversationId: params.id }, "conversation not found");
				set.status = 404;
				return { error: "Conversation not found" };
			}

			const message = chatService.addMessage({
				conversationId: params.id,
				role: body.role,
				content: body.content,
				parts: body.parts,
			});

			log.info(
				{
					messageId: message.id,
					conversationTitle: conversation.title,
					messageCount: conversation.messages.length,
				},
				"message added"
			);

			// Auto-generate title after first assistant response
			if (!conversation.title && body.role === "assistant") {
				const userMessage = conversation.messages.find((m) => m.role === "user");
				const userContent = extractTextContent(userMessage);
				const assistantContent = extractTextContent(body);

				log.info(
					{
						hasUserContent: !!userContent,
						hasAssistantContent: !!assistantContent,
					},
					"checking title generation conditions"
				);

				if (userContent && assistantContent) {
					log.info({ conversationId: params.id }, "triggering async title generation");
					// Generate title async (don't block response)
					generateConversationTitle(userContent, assistantContent).then((title) => {
						if (title) {
							log.info({ conversationId: params.id, title }, "updating conversation title");
							chatService.updateConversationTitle(params.id, title);
							// Emit event for real-time UI updates
							appEvents.emit("conversation:updated", { id: params.id, title });
						} else {
							log.warn({ conversationId: params.id }, "title generation returned null");
						}
					});
				} else {
					log.info({ conversationId: params.id }, "skipping title generation - missing content");
				}
			}

			return message;
		},
		{
			params: t.Object({
				id: t.String(),
			}),
			body: t.Object({
				role: t.String(),
				content: t.Optional(t.String()),
				parts: t.Optional(t.Array(MessagePartSchema)),
			}),
			detail: { tags: ["Chat"], summary: "Add a message to a conversation" },
		}
	);
