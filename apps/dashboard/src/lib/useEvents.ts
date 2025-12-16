import type { AppEventName, AppEvents } from "@nexus-core/infra/events";
import { useEffect, useRef } from "react";
import { API_URL } from "./api";

type EventMessage<K extends AppEventName = AppEventName> = {
	event: K;
	payload: AppEvents[K];
};

type EventHandler<K extends AppEventName> = (payload: AppEvents[K]) => void;

// Convert HTTP URL to WebSocket URL
function getWsUrl(): string {
	const url = new URL(API_URL);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.pathname = "/api/events";
	return url.toString();
}

// Singleton WebSocket manager - persists across component lifecycles
class WebSocketManager {
	private ws: WebSocket | null = null;
	private subscribers = new Map<AppEventName, Set<EventHandler<AppEventName>>>();
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
	private isConnecting = false;

	subscribe<K extends AppEventName>(event: K, handler: EventHandler<K>) {
		if (!this.subscribers.has(event)) {
			this.subscribers.set(event, new Set());
		}
		this.subscribers.get(event)!.add(handler as EventHandler<AppEventName>);

		// Ensure connection is active
		this.connect();

		// Return unsubscribe function
		return () => {
			const handlers = this.subscribers.get(event);
			if (handlers) {
				handlers.delete(handler as EventHandler<AppEventName>);
				if (handlers.size === 0) {
					this.subscribers.delete(event);
				}
			}
		};
	}

	private connect() {
		// Already connected or connecting
		if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
			return;
		}

		// Clean up existing connection
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}

		this.isConnecting = true;
		const wsUrl = getWsUrl();
		const ws = new WebSocket(wsUrl);

		ws.onopen = () => {
			console.log("[events] connected to", wsUrl);
			this.isConnecting = false;
			this.ws = ws;
		};

		ws.onmessage = (e) => {
			try {
				const message = JSON.parse(e.data) as EventMessage;
				const handlers = this.subscribers.get(message.event);
				if (handlers) {
					for (const handler of handlers) {
						handler(message.payload);
					}
				}
			} catch (err) {
				console.error("[events] failed to parse message:", err);
			}
		};

		ws.onerror = (err) => {
			console.error("[events] websocket error:", err);
			this.isConnecting = false;
		};

		ws.onclose = () => {
			console.log("[events] disconnected");
			this.isConnecting = false;
			this.ws = null;

			// Reconnect if we still have subscribers
			if (this.subscribers.size > 0) {
				this.reconnectTimer = setTimeout(() => this.connect(), 1000);
			}
		};
	}

	disconnect() {
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}
		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}

// Global singleton instance
const wsManager = new WebSocketManager();

export function useEvents<K extends AppEventName>(event: K, handler: EventHandler<K>) {
	const handlerRef = useRef(handler);

	// Keep handler ref updated
	useEffect(() => {
		handlerRef.current = handler;
	}, [handler]);

	useEffect(() => {
		// Subscribe with a stable wrapper that uses the ref
		const unsubscribe = wsManager.subscribe(event, (payload) => {
			handlerRef.current(payload as AppEvents[K]);
		});

		return unsubscribe;
	}, [event]);
}
