/**
 * persona-db - Database connection and schema for Persona service
 */

// Database schema types
export type { DatabaseSchema } from "./schema.js";

// SQLite implementation
export {
  initSQLiteDatabase,
  closeSQLiteDatabase,
  type SQLiteDatabase,
} from "./sqlite.js";

// Tinqer schema instance
export { schema } from "./tinqer-schema.js";

// SQLite row types
export type { IdentityRow, SessionRow } from "./types/sqlite.js";

// Migrations
export {
  runMigrations,
  rollbackMigrations,
  getMigrationStatus,
} from "./migrations.js";
