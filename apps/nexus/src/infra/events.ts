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

// Derived TypeScript types
export type ConversationUpdatedPayloadType = typeof ConversationUpdatedPayload.static;
export type ConversationCreatedPayloadType = typeof ConversationCreatedPayload.static;
export type ConversationDeletedPayloadType = typeof ConversationDeletedPayload.static;

// Event map for type-safe emitter
export type AppEvents = {
	"conversation:updated": ConversationUpdatedPayloadType;
	"conversation:created": ConversationCreatedPayloadType;
	"conversation:deleted": ConversationDeletedPayloadType;
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
