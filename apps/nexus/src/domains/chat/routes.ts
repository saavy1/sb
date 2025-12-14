import { Elysia, t } from "elysia";
import { generateConversationTitle } from "../../infra/ai";
import { chatService } from "./service";

const MessagePartSchema = t.Object({
	type: t.String(),
	content: t.Optional(t.String()),
	text: t.Optional(t.String()),
	id: t.Optional(t.String()),
	name: t.Optional(t.String()),
	toolCallId: t.Optional(t.String()),
	arguments: t.Optional(t.String()),
	state: t.Optional(t.String()),
});

export const chatRoutes = new Elysia({ prefix: "/conversations" })
	.get("/", () => {
		return chatService.listConversations();
	})
	.post(
		"/",
		({ body }) => {
			return chatService.createConversation(body.title);
		},
		{
			body: t.Object({
				title: t.Optional(t.String()),
			}),
		}
	)
	.get(
		"/:id",
		({ params }) => {
			const conversation = chatService.getConversation(params.id);
			if (!conversation) {
				return { error: "Conversation not found" };
			}
			return conversation;
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	)
	.patch(
		"/:id",
		({ params, body }) => {
			const conversation = chatService.updateConversationTitle(params.id, body.title);
			if (!conversation) {
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
		}
	)
	.delete(
		"/:id",
		({ params }) => {
			const deleted = chatService.deleteConversation(params.id);
			if (!deleted) {
				return { error: "Conversation not found" };
			}
			return { success: true };
		},
		{
			params: t.Object({
				id: t.String(),
			}),
		}
	)
	.post(
		"/:id/messages",
		async ({ params, body }) => {
			const conversation = chatService.getConversation(params.id);
			if (!conversation) {
				return { error: "Conversation not found" };
			}

			const message = chatService.addMessage({
				conversationId: params.id,
				role: body.role,
				content: body.content,
				parts: body.parts,
			});

			// Auto-generate title after first assistant response
			if (!conversation.title && body.role === "assistant") {
				const userMessage = conversation.messages.find((m) => m.role === "user");
				const userContent = userMessage?.content || "";
				const assistantContent = body.content || "";

				if (userContent && assistantContent) {
					// Generate title async (don't block response)
					generateConversationTitle(userContent, assistantContent).then((title) => {
						if (title) {
							chatService.updateConversationTitle(params.id, title);
						}
					});
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
		}
	);
