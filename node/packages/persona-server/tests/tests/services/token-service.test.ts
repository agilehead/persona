/**
 * Token Service Tests
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { expect } from "chai";
import jwt from "jsonwebtoken";
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
import type { TokenService } from "../../../src/services/token-service.js";
import type {
  IIdentityRepository,
  ISessionRepository,
} from "../../../src/repositories/index.js";
import type { Identity } from "../../../src/types.js";
import {
  TEST_TENANTS,
  TEST_JWT_SECRET,
  generateId,
} from "@agilehead/persona-test-utils";

describe("Token Service", () => {
  let identityRepo: IIdentityRepository;
  let sessionRepo: ISessionRepository;
  let tokenService: TokenService;

  before(async () => {
    await setupTests();
    identityRepo = createIdentityRepository(getTestDb().db);
    sessionRepo = createSessionRepository(getTestDb().db);
    tokenService = createTokenService({
      sessionRepo,
      config: {
        jwtSecret: TEST_JWT_SECRET,
        accessTokenExpiry: "15m",
        refreshTokenExpiry: "7d",
      },
    });
  });

  after(async () => {
    await teardownTests();
  });

  beforeEach(() => {
    cleanupBetweenTests();
  });

  async function createTestIdentity(
    overrides?: Partial<{
      tenantId: string;
      userId: string | null;
      roles: string[];
    }>,
  ): Promise<Identity> {
    const identity = await identityRepo.create({
      tenantId: overrides?.tenantId ?? TEST_TENANTS.DEFAULT,
      provider: "google",
      providerUserId: `test-${generateId(8)}`,
      email: `test-${generateId(8)}@example.com`,
      name: "Test User",
    });

    if (overrides?.userId !== undefined) {
      const updated = await identityRepo.updateUserIdAndRoles(
        identity.id,
        overrides.userId ?? "testuser",
        overrides.roles ?? ["user"],
      );
      if (updated !== null) {
        return updated;
      }
    }

    return identity;
  }

  describe("generateTokens", () => {
    it("should generate access and refresh tokens", async () => {
      const identity = await createTestIdentity();

      const { tokens, session } = await tokenService.generateTokens(
        identity,
        "192.168.1.1",
        "TestBrowser/1.0",
      );

      expect(tokens.accessToken).to.be.a("string");
      expect(tokens.refreshToken).to.be.a("string");
      expect(tokens.expiresIn).to.equal(900); // 15 minutes in seconds
      expect(session.id).to.be.a("string");
      expect(session.identityId).to.equal(identity.id);
      expect(session.tenantId).to.equal(identity.tenantId);
    });

    it("should include tenant in JWT payload", async () => {
      const identity = await createTestIdentity({
        tenantId: TEST_TENANTS.APP1,
      });

      const { tokens } = await tokenService.generateTokens(identity);

      const decoded = jwt.verify(tokens.accessToken, TEST_JWT_SECRET) as {
        tenant: string;
        sub: string;
      };

      expect(decoded.tenant).to.equal(TEST_TENANTS.APP1);
      expect(decoded.sub).to.equal(identity.id);
    });

    it("should include user info in JWT when linked", async () => {
      const identity = await createTestIdentity({
        userId: "alice",
        roles: ["user", "admin"],
      });

      const { tokens } = await tokenService.generateTokens(identity);

      const decoded = jwt.verify(tokens.accessToken, TEST_JWT_SECRET) as {
        userId: string;
        roles: string[];
      };

      expect(decoded.userId).to.equal("alice");
      expect(decoded.roles).to.deep.equal(["user", "admin"]);
    });

    it("should store session in database", async () => {
      const identity = await createTestIdentity();

      const { session } = await tokenService.generateTokens(identity);

      const found = await sessionRepo.findById(session.id);
      expect(found).to.not.be.null;
      expect(found?.identityId).to.equal(identity.id);
      expect(found?.tenantId).to.equal(identity.tenantId);
    });
  });

  describe("generateAccessToken", () => {
    it("should generate a valid access token", async () => {
      const identity = await createTestIdentity();

      const accessToken = tokenService.generateAccessToken(
        identity,
        "session-123",
      );

      expect(accessToken).to.be.a("string");

      const decoded = jwt.verify(accessToken, TEST_JWT_SECRET) as {
        sub: string;
        sessionId: string;
      };
      expect(decoded.sub).to.equal(identity.id);
      expect(decoded.sessionId).to.equal("session-123");
    });
  });

  describe("verifyAccessToken", () => {
    it("should verify a valid token", async () => {
      const identity = await createTestIdentity();

      const { tokens } = await tokenService.generateTokens(identity);

      const result = tokenService.verifyAccessToken(tokens.accessToken);

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.sub).to.equal(identity.id);
        expect(result.data.tenant).to.equal(identity.tenantId);
      }
    });

    it("should fail for invalid token", () => {
      const result = tokenService.verifyAccessToken("invalid-token");

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("INVALID_TOKEN");
      }
    });

    it("should fail for token signed with different secret", () => {
      const fakeToken = jwt.sign({ sub: "test" }, "wrong-secret");

      const result = tokenService.verifyAccessToken(fakeToken);

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("INVALID_TOKEN");
      }
    });

    it("should fail for expired token", async () => {
      // Create a service with very short expiry
      const shortExpiryService = createTokenService({
        sessionRepo,
        config: {
          jwtSecret: TEST_JWT_SECRET,
          accessTokenExpiry: "1s", // 1 second
          refreshTokenExpiry: "7d",
        },
      });

      const identity = await createTestIdentity();
      const { tokens } = await shortExpiryService.generateTokens(identity);

      // Wait for token to expire
      await new Promise((resolve) => setTimeout(resolve, 1100));

      const result = shortExpiryService.verifyAccessToken(tokens.accessToken);

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("INVALID_TOKEN");
        expect(result.error.message).to.equal("Token expired");
      }
    });
  });

  describe("validateRefreshToken", () => {
    it("should validate a valid refresh token", async () => {
      const identity = await createTestIdentity();

      const { tokens, session } = await tokenService.generateTokens(identity);

      const result = await tokenService.validateRefreshToken(
        tokens.refreshToken,
      );

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data.id).to.equal(session.id);
        expect(result.data.identityId).to.equal(identity.id);
      }
    });

    it("should fail for invalid refresh token", async () => {
      const result = await tokenService.validateRefreshToken(
        "invalid-refresh-token",
      );

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("INVALID_TOKEN");
      }
    });

    it("should fail for revoked session", async () => {
      const identity = await createTestIdentity();

      const { tokens, session } = await tokenService.generateTokens(identity);

      // Revoke the session
      await sessionRepo.revoke(session.id);

      const result = await tokenService.validateRefreshToken(
        tokens.refreshToken,
      );

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.message).to.equal("Session has been revoked");
      }
    });
  });

  describe("revokeSession", () => {
    it("should revoke a session", async () => {
      const identity = await createTestIdentity();

      const { session } = await tokenService.generateTokens(identity);

      const result = await tokenService.revokeSession(session.id);

      expect(result.success).to.be.true;

      const found = await sessionRepo.findById(session.id);
      expect(found?.revoked).to.be.true;
    });

    it("should fail for non-existent session", async () => {
      const result = await tokenService.revokeSession("non-existent");

      expect(result.success).to.be.false;
      if (!result.success) {
        expect(result.error.code).to.equal("NOT_FOUND");
      }
    });
  });

  describe("revokeAllIdentitySessions", () => {
    it("should revoke all sessions for an identity", async () => {
      const identity = await createTestIdentity();

      // Create multiple sessions
      await tokenService.generateTokens(identity);
      await tokenService.generateTokens(identity);

      const result = await tokenService.revokeAllIdentitySessions(identity.id);

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data).to.equal(2);
      }
    });
  });

  describe("revokeAllUserSessions", () => {
    it("should revoke all sessions for a user in a tenant", async () => {
      // Create two identities for same user
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: `user-sess-1-${generateId(8)}`,
        email: `usersess1-${generateId(8)}@example.com`,
      });
      await identityRepo.updateUserIdAndRoles(
        identity1.id,
        "multi-session-user",
        ["user"],
      );

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "github",
        providerUserId: `user-sess-2-${generateId(8)}`,
        email: `usersess2-${generateId(8)}@example.com`,
      });
      await identityRepo.updateUserIdAndRoles(
        identity2.id,
        "multi-session-user",
        ["user"],
      );

      // Create sessions for both identities
      await tokenService.generateTokens(identity1);
      await tokenService.generateTokens(identity2);

      const result = await tokenService.revokeAllUserSessions(
        TEST_TENANTS.DEFAULT,
        "multi-session-user",
      );

      expect(result.success).to.be.true;
      if (result.success) {
        expect(result.data).to.equal(2);
      }
    });
  });
});
