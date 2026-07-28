/**
 * Dev Username/Password Route Tests
 *
 * Exercises POST /auth/login in both single- and multi-tenant modes.
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { expect } from "chai";
import express from "express";
import cookieParser from "cookie-parser";
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
import { createPasswordAuthRoutes } from "../../../src/routes/password.js";
import { createTenantMiddleware } from "../../../src/middleware/tenant.js";
import type { AuthService } from "../../../src/services/auth-service.js";
import type { IIdentityRepository } from "../../../src/repositories/index.js";
import type { TenantConfig } from "../../../src/config.js";
import type { DevAuthConfig } from "../../../src/utils/dev-users.js";
import { TEST_TENANTS, TEST_JWT_SECRET } from "@agilehead/persona-test-utils";

const TEST_USERS = [
  { username: "alice", password: "alice-secret" },
  { username: "bob", password: "bob-secret" },
];

const SINGLE_TENANT_CONFIG: TenantConfig = {
  mode: "single",
  tenants: [TEST_TENANTS.DEFAULT],
};

const MULTI_TENANT_CONFIG: TenantConfig = {
  mode: "multi",
  tenants: [TEST_TENANTS.APP1, TEST_TENANTS.APP2],
};

describe("Password Routes", () => {
  let authService: AuthService;
  let identityRepo: IIdentityRepository;

  before(async () => {
    await setupTests();
    const db = getTestDb().db;
    identityRepo = createIdentityRepository(db);
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

  const DEFAULT_DEV_AUTH: DevAuthConfig = { users: TEST_USERS };

  function createTestApp(
    tenantConfig: TenantConfig,
    devAuth: DevAuthConfig = DEFAULT_DEV_AUTH,
  ) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      "/auth",
      createTenantMiddleware(tenantConfig),
      createPasswordAuthRoutes(authService, {
        devAuth,
        isProduction: false,
        cookieDomain: undefined,
      }),
    );
    return app;
  }

  describe("Single Tenant Mode", () => {
    it("logs in a valid user and returns tokens", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });

      expect(response.status).to.equal(200);
      expect(response.body.accessToken).to.be.a("string");
      expect(response.body.expiresIn).to.be.a("number");
      expect(response.body.identity.id).to.be.a("string");
      expect(response.body.identity.email).to.equal("alice@password.local");
      // The refresh token must NOT be in the body (httpOnly cookie only).
      expect(response.body.refreshToken).to.equal(undefined);
    });

    it("sets httpOnly access_token and refresh_token cookies", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });

      expect(response.status).to.equal(200);
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      const access = cookies?.find((c) => c.startsWith("access_token="));
      const refresh = cookies?.find((c) => c.startsWith("refresh_token="));
      expect(access).to.match(/HttpOnly/i);
      expect(refresh).to.match(/HttpOnly/i);
    });

    it("is case-sensitive on the username", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "Alice", password: "alice-secret" });

      expect(response.status).to.equal(401);
    });

    it("returns 401 for a wrong password", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "wrong" });

      expect(response.status).to.equal(401);
      expect(response.body.error).to.equal("Invalid username or password");
    });

    it("returns 401 for an unknown user", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "carol", password: "alice-secret" });

      expect(response.status).to.equal(401);
    });

    it("returns 400 when the password is missing", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "alice" });

      expect(response.status).to.equal(400);
    });

    it("returns 400 when the username is missing", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ password: "alice-secret" });

      expect(response.status).to.equal(400);
    });

    it("returns 400 for an empty body", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app).post("/auth/login").send({});

      expect(response.status).to.equal(400);
    });

    it('creates an identity with provider "password"', async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });

      const identity = await identityRepo.findByProvider(
        TEST_TENANTS.DEFAULT,
        "password",
        "alice",
      );
      expect(identity).to.not.equal(null);
      expect(identity?.provider).to.equal("password");
      expect(identity?.providerUserId).to.equal("alice");
    });

    it("is idempotent: repeated login reuses the same identity", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const first = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });
      const second = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });

      expect(first.status).to.equal(200);
      expect(second.status).to.equal(200);
      expect(second.body.identity.id).to.equal(first.body.identity.id);
    });
  });

  describe("Multi Tenant Mode", () => {
    it("logs in a valid user for an explicit tenant", async () => {
      const app = createTestApp(MULTI_TENANT_CONFIG);

      const response = await request(app)
        .post(`/auth/login?tenant=${TEST_TENANTS.APP1}`)
        .send({ username: "bob", password: "bob-secret" });

      expect(response.status).to.equal(200);
      expect(response.body.accessToken).to.be.a("string");
    });

    it("returns 400 when the tenant param is missing", async () => {
      const app = createTestApp(MULTI_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "bob", password: "bob-secret" });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("tenant parameter required");
    });

    it("isolates identities per tenant", async () => {
      const app = createTestApp(MULTI_TENANT_CONFIG);

      await request(app)
        .post(`/auth/login?tenant=${TEST_TENANTS.APP1}`)
        .send({ username: "alice", password: "alice-secret" });

      const inApp1 = await identityRepo.findByProvider(
        TEST_TENANTS.APP1,
        "password",
        "alice",
      );
      const inApp2 = await identityRepo.findByProvider(
        TEST_TENANTS.APP2,
        "password",
        "alice",
      );
      expect(inApp1).to.not.equal(null);
      expect(inApp2).to.equal(null);
    });
  });

  describe("Wildcard dev users", () => {
    const WILDCARD_DEV_AUTH: DevAuthConfig = {
      users: TEST_USERS,
      wildcardPassword: "wild-secret",
    };

    it("signs in an arbitrary username with the wildcard password", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const username = "ad-hoc-user@test.snapped";
      const response = await request(app)
        .post("/auth/login")
        .send({ username, password: "wild-secret" });

      expect(response.status).to.equal(200);
      expect(response.body.accessToken).to.be.a("string");
      expect(response.body.identity.id).to.be.a("string");

      // The identity is really created (get-or-create), keyed by the username.
      const identity = await identityRepo.findByProvider(
        TEST_TENANTS.DEFAULT,
        "password",
        username,
      );
      expect(identity).to.not.equal(null);
      expect(identity?.provider).to.equal("password");
      expect(identity?.providerUserId).to.equal(username);
    });

    it("uses an email-shaped username as the identity email", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const username = "real-email@example.com";
      const response = await request(app)
        .post("/auth/login")
        .send({ username, password: "wild-secret" });

      expect(response.status).to.equal(200);
      // The identity carries the real email, not "<username>@password.local".
      expect(response.body.identity.email).to.equal(username);
    });

    it("creates a distinct identity per arbitrary username", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const first = await request(app)
        .post("/auth/login")
        .send({ username: "user-one@test.snapped", password: "wild-secret" });
      const second = await request(app)
        .post("/auth/login")
        .send({ username: "user-two@test.snapped", password: "wild-secret" });

      expect(first.status).to.equal(200);
      expect(second.status).to.equal(200);
      expect(second.body.identity.id).to.not.equal(first.body.identity.id);
    });

    it("is idempotent: the same arbitrary username reuses its identity", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const first = await request(app)
        .post("/auth/login")
        .send({ username: "repeat@test.snapped", password: "wild-secret" });
      const second = await request(app)
        .post("/auth/login")
        .send({ username: "repeat@test.snapped", password: "wild-secret" });

      expect(first.status).to.equal(200);
      expect(second.status).to.equal(200);
      expect(second.body.identity.id).to.equal(first.body.identity.id);
    });

    it("rejects an arbitrary username with the wrong password", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const response = await request(app)
        .post("/auth/login")
        .send({
          username: "someone@test.snapped",
          password: "not-the-wildcard",
        });

      expect(response.status).to.equal(401);
    });

    it('rejects the reserved "*" username even with the wildcard password', async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "*", password: "wild-secret" });

      expect(response.status).to.equal(401);
    });

    it("keeps explicit users authoritative over the wildcard", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      // The explicit user authenticates with her own password.
      const own = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });
      expect(own.status).to.equal(200);

      // ...but the wildcard password must NOT work for a listed username.
      const viaWildcard = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "wild-secret" });
      expect(viaWildcard.status).to.equal(401);
    });

    it("signs in an arbitrary username per tenant and isolates identities", async () => {
      const app = createTestApp(MULTI_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const username = "cross-tenant@test.snapped";
      const response = await request(app)
        .post(`/auth/login?tenant=${TEST_TENANTS.APP1}`)
        .send({ username, password: "wild-secret" });

      expect(response.status).to.equal(200);
      expect(response.body.accessToken).to.be.a("string");

      const inApp1 = await identityRepo.findByProvider(
        TEST_TENANTS.APP1,
        "password",
        username,
      );
      const inApp2 = await identityRepo.findByProvider(
        TEST_TENANTS.APP2,
        "password",
        username,
      );
      expect(inApp1).to.not.equal(null);
      expect(inApp2).to.equal(null);
    });

    it("requires the tenant param for a wildcard login in multi-tenant mode", async () => {
      const app = createTestApp(MULTI_TENANT_CONFIG, WILDCARD_DEV_AUTH);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "no-tenant@test.snapped", password: "wild-secret" });

      expect(response.status).to.equal(400);
      expect(response.body.error).to.equal("tenant parameter required");
    });
  });
});
