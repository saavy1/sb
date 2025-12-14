import { record } from "@elysiajs/opentelemetry";
import { chatRepository } from "./repository";

export interface ConversationWithMessages {
	id: string;
	title: string | null;
	createdAt: string;
	updatedAt: string;
	messages: {
		id: string;
		role: string;
		content: string | null;
		parts: unknown[] | null;
		createdAt: string;
	}[];
}

export const chatService = {
	listConversations() {
		return record("db.listConversations", () => chatRepository.findAllConversations());
	},

	getConversation(id: string): ConversationWithMessages | null {
		return record("db.getConversation", () => {
			const conversation = chatRepository.findConversationById(id);
			if (!conversation) return null;

			const messages = chatRepository.findMessagesByConversationId(id);

			return {
				...conversation,
				messages: messages.map((m) => ({
					...m,
					parts: m.parts ? JSON.parse(m.parts) : null,
				})),
			};
		});
	},

	createConversation(title?: string) {
		return record("db.createConversation", () => {
			const id = crypto.randomUUID();
			return chatRepository.createConversation(id, title);
		});
	},

	updateConversationTitle(id: string, title: string) {
		return record("db.updateConversationTitle", () => {
			chatRepository.updateConversation(id, { title });
			return chatRepository.findConversationById(id);
		});
	},

	deleteConversation(id: string) {
		return record("db.deleteConversation", () => chatRepository.deleteConversation(id));
	},

	addMessage(data: { conversationId: string; role: string; content?: string; parts?: unknown[] }) {
		return record("db.addMessage", () => {
			const id = crypto.randomUUID();
			return chatRepository.createMessage({
				id,
				...data,
			});
		});
	},
};
