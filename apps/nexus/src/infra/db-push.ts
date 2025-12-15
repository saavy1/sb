import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import logger from "logger";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Ensure db directory exists
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

// Push system-info schema
logger.info({ database: "system-info" }, "Pushing schema");
const systemInfoSqlite = new Database(join(dbPath, "system-info.sqlite"), {
	create: true,
});
systemInfoSqlite.exec("PRAGMA journal_mode = WAL;");
const systemInfoDb = drizzle(systemInfoSqlite);

systemInfoDb.run(sql`
  CREATE TABLE IF NOT EXISTS drives (
    id TEXT PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    label TEXT NOT NULL,
    expected_capacity INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
systemInfoDb.run(sql`CREATE INDEX IF NOT EXISTS idx_drives_path ON drives(path)`);
logger.info({ database: "system-info" }, "Schema pushed");
systemInfoSqlite.close();

// Push ops schema
logger.info({ database: "ops" }, "Pushing schema");
const opsSqlite = new Database(join(dbPath, "ops.sqlite"), { create: true });
opsSqlite.exec("PRAGMA journal_mode = WAL;");
const opsDb = drizzle(opsSqlite);

opsDb.run(sql`
  CREATE TABLE IF NOT EXISTS operations (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    triggered_by TEXT NOT NULL,
    triggered_by_user TEXT,
    output TEXT,
    error_message TEXT,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER
  )
`);
opsDb.run(sql`CREATE INDEX IF NOT EXISTS idx_operations_type ON operations(type)`);
opsDb.run(sql`CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status)`);
opsDb.run(sql`CREATE INDEX IF NOT EXISTS idx_operations_started_at ON operations(started_at)`);
logger.info({ database: "ops" }, "Schema pushed");
opsSqlite.close();

// Push apps schema
logger.info({ database: "apps" }, "Pushing schema");
const appsSqlite = new Database(join(dbPath, "apps.sqlite"), { create: true });
appsSqlite.exec("PRAGMA journal_mode = WAL;");
const appsDb = drizzle(appsSqlite);

appsDb.run(sql`
  CREATE TABLE IF NOT EXISTS apps (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    icon TEXT,
    category TEXT NOT NULL DEFAULT 'other',
    health_check_url TEXT,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);
appsDb.run(sql`CREATE INDEX IF NOT EXISTS idx_apps_category ON apps(category)`);
appsDb.run(sql`CREATE INDEX IF NOT EXISTS idx_apps_sort_order ON apps(sort_order)`);
logger.info({ database: "apps" }, "Schema pushed");
appsSqlite.close();

// Push agent schema
logger.info({ database: "agent" }, "Pushing schema");
const agentSqlite = new Database(join(dbPath, "agent.sqlite"), { create: true });
agentSqlite.exec("PRAGMA journal_mode = WAL;");
const agentDb = drizzle(agentSqlite);

agentDb.run(sql`
  CREATE TABLE IF NOT EXISTS agent_threads (
    id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',
    title TEXT,
    source TEXT NOT NULL,
    source_id TEXT,
    messages TEXT NOT NULL DEFAULT '[]',
    context TEXT NOT NULL DEFAULT '{}',
    wake_job_id TEXT,
    wake_reason TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  )
`);
// Add title column if it doesn't exist (migration for existing DBs)
try {
	agentDb.run(sql`ALTER TABLE agent_threads ADD COLUMN title TEXT`);
} catch {
	// Column already exists
}
agentDb.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_threads_status ON agent_threads(status)`);
agentDb.run(sql`CREATE INDEX IF NOT EXISTS idx_agent_threads_source ON agent_threads(source)`);
agentDb.run(
	sql`CREATE INDEX IF NOT EXISTS idx_agent_threads_updated_at ON agent_threads(updated_at)`
);
logger.info({ database: "agent" }, "Schema pushed");
agentSqlite.close();

logger.info("All schemas pushed successfully");
