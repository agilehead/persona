/**
 * Auth Service Tests
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { expect } from "chai";
import {
  setupTests,
  teardownTests,
  cleanupBetweenTests,
  getTestDb,
} from "../../setup.js";
import {
  createIdentityRepository,
  createSessionRepository,
} from "../../../src/repositories/index.js";
import { createTokenService } from "../../../src/services/token-service.js";
import { createAuthService } from "../../../src/services/auth-service.js";
import type { AuthService } from "../../../src/services/auth-service.js";
import type {
  IIdentityRepository,
  ISessionRepository,
} from "../../../src/repositories/index.js";
import {
  TEST_TENANTS,
  TEST_JWT_SECRET,
  generateId,
} from "@agilehead/persona-test-utils";

describe("Auth Service", () => {
  let identityRepo: IIdentityRepository;
  let sessionRepo: ISessionRepository;
  let authService: AuthService;

  before(async () => {
    await setupTests();
    identityRepo = createIdentityRepository(getTestDb().db);
    sessionRepo = createSessionRepository(getTestDb().db);
    const tokenService = createTokenService({
      sessionRepo,
      config: {
        jwtSecret: TEST_JWT_SECRET,
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d",
      },
    });
    authService = createAuthService({
      identityRepo,
      tokenService,
    });
  });

  after(async () => {
    await teardownTests();
  });

  beforeEach(() => {
    cleanupBetweenTests();
  });

  describe("handleOAuthLogin", () => {
    it("should create new identity on first login", async () => {
      const result = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: "google-new-user-123",
          email: "newuser@example.com",
          name: "New User",
          picture: "https://example.com/avatar.jpg",
        },
        "192.168.1.1",
        "TestBrowser/1.0",
      );

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.isNew).to.be.true;
        expect(result.data.identity.email).to.equal("newuser@example.com");
        expect(result.data.identity.tenantId).to.equal(TEST_TENANTS.DEFAULT);
        expect(result.data.tokens.accessToken).to.be.a("string");
        expect(result.data.tokens.refreshToken).to.be.a("string");
      }
    });

    it("should return existing identity on subsequent login", async () => {
      // First login
      const firstResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        { id: "google-returning-user", email: "returning@example.com" },
      );
      expect(firstResult.success).to.be.true;

      // Second login with same OAuth user
      const secondResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        { id: "google-returning-user", email: "returning@example.com" },
      );

      expect(secondResult.success).to.be.true;
      if (secondResult.success && firstResult.success) {
        expect(secondResult.data.isNew).to.be.false;
        expect(secondResult.data.identity.id).to.equal(
          firstResult.data.identity.id,
        );
      }
    });

    it("should create separate identities for same user in different tenants", async () => {
      const tenant1Result = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        { id: "google-cross-tenant", email: "cross@example.com" },
      );

      const tenant2Result = await authService.handleOAuthLogin(
        TEST_TENANTS.APP2,
        "google",
        { id: "google-cross-tenant", email: "cross@example.com" },
      );

      expect(tenant1Result.success).to.be.true;
      expect(tenant2Result.success).to.be.true;

      if (tenant1Result.success && tenant2Result.success) {
        expect(tenant1Result.data.identity.id).to.not.equal(
          tenant2Result.data.identity.id,
        );
        expect(tenant1Result.data.identity.tenantId).to.equal(
          TEST_TENANTS.APP1,
        );
        expect(tenant2Result.data.identity.tenantId).to.equal(
          TEST_TENANTS.APP2,
        );
      }
    });

    it("should handle OAuth login without optional fields", async () => {
      const result = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        { id: "google-minimal-user" }, // No email, name, or picture
      );

      expect(result.success).to.be.true;
      if (result.success) {
        // Should generate a placeholder email
        expect(result.data.identity.email).to.include("google.local");
      }
    });
  });

  describe("linkIdentityToUser", () => {
    it("should link identity to user with roles", async () => {
      // Create an unlinked identity
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        { id: "google-link-test", email: "link@example.com" },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const identityId = loginResult.data.identity.id;

      // Link to user
      const linkResult = await authService.linkIdentityToUser(
        identityId,
        "alice",
        ["user", "admin"],
      );

      expect(linkResult.success).to.be.true;
      if (linkResult.success) {
        expect(linkResult.data.identity.userId).to.equal("alice");
        expect(linkResult.data.identity.roles).to.deep.equal(["user", "admin"]);
        // Should return new tokens with updated identity info
        expect(linkResult.data.tokens.accessToken).to.be.a("string");
      }
    });

    it("should fail for non-existent identity", async () => {
      const result = await authService.linkIdentityToUser(
        "non-existent-identity",
        "bob",
        ["user"],
      );

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("NOT_FOUND");
      }
    });
  });

  describe("updateUserRoles", () => {
    it("should update roles for a user in a tenant", async () => {
      // Create and link an identity
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-roles-${generateId(8)}`,
          email: `roles-${generateId(8)}@example.com`,
        },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "role-update-user",
        ["user"],
      );

      // Update roles
      const result = await authService.updateUserRoles(
        TEST_TENANTS.DEFAULT,
        "role-update-user",
        ["user", "moderator", "admin"],
      );

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data).to.equal(1);
      }

      // Verify the update
      const identity = await authService.getIdentityByUserId(
        TEST_TENANTS.DEFAULT,
        "role-update-user",
      );
      expect(identity?.roles).to.deep.equal(["user", "moderator", "admin"]);
    });

    it("should only update roles in the specified tenant", async () => {
      // Create identities in different tenants
      const login1 = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        {
          id: `google-app1-${generateId(8)}`,
          email: `app1-${generateId(8)}@example.com`,
        },
      );
      const login2 = await authService.handleOAuthLogin(
        TEST_TENANTS.APP2,
        "google",
        {
          id: `google-app2-${generateId(8)}`,
          email: `app2-${generateId(8)}@example.com`,
        },
      );

      if (!login1.success || !login2.success) return;

      await authService.linkIdentityToUser(
        login1.data.identity.id,
        "tenant-roles-user",
        ["user"],
      );
      await authService.linkIdentityToUser(
        login2.data.identity.id,
        "tenant-roles-user",
        ["user"],
      );

      // Update only APP1
      await authService.updateUserRoles(
        TEST_TENANTS.APP1,
        "tenant-roles-user",
        ["admin"],
      );

      const identity1 = await authService.getIdentityByUserId(
        TEST_TENANTS.APP1,
        "tenant-roles-user",
      );
      const identity2 = await authService.getIdentityByUserId(
        TEST_TENANTS.APP2,
        "tenant-roles-user",
      );

      expect(identity1?.roles).to.deep.equal(["admin"]);
      expect(identity2?.roles).to.deep.equal(["user"]); // Unchanged
    });
  });

  describe("revokeUserSessions", () => {
    it("should revoke all sessions for a user", async () => {
      // Create and link an identity
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-revoke-${generateId(8)}`,
          email: `revoke-${generateId(8)}@example.com`,
        },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "session-revoke-user",
        ["user"],
      );

      // Create another session
      await authService.handleOAuthLogin(TEST_TENANTS.DEFAULT, "google", {
        id: `google-revoke-${generateId(8)}`,
        email: `revoke-${generateId(8)}@example.com`,
      });

      // Revoke all sessions
      const result = await authService.revokeUserSessions(
        TEST_TENANTS.DEFAULT,
        "session-revoke-user",
      );

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data).to.be.at.least(1);
      }
    });
  });

  describe("getIdentity", () => {
    it("should get identity by id", async () => {
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        { id: "google-get-test", email: "get@example.com" },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const identity = await authService.getIdentity(
        loginResult.data.identity.id,
      );

      expect(identity).to.not.be.null;
      expect(identity?.email).to.equal("get@example.com");
    });

    it("should return null for non-existent identity", async () => {
      const identity = await authService.getIdentity("non-existent");
      expect(identity).to.be.null;
    });
  });

  describe("getIdentityByUserId", () => {
    it("should get identity by tenant and userId", async () => {
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-by-user-${generateId(8)}`,
          email: `byuser-${generateId(8)}@example.com`,
        },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "lookup-by-user",
        ["user"],
      );

      const identity = await authService.getIdentityByUserId(
        TEST_TENANTS.DEFAULT,
        "lookup-by-user",
      );

      expect(identity).to.not.be.null;
      expect(identity?.userId).to.equal("lookup-by-user");
    });

    it("should not find user from different tenant", async () => {
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        {
          id: `google-wrong-tenant-${generateId(8)}`,
          email: `wrong-${generateId(8)}@example.com`,
        },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "wrong-tenant-user",
        ["user"],
      );

      // Try to find in different tenant
      const identity = await authService.getIdentityByUserId(
        TEST_TENANTS.APP2,
        "wrong-tenant-user",
      );

      expect(identity).to.be.null;
    });
  });
});
