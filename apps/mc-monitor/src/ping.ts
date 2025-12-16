/**
 * Minecraft Server List Ping implementation
 * Protocol: https://wiki.vg/Server_List_Ping
 */

import { decodeVarInt, encodeVarInt } from "./varint";
import type { PingOptions, ServerStatus, ServerStatusRaw } from "./types";

const DEFAULT_TIMEOUT = 5000;
const DEFAULT_PROTOCOL_VERSION = 767; // 1.21.x

/**
 * Build a packet with length prefix
 */
function buildPacket(packetId: number, ...data: Uint8Array[]): Uint8Array {
	const packetIdBytes = encodeVarInt(packetId);
	const dataLength = data.reduce((sum, d) => sum + d.length, 0);
	const totalLength = packetIdBytes.length + dataLength;
	const lengthBytes = encodeVarInt(totalLength);

	const packet = new Uint8Array(lengthBytes.length + totalLength);
	let offset = 0;

	packet.set(lengthBytes, offset);
	offset += lengthBytes.length;

	packet.set(packetIdBytes, offset);
	offset += packetIdBytes.length;

	for (const d of data) {
		packet.set(d, offset);
		offset += d.length;
	}

	return packet;
}

/**
 * Encode a string as length-prefixed UTF-8
 */
function encodeString(str: string): Uint8Array {
	const utf8 = new TextEncoder().encode(str);
	const lengthBytes = encodeVarInt(utf8.length);
	const result = new Uint8Array(lengthBytes.length + utf8.length);
	result.set(lengthBytes, 0);
	result.set(utf8, lengthBytes.length);
	return result;
}

/**
 * Build handshake packet (packet ID 0x00)
 */
function buildHandshake(host: string, port: number, protocolVersion: number): Uint8Array {
	const protocolBytes = encodeVarInt(protocolVersion);
	const hostBytes = encodeString(host);
	const portBytes = new Uint8Array(2);
	new DataView(portBytes.buffer).setUint16(0, port, false); // big-endian
	const nextState = encodeVarInt(1); // 1 = status

	return buildPacket(0x00, protocolBytes, hostBytes, portBytes, nextState);
}

/**
 * Build status request packet (packet ID 0x00, no payload)
 */
function buildStatusRequest(): Uint8Array {
	return buildPacket(0x00);
}

/**
 * Build ping packet (packet ID 0x01)
 */
function buildPingPacket(timestamp: bigint): Uint8Array {
	const timestampBytes = new Uint8Array(8);
	new DataView(timestampBytes.buffer).setBigInt64(0, timestamp, false);
	return buildPacket(0x01, timestampBytes);
}

/**
 * Parse description to plain text
 */
function parseDescription(desc: ServerStatusRaw["description"]): string {
	if (typeof desc === "string") {
		return desc;
	}
	if (desc.text !== undefined) {
		let text = desc.text;
		if (desc.extra) {
			text += desc.extra.map((e) => e.text || "").join("");
		}
		return text;
	}
	return "";
}

/**
 * Ping a Minecraft server using the Server List Ping protocol
 */
export async function ping(host: string, port = 25565, options: PingOptions = {}): Promise<ServerStatus> {
	const timeout = options.timeout ?? DEFAULT_TIMEOUT;
	const protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION;

	return new Promise((resolve, reject) => {
		let buffer = new Uint8Array(0);
		let responseJson: string | null = null;
		let pingSentAt = 0n;
		let latency = 0;
		let activeSocket: ReturnType<typeof Bun.connect> extends Promise<infer S> ? S : never;

		const timeoutId = setTimeout(() => {
			activeSocket?.terminate();
			reject(new Error(`Connection timeout after ${timeout}ms`));
		}, timeout);

		Bun.connect({
			hostname: host,
			port,
			socket: {
				open(socket) {
					activeSocket = socket;
					// Send handshake + status request
					const handshake = buildHandshake(host, port, protocolVersion);
					const statusRequest = buildStatusRequest();
					socket.write(handshake);
					socket.write(statusRequest);
				},

				data(socket, data) {
					// Append to buffer
					const newBuffer = new Uint8Array(buffer.length + data.length);
					newBuffer.set(buffer, 0);
					newBuffer.set(new Uint8Array(data), buffer.length);
					buffer = newBuffer;

					// Try to parse packets
					while (buffer.length > 0) {
						try {
							// Read packet length
							const { value: packetLength, bytesRead: lengthBytes } = decodeVarInt(buffer, 0);

							// Check if we have the full packet
							if (buffer.length < lengthBytes + packetLength) {
								break; // Wait for more data
							}

							// Extract packet data
							const packetData = buffer.slice(lengthBytes, lengthBytes + packetLength);
							buffer = buffer.slice(lengthBytes + packetLength);

							// Read packet ID
							const { value: packetId, bytesRead: idBytes } = decodeVarInt(packetData, 0);

							if (packetId === 0x00 && !responseJson) {
								// Status response
								const { value: jsonLength, bytesRead: jsonLengthBytes } = decodeVarInt(
									packetData,
									idBytes
								);
								const jsonStart = idBytes + jsonLengthBytes;
								const jsonData = packetData.slice(jsonStart, jsonStart + jsonLength);
								responseJson = new TextDecoder().decode(jsonData);

								// Send ping packet
								pingSentAt = BigInt(Date.now());
								const pingPacket = buildPingPacket(pingSentAt);
								socket.write(pingPacket);
							} else if (packetId === 0x01) {
								// Pong response
								const pongTime = BigInt(Date.now());
								latency = Number(pongTime - pingSentAt);

								// Done!
								clearTimeout(timeoutId);
								socket.terminate();

								if (!responseJson) {
									reject(new Error("No status response received"));
									return;
								}

								try {
									const raw: ServerStatusRaw = JSON.parse(responseJson);
									const status: ServerStatus = {
										host,
										port,
										version: raw.version.name,
										protocol: raw.version.protocol,
										players: {
											online: raw.players.online,
											max: raw.players.max,
											sample: raw.players.sample ?? [],
										},
										motd: parseDescription(raw.description),
										favicon: raw.favicon,
										latency,
									};
									resolve(status);
								} catch (e) {
									reject(new Error(`Failed to parse status JSON: ${e}`));
								}
							}
						} catch {
							// Incomplete packet, wait for more data
							break;
						}
					}
				},

				error(_socket, error) {
					clearTimeout(timeoutId);
					reject(error);
				},

				close() {
					clearTimeout(timeoutId);
					if (!responseJson) {
						reject(new Error("Connection closed before receiving response"));
					}
				},
			},
		});
	});
}

/**
 * Check if a server is online (simple boolean check)
 */
export async function isOnline(host: string, port = 25565, timeout = 5000): Promise<boolean> {
	try {
		await ping(host, port, { timeout });
		return true;
	} catch {
		return false;
	}
}

/**
 * Get player count from a server
 */
export async function getPlayerCount(
	host: string,
	port = 25565,
	timeout = 5000
): Promise<{ online: number; max: number }> {
	const status = await ping(host, port, { timeout });
	return {
		online: status.players.online,
		max: status.players.max,
	};
}
