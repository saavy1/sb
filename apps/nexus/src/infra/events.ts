import { EventEmitter } from "events";
import logger from "logger";

const log = logger.child({ module: "events" });

// Define all event types and their payloads
export type AppEvents = {
	"conversation:updated": { id: string; title: string | null };
	"conversation:created": { id: string };
	"conversation:deleted": { id: string };
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
