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

  function createTestApp(tenantConfig: TenantConfig) {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      "/auth",
      createTenantMiddleware(tenantConfig),
      createPasswordAuthRoutes(authService, {
        users: TEST_USERS,
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
      expect(response.body.refreshToken).to.be.a("string");
      expect(response.body.expiresIn).to.be.a("number");
      expect(response.body.identity.id).to.be.a("string");
      expect(response.body.identity.email).to.equal("alice@password.local");
    });

    it("sets access_token and refresh_token cookies", async () => {
      const app = createTestApp(SINGLE_TENANT_CONFIG);

      const response = await request(app)
        .post("/auth/login")
        .send({ username: "alice", password: "alice-secret" });

      expect(response.status).to.equal(200);
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      expect(cookies?.some((c) => c.startsWith("access_token="))).to.be.true;
      expect(cookies?.some((c) => c.startsWith("refresh_token="))).to.be.true;
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
});
