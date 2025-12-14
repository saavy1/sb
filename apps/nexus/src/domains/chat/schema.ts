import { index, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable(
	"conversations",
	{
		id: text("id").primaryKey(),
		title: text("title"),
		createdAt: text("created_at").notNull(),
		updatedAt: text("updated_at").notNull(),
	},
	(table) => [index("idx_conversations_updated_at").on(table.updatedAt)]
);

export const messages = sqliteTable(
	"messages",
	{
		id: text("id").primaryKey(),
		conversationId: text("conversation_id")
			.notNull()
			.references(() => conversations.id, { onDelete: "cascade" }),
		role: text("role").notNull(), // 'user' | 'assistant'
		content: text("content"), // Plain text content for user messages
		parts: text("parts"), // JSON array of parts for assistant messages (text, tool-call, tool-result)
		createdAt: text("created_at").notNull(),
	},
	(table) => [
		index("idx_messages_conversation_id").on(table.conversationId),
		index("idx_messages_created_at").on(table.createdAt),
	]
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
