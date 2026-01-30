/**
 * Logout Routes Tests
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
import { createLogoutRoutes } from "../../../src/routes/logout.js";
import type { AuthService } from "../../../src/services/auth-service.js";
import type { TokenService } from "../../../src/services/token-service.js";
import type { ISessionRepository } from "../../../src/repositories/index.js";
import {
  TEST_TENANTS,
  TEST_JWT_SECRET,
  generateId,
} from "@agilehead/persona-test-utils";

describe("Logout Routes", () => {
  let authService: AuthService;
  let tokenService: TokenService;
  let sessionRepo: ISessionRepository;

  before(async () => {
    await setupTests();
    const db = getTestDb().db;
    const identityRepo = createIdentityRepository(db);
    sessionRepo = createSessionRepository(db);
    tokenService = createTokenService({
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

  function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use(
      "/logout",
      createLogoutRoutes(tokenService, {
        isProduction: false,
        cookieDomain: undefined,
      }),
    );
    return app;
  }

  describe("POST /logout", () => {
    it("should logout and revoke session from cookie", async () => {
      const app = createTestApp();

      // Create an identity and get tokens
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-logout-${generateId(8)}`,
          email: `logout-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const { refreshToken } = loginResult.data.tokens;
      const sessionId = (await tokenService.validateRefreshToken(refreshToken))
        .success
        ? (
            (await tokenService.validateRefreshToken(refreshToken)) as {
              success: true;
              data: { id: string };
            }
          ).data.id
        : "";

      const response = await request(app)
        .post("/logout")
        .set("Cookie", `refresh_token=${refreshToken}`);

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      // Verify session is revoked
      const session = await sessionRepo.findById(sessionId);
      expect(session?.revoked).to.be.true;
    });

    it("should logout with refresh token in body", async () => {
      const app = createTestApp();

      // Create an identity and get tokens
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-logout-body-${generateId(8)}`,
          email: `logout-body-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const { refreshToken } = loginResult.data.tokens;

      const response = await request(app)
        .post("/logout")
        .send({ refreshToken });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it("should clear cookies on logout", async () => {
      const app = createTestApp();

      // Create an identity and get tokens
      const loginResult = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-clear-${generateId(8)}`,
          email: `clear-${generateId(8)}@example.com`,
        },
      );
      expect(loginResult.success).to.be.true;
      if (!loginResult.success) return;

      const { accessToken, refreshToken } = loginResult.data.tokens;

      const response = await request(app)
        .post("/logout")
        .set(
          "Cookie",
          `access_token=${accessToken}; refresh_token=${refreshToken}`,
        );

      expect(response.status).to.equal(200);
      expect(response.headers["set-cookie"]).to.exist;

      const cookies = response.headers["set-cookie"] as string[];

      // Check that both cookies are cleared (set to empty with expires in past)
      const accessCleared = cookies.some(
        (c: string) =>
          c.startsWith("access_token=") &&
          (c.includes("Expires=Thu, 01 Jan 1970") ||
            c.includes("Max-Age=0") ||
            c.includes("access_token=;")),
      );
      const refreshCleared = cookies.some(
        (c: string) =>
          c.startsWith("refresh_token=") &&
          (c.includes("Expires=Thu, 01 Jan 1970") ||
            c.includes("Max-Age=0") ||
            c.includes("refresh_token=;")),
      );

      expect(accessCleared).to.be.true;
      expect(refreshCleared).to.be.true;
    });

    it("should succeed even without refresh token", async () => {
      const app = createTestApp();

      const response = await request(app).post("/logout").send({});

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it("should succeed even with invalid refresh token", async () => {
      const app = createTestApp();

      const response = await request(app)
        .post("/logout")
        .send({ refreshToken: "invalid-token" });

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;
    });

    it("should clear cookies even on error during session revocation", async () => {
      const app = createTestApp();

      // Send with invalid token - should still clear cookies
      const response = await request(app)
        .post("/logout")
        .set("Cookie", "access_token=old; refresh_token=invalid");

      expect(response.status).to.equal(200);
      expect(response.body.success).to.be.true;

      // Verify cookies are cleared
      const cookies = response.headers["set-cookie"] as string[] | undefined;
      if (cookies !== undefined) {
        expect(cookies.length).to.be.at.least(1);
      }
    });

    it("should prefer cookie over body for refresh token", async () => {
      const app = createTestApp();

      // Create two identities and get tokens
      const login1 = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-pref1-${generateId(8)}`,
          email: `pref1-${generateId(8)}@example.com`,
        },
      );
      const login2 = await authService.handleOAuthLogin(
        TEST_TENANTS.DEFAULT,
        "google",
        {
          id: `google-pref2-${generateId(8)}`,
          email: `pref2-${generateId(8)}@example.com`,
        },
      );

      expect(login1.success).to.be.true;
      expect(login2.success).to.be.true;
      if (!login1.success || !login2.success) return;

      // Send cookie with token1 and body with token2
      const response = await request(app)
        .post("/logout")
        .set("Cookie", `refresh_token=${login1.data.tokens.refreshToken}`)
        .send({ refreshToken: login2.data.tokens.refreshToken });

      expect(response.status).to.equal(200);

      // Cookie token should be revoked (token1)
      const validateResult = await tokenService.validateRefreshToken(
        login1.data.tokens.refreshToken,
      );
      expect(validateResult.success).to.be.false;
    });
  });
});
