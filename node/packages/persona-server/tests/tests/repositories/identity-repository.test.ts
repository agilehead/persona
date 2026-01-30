/**
 * Identity Repository Tests
 */

import { describe, it, before, after, beforeEach } from "mocha";
import { expect } from "chai";
import {
  setupTests,
  teardownTests,
  cleanupBetweenTests,
  getTestDb,
} from "../../setup.js";
import { createIdentityRepository } from "../../../src/repositories/index.js";
import type { IIdentityRepository } from "../../../src/repositories/index.js";
import { TEST_TENANTS, generateId } from "@agilehead/persona-test-utils";

describe("Identity Repository", () => {
  let identityRepo: IIdentityRepository;

  before(async () => {
    await setupTests();
    identityRepo = createIdentityRepository(getTestDb().db);
  });

  after(async () => {
    await teardownTests();
  });

  beforeEach(() => {
    cleanupBetweenTests();
  });

  describe("create", () => {
    it("should create a new identity with tenant", async () => {
      const identity = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "google-123",
        email: "test@example.com",
        name: "Test User",
        profileImageUrl: "https://example.com/avatar.jpg",
        metadata: { verified: true },
      });

      expect(identity).to.not.be.null;
      expect(identity.id).to.be.a("string");
      expect(identity.tenantId).to.equal(TEST_TENANTS.DEFAULT);
      expect(identity.provider).to.equal("google");
      expect(identity.providerUserId).to.equal("google-123");
      expect(identity.email).to.equal("test@example.com");
      expect(identity.name).to.equal("Test User");
      expect(identity.profileImageUrl).to.equal(
        "https://example.com/avatar.jpg",
      );
      expect(identity.userId).to.be.undefined;
      expect(identity.roles).to.deep.equal([]);
    });

    it("should create identity without optional fields", async () => {
      const identity = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "google-456",
        email: "minimal@example.com",
        name: undefined,
        profileImageUrl: undefined,
        metadata: undefined,
      });

      expect(identity.name).to.be.undefined;
      expect(identity.profileImageUrl).to.be.undefined;
      expect(identity.metadata).to.be.undefined;
    });

    it("should create identities in different tenants", async () => {
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP1,
        provider: "google",
        providerUserId: "same-user-id",
        email: "user@example.com",
      });

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP2,
        provider: "google",
        providerUserId: "same-user-id",
        email: "user@example.com",
      });

      expect(identity1.id).to.not.equal(identity2.id);
      expect(identity1.tenantId).to.equal(TEST_TENANTS.APP1);
      expect(identity2.tenantId).to.equal(TEST_TENANTS.APP2);
    });
  });

  describe("findById", () => {
    it("should find identity by id", async () => {
      const created = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "google-find-test",
        email: "find@example.com",
      });

      const found = await identityRepo.findById(created.id);

      expect(found).to.not.be.null;
      expect(found?.id).to.equal(created.id);
      expect(found?.email).to.equal("find@example.com");
    });

    it("should return null for non-existent identity", async () => {
      const found = await identityRepo.findById("non-existent-id");
      expect(found).to.be.null;
    });
  });

  describe("findByProvider", () => {
    it("should find identity by tenant+provider+providerUserId", async () => {
      await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "provider-test-123",
        email: "provider@example.com",
      });

      const found = await identityRepo.findByProvider(
        TEST_TENANTS.DEFAULT,
        "google",
        "provider-test-123",
      );

      expect(found).to.not.be.null;
      expect(found?.providerUserId).to.equal("provider-test-123");
    });

    it("should not find identity from different tenant", async () => {
      await identityRepo.create({
        tenantId: TEST_TENANTS.APP1,
        provider: "google",
        providerUserId: "cross-tenant-test",
        email: "cross@example.com",
      });

      const found = await identityRepo.findByProvider(
        TEST_TENANTS.APP2, // Different tenant
        "google",
        "cross-tenant-test",
      );

      expect(found).to.be.null;
    });

    it("should return null for non-existent provider combo", async () => {
      const found = await identityRepo.findByProvider(
        TEST_TENANTS.DEFAULT,
        "github", // Different provider
        "some-id",
      );
      expect(found).to.be.null;
    });
  });

  describe("findByUserId", () => {
    it("should find identity by tenant+userId", async () => {
      const identity = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "user-id-test",
        email: "userid@example.com",
      });

      await identityRepo.updateUserIdAndRoles(identity.id, "alice", ["user"]);

      const found = await identityRepo.findByUserId(
        TEST_TENANTS.DEFAULT,
        "alice",
      );

      expect(found).to.not.be.null;
      expect(found?.userId).to.equal("alice");
    });

    it("should not find user from different tenant", async () => {
      const identity = await identityRepo.create({
        tenantId: TEST_TENANTS.APP1,
        provider: "google",
        providerUserId: "cross-user-test",
        email: "crossuser@example.com",
      });

      await identityRepo.updateUserIdAndRoles(identity.id, "bob", ["user"]);

      const found = await identityRepo.findByUserId(TEST_TENANTS.APP2, "bob");

      expect(found).to.be.null;
    });
  });

  describe("updateUserIdAndRoles", () => {
    it("should update userId and roles", async () => {
      const identity = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "update-test",
        email: "update@example.com",
      });

      const updated = await identityRepo.updateUserIdAndRoles(
        identity.id,
        "charlie",
        ["user", "admin"],
      );

      expect(updated).to.not.be.null;
      expect(updated?.userId).to.equal("charlie");
      expect(updated?.roles).to.deep.equal(["user", "admin"]);
    });

    it("should return null for non-existent identity", async () => {
      const updated = await identityRepo.updateUserIdAndRoles(
        "non-existent",
        "user1",
        ["user"],
      );
      expect(updated).to.be.null;
    });
  });

  describe("updateRolesByUserId", () => {
    it("should update roles for all identities of a user in tenant", async () => {
      // Create two identities for same user (different providers)
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "google",
        providerUserId: "multi-id-1",
        email: "multi1@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity1.id, "multiuser", [
        "user",
      ]);

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.DEFAULT,
        provider: "github",
        providerUserId: "multi-id-2",
        email: "multi2@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity2.id, "multiuser", [
        "user",
      ]);

      // Update roles
      const count = await identityRepo.updateRolesByUserId(
        TEST_TENANTS.DEFAULT,
        "multiuser",
        ["user", "moderator"],
      );

      expect(count).to.equal(2);

      // Verify both updated
      const found1 = await identityRepo.findById(identity1.id);
      const found2 = await identityRepo.findById(identity2.id);

      expect(found1?.roles).to.deep.equal(["user", "moderator"]);
      expect(found2?.roles).to.deep.equal(["user", "moderator"]);
    });

    it("should only update identities in the specified tenant", async () => {
      const identity1 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP1,
        provider: "google",
        providerUserId: "tenant-role-1",
        email: "tenantrole1@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity1.id, "sameuser", [
        "user",
      ]);

      const identity2 = await identityRepo.create({
        tenantId: TEST_TENANTS.APP2,
        provider: "google",
        providerUserId: "tenant-role-2",
        email: "tenantrole2@example.com",
      });
      await identityRepo.updateUserIdAndRoles(identity2.id, "sameuser", [
        "user",
      ]);

      // Update roles only in APP1
      const count = await identityRepo.updateRolesByUserId(
        TEST_TENANTS.APP1,
        "sameuser",
        ["admin"],
      );

      expect(count).to.equal(1);

      // Verify only APP1 identity was updated
      const found1 = await identityRepo.findById(identity1.id);
      const found2 = await identityRepo.findById(identity2.id);

      expect(found1?.roles).to.deep.equal(["admin"]);
      expect(found2?.roles).to.deep.equal(["user"]); // Unchanged
    });
  });

  // Note: delete method not currently in interface - add if needed
});
