/**
 * Test Setup - Manages test database lifecycle
 */

import {
  getTestDatabaseInstance,
  setupTestDatabase,
  teardownTestDatabase,
  truncateAllTables,
  clearTestDatabaseInstance,
  type TestDatabase,
} from "@agilehead/persona-test-utils";

let testDb: TestDatabase | null = null;

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
 * Setup tests - call in before() hook
 */
export async function setupTests(): Promise<void> {
  testDb = getTestDatabaseInstance();
  await setupTestDatabase(testDb);
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
 * Teardown tests - call in after() hook
 */
export async function teardownTests(): Promise<void> {
  if (testDb !== null) {
    await teardownTestDatabase(testDb);
    testDb = null;
    clearTestDatabaseInstance();
  }
}
