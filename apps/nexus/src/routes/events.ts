import { Elysia } from "elysia";
import logger from "logger";
import { type AppEventName, type AppEvents, appEvents } from "../infra/events";

const log = logger.child({ module: "events-ws" });

// Track connected WebSocket clients
const clients = new Set<{ send: (data: string) => void }>();

// Subscribe to all app events and broadcast to connected clients
function setupEventBroadcasting() {
	const eventNames: AppEventName[] = ["conversation:updated", "conversation:created", "conversation:deleted"];

	for (const eventName of eventNames) {
		appEvents.on(eventName, (payload) => {
			const message = JSON.stringify({ event: eventName, payload });
			log.debug({ event: eventName, clientCount: clients.size }, "broadcasting event");

			for (const client of clients) {
				try {
					client.send(message);
				} catch (err) {
					log.error({ error: err }, "failed to send to client");
				}
			}
		});
	}
}

// Initialize broadcasting on module load
setupEventBroadcasting();

export const eventsRoutes = new Elysia({ prefix: "/events" }).ws("/", {
	open(ws) {
		log.info("client connected to events websocket");
		clients.add(ws);
	},
	close(ws) {
		log.info("client disconnected from events websocket");
		clients.delete(ws);
	},
	message(ws, message) {
		// Could handle client-to-server messages here if needed
		log.debug({ message }, "received message from client");
	},
});
