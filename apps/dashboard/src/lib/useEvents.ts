import { useEffect, useRef } from "react";
import { API_URL } from "./api";

// Event types matching the backend
type AppEvents = {
	"conversation:updated": { id: string; title: string | null };
	"conversation:created": { id: string };
	"conversation:deleted": { id: string };
};

type EventMessage<K extends keyof AppEvents = keyof AppEvents> = {
	event: K;
	payload: AppEvents[K];
};

type EventHandler<K extends keyof AppEvents> = (payload: AppEvents[K]) => void;

// Convert HTTP URL to WebSocket URL
function getWsUrl(): string {
	const url = new URL(API_URL);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/api/events";
	return url.toString();
}

export function useEvents<K extends keyof AppEvents>(event: K, handler: EventHandler<K>) {
	const wsRef = useRef<WebSocket | null>(null);
	const handlerRef = useRef(handler);

	// Keep handler ref updated
	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	useEffect(() => {
		const wsUrl = getWsUrl();
		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;

		ws.onopen = () => {
			console.log("[events] connected to", wsUrl);
		};

		ws.onmessage = (e) => {
			try {
				const message = JSON.parse(e.data) as EventMessage;
				if (message.event === event) {
					handlerRef.current(message.payload as AppEvents[K]);
				}
			} catch (err) {
				console.error("[events] failed to parse message:", err);
			}
		};

		ws.onerror = (err) => {
			console.error("[events] websocket error:", err);
		};

		ws.onclose = () => {
			console.log("[events] disconnected");
		};

		return () => {
			ws.close();
		};
	}, [event]);
}
