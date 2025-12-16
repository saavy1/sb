/**
 * Quick test of mc-monitor against a local server
 */

import { ping, getPlayerCount, isOnline } from "./src";

const HOST = process.argv[2] || "10.42.1.53";
const PORT = parseInt(process.argv[3] || "25565", 10);

console.log(`Testing mc-monitor against ${HOST}:${PORT}\n`);

// Test isOnline
console.log("1. Testing isOnline()...");
const online = await isOnline(HOST, PORT, 5000);
console.log(`   Server online: ${online}\n`);

if (!online) {
	console.log("Server not online, skipping other tests");
	process.exit(1);
}

// Test getPlayerCount
console.log("2. Testing getPlayerCount()...");
const players = await getPlayerCount(HOST, PORT);
console.log(`   Players: ${players.online}/${players.max}\n`);

// Test full ping
console.log("3. Testing ping() for full status...");
const status = await ping(HOST, PORT);
console.log("   Status:", JSON.stringify(status, null, 2));
