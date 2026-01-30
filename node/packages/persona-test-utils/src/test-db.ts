/**
 * Persona Test Database
 *
 * Manages the persona.db for integration testing.
 * Uses Knex migrations for schema management.
 * Follows functional style - no classes.
 */

import Database from "better-sqlite3";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync } from "fs";
import Knex from "knex";
import { createLogger, type Logger } from "@agilehead/persona-logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (4 levels up from this file: src -> persona-test-utils -> packages -> node -> persona)
const PROJECT_ROOT = join(__dirname, "../../../..");

export type TestDatabase = {
  db: Database.Database;
  knex: Knex.Knex | null;
  dbPath: string;
  testDir: string | null;
  logger: Logger;
  isExternal: boolean;
};

export type TestDatabaseState = {
  current: TestDatabase | null;
};

// Module-level singleton state
const state: TestDatabaseState = { current: null };

export function createTestDatabase(
  logger?: Logger,
  externalDbPath?: string,
): TestDatabase {
  const log = logger ?? createLogger("persona-test-db");
  const isExternal = externalDbPath !== undefined;

  let dbPath: string;
  let testDir: string | null;

  if (externalDbPath !== undefined) {
    // External mode: use existing database at specified path
    dbPath = externalDbPath;
    testDir = null;
    log.info(`Using external database at: ${externalDbPath}`);
  } else {
    // Local mode: create a timestamped test directory under .tests/
    const timestamp = Date.now();
    testDir = join(PROJECT_ROOT, ".tests", `test-${String(timestamp)}`, "data");
    mkdirSync(join(testDir, "db"), { recursive: true });
    dbPath = join(testDir, "db", "persona.db");
  }

  return {
    db: null as unknown as Database.Database, // Will be set in setup
    knex: null,
    dbPath,
    testDir,
    logger: log,
    isExternal,
  };
}

export async function setupTestDatabase(testDb: TestDatabase): Promise<void> {
  testDb.logger.info("Setting up test database...");

  if (!testDb.isExternal) {
    // Setup database with Knex migrations
    testDb.knex = Knex({
      client: "better-sqlite3",
      connection: { filename: testDb.dbPath },
      useNullAsDefault: true,
      migrations: {
        directory: join(PROJECT_ROOT, "database/sqlite/migrations"),
      },
    });
    await testDb.knex.migrate.latest();
  }

  // Create better-sqlite3 instance for queries
  const db = new Database(testDb.dbPath);
  db.pragma("foreign_keys = ON");
  db.pragma("journal_mode = WAL");
  (testDb as { db: Database.Database }).db = db;

  testDb.logger.info(
    testDb.isExternal
      ? "External test database connected"
      : "Test database setup complete",
  );
}

export function truncateAllTables(testDb: TestDatabase): void {
  testDb.db.pragma("foreign_keys = OFF");
  const tables = testDb.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'knex_migrations' AND name != 'knex_migrations_lock'",
    )
    .all() as { name: string }[];

  for (const { name } of tables) {
    testDb.db.prepare(`DELETE FROM ${name}`).run();
  }
  testDb.db.pragma("foreign_keys = ON");

  testDb.logger.debug("Truncated all test tables");
}

export async function teardownTestDatabase(
  testDb: TestDatabase,
): Promise<void> {
  if (testDb.knex !== null) {
    await testDb.knex.destroy();
    testDb.knex = null;
  }
  testDb.db.close();
  (testDb as { db: Database.Database | null }).db = null;

  // Only delete test directory for local databases, not external ones
  if (!testDb.isExternal && testDb.testDir !== null) {
    try {
      const testRunDir = join(testDb.testDir, "..");
      rmSync(testRunDir, { recursive: true, force: true });
      testDb.logger.info(`Test directory deleted: ${testRunDir}`);
    } catch {
      // Ignore if directory doesn't exist
    }
  }
}

// Singleton accessors
export function getTestDatabaseInstance(logger?: Logger): TestDatabase {
  state.current ??= createTestDatabase(logger);
  return state.current;
}

export function getExternalTestDatabaseInstance(
  dbPath: string,
  logger?: Logger,
): TestDatabase {
  state.current ??= createTestDatabase(logger, dbPath);
  return state.current;
}

export function clearTestDatabaseInstance(): void {
  state.current = null;
}

// ==========================================
// Identity Helpers
// ==========================================

