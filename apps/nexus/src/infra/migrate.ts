import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { join } from "path";
import { config } from "./config";

const dbPath = config.DB_PATH;

// Migrate minecraft database
console.log("[minecraft] Running migrations...");
const minecraftSqlite = new Database(join(dbPath, "minecraft.sqlite"), { create: true });
minecraftSqlite.exec("PRAGMA journal_mode = WAL;");
const minecraftDb = drizzle(minecraftSqlite);

try {
  migrate(minecraftDb, { migrationsFolder: join(dbPath, "migrations/minecraft") });
  console.log("[minecraft] Migrations complete");
} catch (e) {
  console.log("[minecraft] No migrations found or already up to date");
}
minecraftSqlite.close();

// Migrate core database
console.log("[core] Running migrations...");
const coreSqlite = new Database(join(dbPath, "core.sqlite"), { create: true });
coreSqlite.exec("PRAGMA journal_mode = WAL;");
const coreDb = drizzle(coreSqlite);

try {
  migrate(coreDb, { migrationsFolder: join(dbPath, "migrations/core") });
  console.log("[core] Migrations complete");
} catch (e) {
  console.log("[core] No migrations found or already up to date");
}
coreSqlite.close();

console.log("All migrations complete");
