/**
 * Valkey (Redis) Pub/Sub infrastructure for real-time events.
 *
 * This provides a generic pub/sub layer that various components can use
 * to publish and subscribe to events. Unlike BullMQ queues, pub/sub is
 * ephemeral and fire-and-forget - perfect for real-time status updates.
 */

import IORedis from "ioredis";
import logger from "logger";
import { config } from "./config";

const log = logger.child({ module: "pubsub" });

// Channel names
export const CHANNELS = {
	MINECRAFT_STATUS: "minecraft:status",
} as const;

export type ChannelName = (typeof CHANNELS)[keyof typeof CHANNELS];

// Payload types for each channel
export interface MinecraftStatusPayload {
	online: boolean;
	version?: string;
	players?: {
		online: number;
		max: number;
		list: string[];
	};
	motd?: string;
	latency?: number;
	timestamp: string;
	// Change detection fields
	playerJoined?: string[];
	playerLeft?: string[];
	statusChanged?: boolean;
}

export type ChannelPayloads = {
	[CHANNELS.MINECRAFT_STATUS]: MinecraftStatusPayload;
};

// Publisher connection (can be shared with other Redis operations)
let publisher: IORedis | null = null;

// Subscriber connection (dedicated - can't do other operations while subscribed)
let subscriber: IORedis | null = null;

// Subscription handlers
type MessageHandler<T> = (payload: T) => void | Promise<void>;
const handlers = new Map<string, Set<MessageHandler<unknown>>>();

/**
 * Initialize pub/sub connections.
 * Call this during app startup.
 */
export function initPubSub(existingRedis?: IORedis) {
	// Use existing connection for publishing or create new one
	publisher = existingRedis ?? new IORedis(config.VALKEY_URL);

	// Always create dedicated connection for subscribing
	subscriber = new IORedis(config.VALKEY_URL);

	subscriber.on("connect", () => {
		log.info("Pub/sub subscriber connected");
	});

	subscriber.on("error", (err) => {
		log.error({ err }, "Pub/sub subscriber error");
	});

	// Handle incoming messages
	subscriber.on("message", (channel, message) => {
		const channelHandlers = handlers.get(channel);
		if (!channelHandlers || channelHandlers.size === 0) {
			return;
		}

		try {
			const payload = JSON.parse(message);
			for (const handler of channelHandlers) {
				try {
					handler(payload);
				} catch (err) {
					log.error({ err, channel }, "Error in pub/sub handler");
				}
			}
		} catch (err) {
			log.error({ err, channel, message }, "Failed to parse pub/sub message");
		}
	});

	log.info("Pub/sub initialized");
}

/**
 * Publish a message to a channel.
 */
export async function publish<C extends ChannelName>(
	channel: C,
	payload: ChannelPayloads[C]
): Promise<void> {
	if (!publisher) {
		log.warn({ channel }, "Pub/sub not initialized, message dropped");
		return;
	}

	try {
		await publisher.publish(channel, JSON.stringify(payload));
		log.debug({ channel }, "Published message");
	} catch (err) {
		log.error({ err, channel }, "Failed to publish message");
	}
}

/**
 * Subscribe to a channel.
 * Returns an unsubscribe function.
 */
export function subscribe<C extends ChannelName>(
	channel: C,
	handler: MessageHandler<ChannelPayloads[C]>
): () => void {
	if (!subscriber) {
		log.warn({ channel }, "Pub/sub not initialized, subscription ignored");
		return () => {};
	}

	// Add handler to set
	if (!handlers.has(channel)) {
		handlers.set(channel, new Set());
		// Subscribe to Redis channel
		subscriber.subscribe(channel).catch((err) => {
			log.error({ err, channel }, "Failed to subscribe to channel");
		});
	}
	handlers.get(channel)!.add(handler as MessageHandler<unknown>);

	log.debug({ channel, handlerCount: handlers.get(channel)!.size }, "Added subscription");

	// Return unsubscribe function
	return () => {
		const channelHandlers = handlers.get(channel);
		if (channelHandlers) {
			channelHandlers.delete(handler as MessageHandler<unknown>);
			log.debug({ channel, handlerCount: channelHandlers.size }, "Removed subscription");

			// Unsubscribe from Redis if no more handlers
			if (channelHandlers.size === 0) {
				handlers.delete(channel);
				subscriber?.unsubscribe(channel).catch((err) => {
					log.error({ err, channel }, "Failed to unsubscribe from channel");
				});
			}
		}
	};
}

/**
 * Close pub/sub connections.
 */
export async function closePubSub() {
	log.info("Closing pub/sub connections...");
	if (subscriber) {
		await subscriber.quit();
		subscriber = null;
	}
	// Don't close publisher if it was provided externally
	log.info("Pub/sub connections closed");
}
