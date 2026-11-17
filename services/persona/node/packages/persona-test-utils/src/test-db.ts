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
import Knex, { type Knex as KnexTypes } from "knex";
import { randomBytes } from "node:crypto";
const queries = Knex({ client: "better-sqlite3", useNullAsDefault: true });
function prepared(
  database: Database.Database,
  query: KnexTypes.QueryBuilder,
): {
  statement: Database.Statement;
  bindings: readonly unknown[];
} {
  const compiled = query.toSQL();
  return {
    statement: database.prepare(compiled.sql),
    bindings: compiled.bindings,
  };
}
export function queryRows(
  database: Database.Database,
  query: KnexTypes.QueryBuilder,
): unknown[] {
  const { statement, bindings } = prepared(database, query);
  return statement.all(...bindings);
}
export function writeQuery(
  database: Database.Database,
  query: KnexTypes.QueryBuilder,
): void {
  const { statement, bindings } = prepared(database, query);
  statement.run(...bindings);
}
export { queries };
import { createLogger, type Logger } from "@agilehead/persona-logger";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get project root (4 levels up from this file: src -> persona-test-utils -> packages -> node -> persona)
const PROJECT_ROOT = join(__dirname, "../../../../../..");

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
        directory: join(
          PROJECT_ROOT,
          "services/persona/database/persona/sqlite/migrations",
        ),
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
  testDb.db.transaction(() => {
    for (const name of ["session", "identity", "user_role", "user"])
      writeQuery(testDb.db, queries(name).delete());
  })();

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
  roles?: string[];
  metadata?: string | null;
  createdAt?: string;
  updatedAt?: string;
};
export function insertIdentity(
  testDb: TestDatabase,
  data: InsertIdentityData,
): void {
  const now = new Date().toISOString();
  testDb.db.transaction(() => {
    if (
      data.userId !== undefined &&
      data.userId !== null &&
      data.userId !== ""
    ) {
      const existing = queryRows(
        testDb.db,
        queries("user")
          .where({ tenant_id: data.tenantId, id: data.userId })
          .select("id"),
      );
      if (existing.length === 0) {
        writeQuery(
          testDb.db,
          queries("user").insert({
            tenant_id: data.tenantId,
            id: data.userId,
            role_version: randomBytes(32).toString("hex"),
            created_at: now,
            updated_at: now,
          }),
        );
        for (const role of data.roles ?? [])
          writeQuery(
            testDb.db,
            queries("user_role").insert({
              tenant_id: data.tenantId,
              user_id: data.userId,
              role,
            }),
          );
      }
    }
    writeQuery(
      testDb.db,
      queries("identity").insert({
        id: data.id,
        tenant_id: data.tenantId,
        provider: data.provider,
        provider_user_id: data.providerUserId,
        email: data.email,
        name: data.name ?? null,
        profile_image_url: data.profileImageUrl ?? null,
        user_id: data.userId ?? null,
        metadata: data.metadata ?? null,
        created_at: data.createdAt ?? now,
        updated_at: data.updatedAt ?? now,
      }),
    );
  })();
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
  metadata: string | null;
  created_at: string;
  updated_at: string;
};
export function getIdentity(
  testDb: TestDatabase,
  id: string,
): IdentityRecord | null {
  return (
    (queryRows(testDb.db, queries("identity").where({ id }).select())[0] as
      IdentityRecord | undefined) ?? null
  );
}
export function getIdentityByProvider(
  testDb: TestDatabase,
  tenantId: string,
  provider: string,
  providerUserId: string,
): IdentityRecord | null {
  return (
    (queryRows(
      testDb.db,
      queries("identity")
        .where({
          tenant_id: tenantId,
          provider,
          provider_user_id: providerUserId,
        })
        .select(),
    )[0] as IdentityRecord | undefined) ?? null
  );
}
function count(testDb: TestDatabase, query: KnexTypes.QueryBuilder): number {
  return (
    queryRows(testDb.db, query.count({ count: "*" }))[0] as { count: number }
  ).count;
}
export function getIdentityCount(testDb: TestDatabase): number {
  return count(testDb, queries("identity"));
}
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
  writeQuery(
    testDb.db,
    queries("session").insert({
      id: data.id,
      identity_id: data.identityId,
      tenant_id: data.tenantId,
      token_hash: data.tokenHash,
      expires_at: data.expiresAt,
      revoked: data.revoked ?? 0,
      ip_address: data.ipAddress ?? null,
      user_agent: data.userAgent ?? null,
      created_at: data.createdAt ?? new Date().toISOString(),
    }),
  );
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
  return (
    (queryRows(testDb.db, queries("session").where({ id }).select())[0] as
      SessionRecord | undefined) ?? null
  );
}
export function getSessionByTokenHash(
  testDb: TestDatabase,
  hash: string,
): SessionRecord | null {
  return (
    (queryRows(
      testDb.db,
      queries("session").where({ token_hash: hash }).select(),
    )[0] as SessionRecord | undefined) ?? null
  );
}
export function getSessionCount(testDb: TestDatabase): number {
  return count(testDb, queries("session"));
}
export function getActiveSessionCountByIdentityId(
  testDb: TestDatabase,
  id: string,
): number {
  return count(
    testDb,
    queries("session").where({ identity_id: id, revoked: 0 }),
  );
}
