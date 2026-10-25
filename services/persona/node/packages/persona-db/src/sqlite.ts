import Database from "better-sqlite3";
import { mkdirSync } from "fs";
import { dirname } from "path";
import { createLogger } from "@agilehead/persona-logger";
import { schema } from "./tinqer-schema.js";

const logger = createLogger("persona-db");

export type SQLiteDatabase = Database.Database;

export function initSQLiteDatabase(dbPath: string): SQLiteDatabase {
  // Ensure the directory exists
  const dir = dirname(dbPath);
  mkdirSync(dir, { recursive: true });

  const db = new Database(dbPath);

  // Enable foreign key constraints
  db.pragma("foreign_keys = ON");

  // Set journal mode for better performance
  db.pragma("journal_mode = WAL");

  logger.info(`SQLite database connected at: ${dbPath}`);

  return db;
}

export function closeSQLiteDatabase(db: SQLiteDatabase): void {
  db.close();
  logger.info("SQLite database connection closed");
}

// Re-export schema for repositories
export { schema };
