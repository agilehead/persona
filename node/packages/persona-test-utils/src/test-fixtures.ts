/**
 * Common test fixtures for Persona tests
 */

import { randomBytes } from "crypto";

// Generate a random alphanumeric ID of given length
export function generateId(length = 10): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = randomBytes(length);
  let result = "";
  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte !== undefined) {
      const charIndex = byte % chars.length;
      result += chars.charAt(charIndex);
    }
  }
  return result;
}

// Common test tenants
export const TEST_TENANTS = {
  DEFAULT: "test-tenant",
  LESSER: "lesser",
  APP1: "app1",
  APP2: "app2",
} as const;

// Create a test identity fixture
export function createTestIdentity(overrides?: {
  id?: string;
  tenantId?: string;
  provider?: string;
  providerUserId?: string;
  email?: string;
  name?: string | null;
  profileImageUrl?: string | null;
  userId?: string | null;
  roles?: string | null;
  metadata?: string | null;
}): {
  id: string;
  tenantId: string;
  provider: string;
  providerUserId: string;
  email: string;
  name: string | null;
  profileImageUrl: string | null;
  userId: string | null;
  roles: string | null;
  metadata: string | null;
} {
  const id = overrides?.id ?? generateId(10);
  const providerUserId = overrides?.providerUserId ?? `google-${generateId(8)}`;

  return {
    id,
    tenantId: overrides?.tenantId ?? TEST_TENANTS.DEFAULT,
    provider: overrides?.provider ?? "google",
    providerUserId,
    email: overrides?.email ?? `test-${id}@example.com`,
    name: overrides?.name ?? `Test User ${id}`,
    profileImageUrl: overrides?.profileImageUrl ?? null,
    userId: overrides?.userId ?? null,
    roles: overrides?.roles ?? null,
    metadata: overrides?.metadata ?? null,
  };
}

// Create a test session fixture
export function createTestSession(
  identityId: string,
  tenantId: string,
  overrides?: {
    id?: string;
    tokenHash?: string;
    expiresAt?: string;
    revoked?: number;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): {
  id: string;
  identityId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: string;
  revoked: number;
  ipAddress: string | null;
  userAgent: string | null;
} {
  const id = overrides?.id ?? generateId(10);
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 7); // 7 days from now

  return {
    id,
    identityId,
    tenantId,
    tokenHash: overrides?.tokenHash ?? generateId(64),
    expiresAt: overrides?.expiresAt ?? futureDate.toISOString(),
    revoked: overrides?.revoked ?? 0,
    ipAddress: overrides?.ipAddress ?? "127.0.0.1",
    userAgent: overrides?.userAgent ?? "TestClient/1.0",
  };
}

// JWT test secret
export const TEST_JWT_SECRET = "test-jwt-secret-for-persona-tests";

// Internal API test secret
export const TEST_INTERNAL_SECRET = "test-internal-secret-for-persona";

type TestConfig = {
  tenantMode: "single" | "multi";
  tenants: string[];
  jwtSecret: string;
  internalSecret: string;
};

// Test config for single tenant mode
export function createSingleTenantTestConfig(
  tenant: string = TEST_TENANTS.DEFAULT,
): TestConfig {
  return {
    tenantMode: "single" as const,
    tenants: [tenant],
    jwtSecret: TEST_JWT_SECRET,
    internalSecret: TEST_INTERNAL_SECRET,
  };
}

// Test config for multi tenant mode
export function createMultiTenantTestConfig(
  tenants: string[] = [TEST_TENANTS.APP1, TEST_TENANTS.APP2],
): TestConfig {
  return {
    tenantMode: "multi" as const,
    tenants,
    jwtSecret: TEST_JWT_SECRET,
    internalSecret: TEST_INTERNAL_SECRET,
  };
}
