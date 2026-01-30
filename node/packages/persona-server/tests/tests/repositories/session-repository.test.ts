/**
 * Session Repository Tests
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
import type {
  IIdentityRepository,
  ISessionRepository,
} from "../../../src/repositories/index.js";
import { TEST_TENANTS, generateId } from "@agilehead/persona-test-utils";

describe("Session Repository", () => {
  let identityRepo: IIdentityRepository;
  let sessionRepo: ISessionRepository;

  before(async () => {
    await setupTests();
    identityRepo = createIdentityRepository(getTestDb().db);
    sessionRepo = createSessionRepository(getTestDb().db);
  });

  after(async () => {
    await teardownTests();
  });

  beforeEach(() => {
    cleanupBetweenTests();
  });

  async function createTestIdentity(tenantId: string = TEST_TENANTS.DEFAULT) {
    return identityRepo.create({
      tenantId,
      provider: "google",
      providerUserId: `test-${generateId(8)}`,
      email: `test-${generateId(8)}@example.com`,
    });
  }

  describe("create", () => {
    it("should create a new session with tenant", async () => {
      const identity = await createTestIdentity();

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const session = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "token-hash-123",
        expiresAt,
        ipAddress: "192.168.1.1",
        userAgent: "TestBrowser/1.0",
      });

      expect(session).to.not.be.null;
      expect(session.id).to.be.a("string");
      expect(session.identityId).to.equal(identity.id);
      expect(session.tenantId).to.equal(identity.tenantId);
      expect(session.tokenHash).to.equal("token-hash-123");
      expect(session.revoked).to.be.false;
      expect(session.ipAddress).to.equal("192.168.1.1");
      expect(session.userAgent).to.equal("TestBrowser/1.0");
    });

    it("should create session without optional fields", async () => {
      const identity = await createTestIdentity();

      const session = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "minimal-hash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      expect(session.ipAddress).to.be.undefined;
      expect(session.userAgent).to.be.undefined;
    });
  });

  describe("findById", () => {
    it("should find session by id", async () => {
      const identity = await createTestIdentity();
      const created = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "find-by-id-hash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const found = await sessionRepo.findById(created.id);

      expect(found).to.not.be.null;
      expect(found?.id).to.equal(created.id);
      expect(found?.tokenHash).to.equal("find-by-id-hash");
    });

    it("should return null for non-existent session", async () => {
      const found = await sessionRepo.findById("non-existent-id");
      expect(found).to.be.null;
    });
  });

  describe("findByTokenHash", () => {
    it("should find session by token hash", async () => {
      const identity = await createTestIdentity();
      const created = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "unique-token-hash-12345",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const found = await sessionRepo.findByTokenHash(
        "unique-token-hash-12345",
      );

      expect(found).to.not.be.null;
      expect(found?.id).to.equal(created.id);
    });

    it("should return null for non-existent token hash", async () => {
      const found = await sessionRepo.findByTokenHash("non-existent-hash");
      expect(found).to.be.null;
    });
  });

  describe("findByIdentityId", () => {
    it("should find all sessions for an identity", async () => {
      const identity = await createTestIdentity();

      await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "session-1-hash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "session-2-hash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const sessions = await sessionRepo.findByIdentityId(identity.id);

      expect(sessions).to.have.lengthOf(2);
    });

    it("should return empty array for identity with no sessions", async () => {
      const identity = await createTestIdentity();
      const sessions = await sessionRepo.findByIdentityId(identity.id);
      expect(sessions).to.have.lengthOf(0);
    });
  });

  describe("revoke", () => {
    it("should revoke a session", async () => {
      const identity = await createTestIdentity();
      const session = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "revoke-test-hash",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const revoked = await sessionRepo.revoke(session.id);
      expect(revoked).to.be.true;

      const found = await sessionRepo.findById(session.id);
      expect(found?.revoked).to.be.true;
    });

    it("should return false for non-existent session", async () => {
      const revoked = await sessionRepo.revoke("non-existent");
      expect(revoked).to.be.false;
    });
  });

  describe("revokeAllByIdentityId", () => {
    it("should revoke all sessions for an identity", async () => {
      const identity = await createTestIdentity();

      const session1 = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "revoke-all-1",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const session2 = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "revoke-all-2",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const count = await sessionRepo.revokeAllByIdentityId(identity.id);
      expect(count).to.equal(2);

      const found1 = await sessionRepo.findById(session1.id);
      const found2 = await sessionRepo.findById(session2.id);

      expect(found1?.revoked).to.be.true;
      expect(found2?.revoked).to.be.true;
    });
  });

  describe("revokeAllByUserId", () => {
    it("should revoke all sessions for a user across identities in a tenant", async () => {
      // Create two identities for same user
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "user-revoke-1",
        email: "revoke1@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity1.id, "revoke-user", [
        "user",
      ]);

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "github",
        providerUserId: "user-revoke-2",
        email: "revoke2@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity2.id, "revoke-user", [
        "user",
      ]);

      // Create sessions for both identities
      await sessionRepo.create({
        identityId: identity1.id,
        tenantId: identity1.tenantId,
        tokenHash: "user-session-1",
        expiresAt: new Date(Date.now() + 86400000),
      });

      await sessionRepo.create({
        identityId: identity2.id,
        tenantId: identity2.tenantId,
        tokenHash: "user-session-2",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const count = await sessionRepo.revokeAllByUserId(
        TEST_TENANTS.DEFAULT,
        "revoke-user",
      );
      expect(count).to.equal(2);
    });

    it("should only revoke sessions in the specified tenant", async () => {
      // Create identities in different tenants with same userId
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP1,
        provider: "google",
        providerUserId: "cross-tenant-1",
        email: "cross1@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity1.id, "cross-user", [
        "user",
      ]);

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP2,
        provider: "google",
        providerUserId: "cross-tenant-2",
        email: "cross2@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity2.id, "cross-user", [
        "user",
      ]);

      // Create sessions
      const session1 = await sessionRepo.create({
        identityId: identity1.id,
        tenantId: identity1.tenantId,
        tokenHash: "cross-session-1",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const session2 = await sessionRepo.create({
        identityId: identity2.id,
        tenantId: identity2.tenantId,
        tokenHash: "cross-session-2",
        expiresAt: new Date(Date.now() + 86400000),
      });

      // Revoke only in APP1
      const count = await sessionRepo.revokeAllByUserId(
        TEST_TENANTS.APP1,
        "cross-user",
      );
      expect(count).to.equal(1);

      // Verify only APP1 session was revoked
      const found1 = await sessionRepo.findById(session1.id);
      const found2 = await sessionRepo.findById(session2.id);

      expect(found1?.revoked).to.be.true;
      expect(found2?.revoked).to.be.false; // Unchanged
    });
  });

  describe("deleteExpired", () => {
    it("should delete expired sessions", async () => {
      const identity = await createTestIdentity();

      // Create an expired session
      const pastDate = new Date(Date.now() - 86400000); // 1 day ago
      await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "expired-hash",
        expiresAt: pastDate,
      });

      // Create a valid session
      const futureDate = new Date(Date.now() + 86400000);
      const validSession = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash: "valid-hash",
        expiresAt: futureDate,
      });

      const deletedCount = await sessionRepo.deleteExpired();
      expect(deletedCount).to.be.at.least(1);

      // Valid session should still exist
      const found = await sessionRepo.findById(validSession.id);
      expect(found).to.not.be.null;
    });
  });
});
