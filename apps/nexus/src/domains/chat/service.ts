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
		return chatRepository.findAllConversations();
	},

	getConversation(id: string): ConversationWithMessages | null {
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
	},

	createConversation(title?: string) {
		const id = crypto.randomUUID();
		return chatRepository.createConversation(id, title);
	},

	updateConversationTitle(id: string, title: string) {
		chatRepository.updateConversation(id, { title });
		return chatRepository.findConversationById(id);
	},

	deleteConversation(id: string) {
		return chatRepository.deleteConversation(id);
	},

	addMessage(data: { conversationId: string; role: string; content?: string; parts?: unknown[] }) {
		const id = crypto.randomUUID();
		return chatRepository.createMessage({
			id,
			...data,
		});
	},

	// Auto-generate title from first user message
	generateTitleFromMessage(message: string): string {
		const cleaned = message.trim().slice(0, 50);
		return cleaned.length < message.trim().length ? `${cleaned}...` : cleaned;
	},
};
