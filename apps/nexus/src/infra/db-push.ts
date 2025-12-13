import { Database } from "bun:sqlite";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import logger from "logger";
import { join } from "node:path";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Ensure db directory exists
import { mkdirSync } from "node:fs";
try {
	mkdirSync(dbPath, { recursive: true });
} catch {}

// Push minecraft schema
logger.info({ database: "minecraft" }, "Pushing schema");
const minecraftSqlite = new Database(join(dbPath, "minecraft.sqlite"), {
	create: true,
});
minecraftSqlite.exec("PRAGMA journal_mode = WAL;");
const minecraftDb = drizzle(minecraftSqlite);

minecraftDb.run(sql`
  CREATE TABLE IF NOT EXISTS servers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    game_type TEXT NOT NULL DEFAULT 'minecraft',
    modpack TEXT,
    status TEXT NOT NULL DEFAULT 'stopped',
    port INTEGER,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    memory TEXT,
    k8s_deployment TEXT
  )
`);
minecraftDb.run(sql`CREATE INDEX IF NOT EXISTS idx_servers_name ON servers(name)`);
minecraftDb.run(sql`CREATE INDEX IF NOT EXISTS idx_servers_status ON servers(status)`);
minecraftDb.run(sql`CREATE INDEX IF NOT EXISTS idx_servers_created_by ON servers(created_by)`);
logger.info({ database: "minecraft" }, "Schema pushed");
minecraftSqlite.close();

// Push core schema
logger.info({ database: "core" }, "Pushing schema");
const coreSqlite = new Database(join(dbPath, "core.sqlite"), { create: true });
coreSqlite.exec("PRAGMA journal_mode = WAL;");
const coreDb = drizzle(coreSqlite);

coreDb.run(sql`
  CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    payload TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error TEXT
  )
`);
coreDb.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status)`);
coreDb.run(sql`CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type)`);

coreDb.run(sql`
  CREATE TABLE IF NOT EXISTS users (
    discord_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT
  )
`);

coreDb.run(sql`
  CREATE TABLE IF NOT EXISTS permissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    discord_id TEXT NOT NULL REFERENCES users(discord_id),
    resource_type TEXT NOT NULL,
    resource_id TEXT,
    permission TEXT NOT NULL,
    granted_at TEXT NOT NULL
  )
`);
coreDb.run(sql`CREATE INDEX IF NOT EXISTS idx_permissions_discord_id ON permissions(discord_id)`);
logger.info({ database: "core" }, "Schema pushed");
coreSqlite.close();

logger.info("All schemas pushed successfully");
