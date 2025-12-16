import { Elysia } from "elysia";
import logger from "logger";
import { type AppEventName, appEvents } from "@nexus-core/infra/events";
import { autheliaMiddleware } from "../middleware/authelia";

const log = logger.child({ module: "events-ws" });

// Track connected WebSocket clients
const clients = new Set<{ send: (data: string) => void }>();

// Subscribe to all app events and broadcast to connected clients
function setupEventBroadcasting() {
	const eventNames: AppEventName[] = [
		"conversation:updated",
		"conversation:created",
		"conversation:deleted",
		"queue:job:added",
		"queue:job:completed",
		"queue:job:failed",
		"queue:stats:updated",
		"thread:updated",
		"thread:message",
	];

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

export const eventsRoutes = new Elysia({ prefix: "/events" }).use(autheliaMiddleware).ws("/", {
	open(ws) {
		const user = ws.data.user;

		// Reject unauthenticated connections in production
		if (!user && process.env.NODE_ENV === "production") {
			log.warn("rejected unauthenticated websocket connection");
			ws.close(4001, "Unauthorized");
			return;
		}

		log.info({ username: user?.username ?? "dev" }, "client connected to events websocket");
		clients.add(ws);
	},
	close(ws) {
		const user = ws.data.user;
		log.info({ username: user?.username ?? "dev" }, "client disconnected from events websocket");
		clients.delete(ws);
	},
	message(_ws, message) {
		// Could handle client-to-server messages here if needed
		log.debug({ message }, "received message from client");
	},
});
