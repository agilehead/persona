/**
 * Test Setup - Manages test database lifecycle
 * Supports two modes:
 *   - Local: creates its own test database and runs migrations
 *   - External: connects to a running server via TEST_URL / TEST_DB_PATH env vars
 */

import {
  getTestDatabaseInstance,
  getExternalTestDatabaseInstance,
  setupTestDatabase,
  teardownTestDatabase,
  truncateAllTables,
  clearTestDatabaseInstance,
  type TestDatabase,
} from "@agilehead/persona-test-utils";

let testDb: TestDatabase | null = null;
let initialized = false;

/**
 * Get the test database instance
 */
export function getTestDb(): TestDatabase {
  if (testDb === null) {
    throw new Error("Test database not initialized. Call setupTests() first.");
  }
  return testDb;
}

/**
 * Setup tests - call in before() hook.
 * Safe to call multiple times; only initializes once.
 */
export async function setupTests(): Promise<void> {
  if (initialized) return;

  const externalUrl = process.env.TEST_URL;
  const externalDbPath = process.env.TEST_DB_PATH;

  if (externalUrl !== undefined && externalDbPath !== undefined) {
    // External mode: connect to a running server (e.g., Docker Compose)
    testDb = getExternalTestDatabaseInstance(externalDbPath);
  } else {
    // Local mode: create a test database
    testDb = getTestDatabaseInstance();
  }

  await setupTestDatabase(testDb);
  initialized = true;
}

/**
 * Cleanup between tests - call in beforeEach() hook
 */
export function cleanupBetweenTests(): void {
  if (testDb !== null) {
    truncateAllTables(testDb);
  }
}

/**
 * Teardown tests - call in after() hook.
 * Safe to call multiple times; only tears down once.
 */
export async function teardownTests(): Promise<void> {
  if (testDb !== null && initialized) {
    await teardownTestDatabase(testDb);
    testDb = null;
    initialized = false;
    clearTestDatabaseInstance();
  }
}

/**
 * Setup global before/after hooks for mocha.
 * Centralizes lifecycle so individual test files can also call
 * setupTests/teardownTests safely (they become no-ops after first call).
 */
export function setupGlobalHooks(): void {
  before(async function () {
    this.timeout(60000);
    await setupTests();
  });

  after(async function () {
    this.timeout(30000);
    await teardownTests();
  });
}
