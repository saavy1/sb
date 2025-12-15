import { EventEmitter } from "node:events";
import { t } from "elysia";
import logger from "logger";

const log = logger.child({ module: "events" });

// Define event payload schemas
export const ConversationUpdatedPayload = t.Object({
	id: t.String(),
	title: t.Nullable(t.String()),
});

export const ConversationCreatedPayload = t.Object({
	id: t.String(),
});

export const ConversationDeletedPayload = t.Object({
	id: t.String(),
});

export const QueueJobAddedPayload = t.Object({
	queue: t.String(),
	jobId: t.String(),
	name: t.String(),
	delay: t.Optional(t.Number()),
});

export const QueueJobCompletedPayload = t.Object({
	queue: t.String(),
	jobId: t.String(),
});

export const QueueJobFailedPayload = t.Object({
	queue: t.String(),
	jobId: t.String(),
	reason: t.Optional(t.String()),
});

export const QueueStatsUpdatedPayload = t.Object({
	queue: t.String(),
	waiting: t.Number(),
	active: t.Number(),
	completed: t.Number(),
	failed: t.Number(),
	delayed: t.Number(),
});

export const ThreadUpdatedPayload = t.Object({
	id: t.String(),
	title: t.Nullable(t.String()),
});

export const ThreadMessagePayload = t.Object({
	threadId: t.String(),
	messageId: t.String(),
	role: t.Union([t.Literal("user"), t.Literal("assistant"), t.Literal("system")]),
	content: t.String(),
	done: t.Boolean(), // true when message is complete
});

// Derived TypeScript types
export type ConversationUpdatedPayloadType = typeof ConversationUpdatedPayload.static;
export type ConversationCreatedPayloadType = typeof ConversationCreatedPayload.static;
export type ConversationDeletedPayloadType = typeof ConversationDeletedPayload.static;
export type QueueJobAddedPayloadType = typeof QueueJobAddedPayload.static;
export type QueueJobCompletedPayloadType = typeof QueueJobCompletedPayload.static;
export type QueueJobFailedPayloadType = typeof QueueJobFailedPayload.static;
export type QueueStatsUpdatedPayloadType = typeof QueueStatsUpdatedPayload.static;
export type ThreadUpdatedPayloadType = typeof ThreadUpdatedPayload.static;
export type ThreadMessagePayloadType = typeof ThreadMessagePayload.static;

// Event map for type-safe emitter
export type AppEvents = {
	"conversation:updated": ConversationUpdatedPayloadType;
	"conversation:created": ConversationCreatedPayloadType;
	"conversation:deleted": ConversationDeletedPayloadType;
	"queue:job:added": QueueJobAddedPayloadType;
	"queue:job:completed": QueueJobCompletedPayloadType;
	"queue:job:failed": QueueJobFailedPayloadType;
	"queue:stats:updated": QueueStatsUpdatedPayloadType;
	"thread:updated": ThreadUpdatedPayloadType;
	"thread:message": ThreadMessagePayloadType;
};

export type AppEventName = keyof AppEvents;

// Type-safe event emitter
class TypedEventEmitter {
	private emitter = new EventEmitter();

	emit<K extends AppEventName>(event: K, payload: AppEvents[K]) {
		log.debug({ event, payload }, "emitting event");
		this.emitter.emit(event, payload);
	}

	on<K extends AppEventName>(event: K, listener: (payload: AppEvents[K]) => void) {
		this.emitter.on(event, listener);
		return () => this.emitter.off(event, listener);
	}

	off<K extends AppEventName>(event: K, listener: (payload: AppEvents[K]) => void) {
		this.emitter.off(event, listener);
	}
}

// Singleton instance
export const appEvents = new TypedEventEmitter();
