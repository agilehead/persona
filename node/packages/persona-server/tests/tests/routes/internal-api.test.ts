/**
 * Internal API Route Tests
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { expect } from "chai";
import express from "express";
import request from "supertest";
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
import { createInternalAuthMiddleware } from "../../../src/middleware/internal-auth.js";
import { createInternalRoutes } from "../../../src/routes/internal/index.js";
import type { TenantConfig } from "../../../src/config.js";
import type { AuthService } from "../../../src/services/auth-service.js";
import {
  TEST_TENANTS,
  TEST_JWT_SECRET,
  TEST_INTERNAL_SECRET,
  generateId,
} from "@agilehead/persona-test-utils";

describe("Internal API Routes", () => {
  let authService: AuthService;

  before(async () => {
    await setupTests();
    const db = getTestDb().db;
    const identityRepo = createIdentityRepository(db);
    const sessionRepo = createSessionRepository(db);
    const tokenService = createTokenService({
      sessionRepo,
      config: {
        jwtSecret: TEST_JWT_SECRET,
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d",
      },
    });
    authService = createAuthService({ identityRepo, tokenService });
  });

  after(async () => {
    await teardownTests();
  });

  beforeEach(() => {
    cleanupBetweenTests();
  });

  function createTestApp(tenantConfig: TenantConfig) {
    const app = express();
    app.use(express.json());
    app.use(createInternalAuthMiddleware(TEST_INTERNAL_SECRET));
    app.use("/internal", createInternalRoutes(authService, tenantConfig));
    return app;
  }

  describe("Authentication", () => {
    const singleTenantConfig: TenantConfig = {
      mode: "single",
      tenants: [TEST_TENANTS.DEFAULT],
    };

    it("should reject requests without X-Internal-Secret header", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app)
        .post("/internal/identity/some-id/link")
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal("Unauthorized");
    });

    it("should reject requests with invalid secret", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app)
        .post("/internal/identity/some-id/link")
        .set("X-Internal-Secret", "wrong-secret")
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal("Unauthorized");
    });

    it("should accept requests with valid secret", async () => {
      const app = createTestApp(singleTenantConfig);

      // This will fail with 404 because identity doesn't exist,
      // but it proves authentication passed
      const response = await request(app)
        .post("/internal/identity/non-existent/link")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(404); // Not 401
    });
  });

  describe("Link Identity (Single Tenant)", () => {
    const singleTenantConfig: TenantConfig = {
      mode: "single",
      tenants: [TEST_TENANTS.DEFAULT],
    };

    it("should link identity to user", async () => {
      const app = createTestApp(singleTenantConfig);

      // Create an identity first
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-link-${generateId(8)}`,
          email: `link-${generateId(8)}@example.com`,
        },
      );

      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const identityId = loginResult.data.identity.id;

      const response = await request(app)
        .post(`/internal/identity/${identityId}/link`)
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "alice", roles: ["user", "admin"] });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.identity.userId).to.equal("alice");
      expect(response.body.identity.roles).to.deep.equal(["user", "admin"]);
      expect(response.body.accessToken).to.be.a("string");
      expect(response.body.refreshToken).to.be.a("string");
    });

    it("should return 400 for invalid request body", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app)
        .post("/internal/identity/some-id/link")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "ab", roles: [] }); // userId too short, roles empty

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("Invalid request body");
    });

    it("should return 404 for non-existent identity", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app)
        .post("/internal/identity/non-existent-id/link")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(404);
    });
  });

  describe("Update Roles (Single Tenant)", () => {
    const singleTenantConfig: TenantConfig = {
      mode: "single",
      tenants: [TEST_TENANTS.DEFAULT],
    };

    it("should update user roles", async () => {
      const app = createTestApp(singleTenantConfig);

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
        "role-test-user",
        ["user"],
      );

      const response = await request(app)
        .post("/internal/user/role-test-user/roles")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ roles: ["user", "moderator", "admin"] });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.updatedCount).to.equal(1);
    });

    it("should return 400 for empty roles array", async () => {
      const app = createTestApp(singleTenantConfig);

      const response = await request(app)
        .post("/internal/user/some-user/roles")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ roles: [] });

      expect(response.status).to.equal(400);
    });
  });

  describe("Revoke Sessions (Single Tenant)", () => {
    const singleTenantConfig: TenantConfig = {
      mode: "single",
      tenants: [TEST_TENANTS.DEFAULT],
    };

    it("should revoke all user sessions", async () => {
      const app = createTestApp(singleTenantConfig);

      // Create and link an identity
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-sess-${generateId(8)}`,
          email: `sess-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "session-test-user",
        ["user"],
      );

      const response = await request(app)
        .delete("/internal/user/session-test-user/sessions")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
      expect(response.body.revokedCount).to.be.at.least(1);
    });
  });

  describe("Multi Tenant Mode", () => {
    const multiTenantConfig: TenantConfig = {
      mode: "multi",
      tenants: [TEST_TENANTS.APP1, TEST_TENANTS.APP2],
    };

    it("should require tenant param for link", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app)
        .post("/internal/identity/some-id/link")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("tenant parameter required");
    });

    it("should link identity with tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      // Create an identity in APP1
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        {
          id: `google-mt-${generateId(8)}`,
          email: `mt-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const response = await request(app)
        .post(
          `/internal/identity/${loginResult.data.identity.id}/link?tenant=${TEST_TENANTS.APP1}`,
        )
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "bob", roles: ["user"] });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it("should reject invalid tenant", async () => {
      const app = createTestApp(multiTenantConfig);

      const response = await request(app)
        .post("/internal/identity/some-id/link?tenant=invalid-tenant")
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ userId: "alice", roles: ["user"] });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("invalid tenant");
    });

    it("should update roles with tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      // Create and link an identity in APP1
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        {
          id: `google-mt-roles-${generateId(8)}`,
          email: `mt-roles-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "mt-role-user",
        ["user"],
      );

      const response = await request(app)
        .post(`/internal/user/mt-role-user/roles?tenant=${TEST_TENANTS.APP1}`)
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET)
        .send({ roles: ["admin"] });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it("should revoke sessions with tenant param", async () => {
      const app = createTestApp(multiTenantConfig);

      // Create and link an identity in APP1
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.APP1,
        "google",
        {
          id: `google-mt-sess-${generateId(8)}`,
          email: `mt-sess-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      await authService.linkIdentityToUser(
        loginResult.data.identity.id,
        "mt-sess-user",
        ["user"],
      );

      const response = await request(app)
        .delete(
          `/internal/user/mt-sess-user/sessions?tenant=${TEST_TENANTS.APP1}`,
        )
        .set("X-Internal-Secret", TEST_INTERNAL_SECRET);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });
  });
});