export type InsertIdentityData = {
  id: string;
  tenantId: string;
  provider: string;
  providerUserId: string;
  email: string;
  name?: string | null;
  profileImageUrl?: string | null;
  userId?: string | null;
  roles?: string | null;
  metadata?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export function insertIdentity(
  testDb: TestDatabase,
  data: InsertIdentityData,
): void {
  const now = new Date().toISOString();

  testDb.db
    .prepare(
      `INSERT INTO identity (
        id, tenant_id, provider, provider_user_id, email, name, profile_image_url,
        user_id, roles, metadata, created_at, updated_at
      ) VALUES (
        @id, @tenantId, @provider, @providerUserId, @email, @name, @profileImageUrl,
        @userId, @roles, @metadata, @createdAt, @updatedAt
      )`,
    )
    .run({
      id: data.id,
      tenantId: data.tenantId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      email: data.email,
      name: data.name ?? null,
      profileImageUrl: data.profileImageUrl ?? null,
      userId: data.userId ?? null,
      roles: data.roles ?? null,
      metadata: data.metadata ?? null,
      createdAt: data.createdAt ?? now,
      updatedAt: data.updatedAt ?? now,
    });
}

export type IdentityRecord = {
  id: string;
  tenant_id: string;
  provider: string;
  provider_user_id: string;
  email: string;
  name: string | null;
  profile_image_url: string | null;
  user_id: string | null;
  roles: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
};

export function getIdentity(
  testDb: TestDatabase,
  id: string,
): IdentityRecord | null {
  const result = testDb.db
    .prepare("SELECT * FROM identity WHERE id = ?")
    .get(id) as IdentityRecord | undefined;

  return result ?? null;
}

export function getIdentityByProvider(
  testDb: TestDatabase,
  tenantId: string,
  provider: string,
  providerUserId: string,
): IdentityRecord | null {
  const result = testDb.db
    .prepare(
      "SELECT * FROM identity WHERE tenant_id = ? AND provider = ? AND provider_user_id = ?",
    )
    .get(tenantId, provider, providerUserId) as IdentityRecord | undefined;

  return result ?? null;
}

export function getIdentityCount(testDb: TestDatabase): number {
  const result = testDb.db
    .prepare("SELECT COUNT(*) as count FROM identity")
    .get() as { count: number };

  return result.count;
}

// ==========================================
// Session Helpers
// ==========================================

export type InsertSessionData = {
  id: string;
  identityId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: string;
  revoked?: number;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt?: string;
};

export function insertSession(
  testDb: TestDatabase,
  data: InsertSessionData,
): void {
  const now = new Date().toISOString();

  testDb.db
    .prepare(
      `INSERT INTO session (
        id, identity_id, tenant_id, token_hash, expires_at, revoked, ip_address, user_agent, created_at
      ) VALUES (
        @id, @identityId, @tenantId, @tokenHash, @expiresAt, @revoked, @ipAddress, @userAgent, @createdAt
      )`,
    )
    .run({
      id: data.id,
      identityId: data.identityId,
      tenantId: data.tenantId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt,
      revoked: data.revoked ?? 0,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt: data.createdAt ?? now,
    });
}

export type SessionRecord = {
  id: string;
  identity_id: string;
  tenant_id: string;
  token_hash: string;
  expires_at: string;
  revoked: number;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export function getSession(
  testDb: TestDatabase,
  id: string,
): SessionRecord | null {
  const result = testDb.db
    .prepare("SELECT * FROM session WHERE id = ?")
    .get(id) as SessionRecord | undefined;

  return result ?? null;
}

export function getSessionByTokenHash(
  testDb: TestDatabase,
  tokenHash: string,
): SessionRecord | null {
  const result = testDb.db
    .prepare("SELECT * FROM session WHERE token_hash = ?")
    .get(tokenHash) as SessionRecord | undefined;

  return result ?? null;
}

export function getSessionCount(testDb: TestDatabase): number {
  const result = testDb.db
    .prepare("SELECT COUNT(*) as count FROM session")
    .get() as { count: number };

  return result.count;
}

export function getActiveSessionCountByIdentityId(
  testDb: TestDatabase,
  identityId: string,
): number {
  const result = testDb.db
    .prepare(
      "SELECT COUNT(*) as count FROM session WHERE identity_id = ? AND revoked = 0",
    )
    .get(identityId) as { count: number };

  return result.count;
}
