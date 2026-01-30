/**
 * persona-test-utils - Test utilities for Persona service
 */

// Test database utilities
export {
  type TestDatabase,
  type TestDatabaseState,
  createTestDatabase,
  setupTestDatabase,
  truncateAllTables,
  teardownTestDatabase,
  getTestDatabaseInstance,
  getExternalTestDatabaseInstance,
  clearTestDatabaseInstance,
  // Identity helpers
  type InsertIdentityData,
  type IdentityRecord,
  insertIdentity,
  getIdentity,
  getIdentityByProvider,
  getIdentityCount,
  // Session helpers
  type InsertSessionData,
  type SessionRecord,
  insertSession,
  getSession,
  getSessionByTokenHash,
  getSessionCount,
  getActiveSessionCountByIdentityId,
} from "./test-db.js";

// Test fixtures
export {
  generateId,
  TEST_TENANTS,
  createTestIdentity,
  createTestSession,
  TEST_JWT_SECRET,
  TEST_INTERNAL_SECRET,
  createSingleTenantTestConfig,
  createMultiTenantTestConfig,
} from "./test-fixtures.js";
