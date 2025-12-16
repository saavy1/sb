/**
 * Types for Minecraft Server List Ping responses
 */

export interface ServerVersion {
	name: string;
	protocol: number;
}

export interface ServerPlayers {
	max: number;
	online: number;
	sample?: PlayerSample[];
}

export interface PlayerSample {
	name: string;
	id: string;
}

export interface ServerDescription {
	text?: string;
	// Can also be a complex chat component, but we'll flatten to string
	extra?: Array<{ text: string }>;
}

/**
 * Raw response from server (JSON structure)
 */
export interface ServerStatusRaw {
	version: ServerVersion;
	players: ServerPlayers;
	description: ServerDescription | string;
	favicon?: string;
	enforcesSecureChat?: boolean;
	previewsChat?: boolean;
}

/**
 * Normalized server status
 */
export interface ServerStatus {
	host: string;
	port: number;
	version: string;
	protocol: number;
	players: {
		online: number;
		max: number;
		sample: PlayerSample[];
	};
	motd: string;
	favicon?: string;
	latency: number;
}

export interface PingOptions {
	timeout?: number;
	protocolVersion?: number;
}
