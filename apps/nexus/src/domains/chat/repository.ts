import { desc, eq } from "drizzle-orm";
import { chatDb } from "../../infra/db";
import { type Conversation, conversations, type Message, messages } from "./schema";

export const chatRepository = {
	// Conversations
	findAllConversations(): Conversation[] {
		return chatDb.select().from(conversations).orderBy(desc(conversations.updatedAt)).all();
	},

	findConversationById(id: string): Conversation | undefined {
		return chatDb.select().from(conversations).where(eq(conversations.id, id)).get();
	},

	createConversation(id: string, title?: string): Conversation {
		const now = new Date().toISOString();
		chatDb
			.insert(conversations)
			.values({
				id,
				title,
				createdAt: now,
				updatedAt: now,
			})
			.run();

		return { id, title: title ?? null, createdAt: now, updatedAt: now };
	},

	updateConversation(id: string, data: { title?: string }): void {
		chatDb
			.update(conversations)
			.set({
				...data,
				updatedAt: new Date().toISOString(),
			})
			.where(eq(conversations.id, id))
			.run();
	},

	updateConversationTimestamp(id: string): void {
		chatDb
			.update(conversations)
			.set({ updatedAt: new Date().toISOString() })
			.where(eq(conversations.id, id))
			.run();
	},

	deleteConversation(id: string): boolean {
		const existing = this.findConversationById(id);
		if (!existing) return false;
		chatDb.delete(conversations).where(eq(conversations.id, id)).run();
		return true;
	},

	// Messages
	findMessagesByConversationId(conversationId: string): Message[] {
		return chatDb
			.select()
			.from(messages)
			.where(eq(messages.conversationId, conversationId))
			.orderBy(messages.createdAt)
			.all();
	},

	createMessage(data: {
		id: string;
		conversationId: string;
		role: string;
		content?: string;
		parts?: unknown[];
	}): Message {
		const now = new Date().toISOString();
		const partsJson = data.parts ? JSON.stringify(data.parts) : null;

		chatDb
			.insert(messages)
			.values({
				id: data.id,
				conversationId: data.conversationId,
				role: data.role,
				content: data.content ?? null,
				parts: partsJson,
				createdAt: now,
			})
			.run();

		// Update conversation timestamp
		this.updateConversationTimestamp(data.conversationId);

		return {
			id: data.id,
			conversationId: data.conversationId,
			role: data.role,
			content: data.content ?? null,
			parts: partsJson,
			createdAt: now,
		};
	},
};
