/**
 * mc-monitor - Minecraft server status monitoring library
 *
 * A pure TypeScript implementation of the Minecraft Server List Ping protocol.
 * Works with modern Minecraft servers (1.7+).
 *
 * @example
 * ```ts
 * import { ping, getPlayerCount, isOnline } from "mc-monitor";
 *
 * // Full status
 * const status = await ping("play.example.com", 25565);
 * console.log(`${status.players.online}/${status.players.max} players`);
 *
 * // Quick player count
 * const { online, max } = await getPlayerCount("play.example.com");
 *
 * // Simple online check
 * const online = await isOnline("play.example.com");
 * ```
 */

export { ping, isOnline, getPlayerCount } from "./ping";
export type { ServerStatus, ServerVersion, ServerPlayers, PlayerSample, PingOptions } from "./types";
