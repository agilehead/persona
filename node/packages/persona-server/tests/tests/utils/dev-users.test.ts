/**
 * Dev Users Helper Tests (pure)
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import {
  parseDevUsers,
  verifyDevUser,
  resolveDevAuth,
} from "../../../src/utils/dev-users.js";

describe("dev-users", () => {
  describe("parseDevUsers", () => {
    it("parses a single user", () => {
      expect(parseDevUsers("alice:secret")).to.deep.equal([
        { username: "alice", password: "secret" },
      ]);
    });

    it("parses multiple users", () => {
      expect(parseDevUsers("alice:pw1,bob:pw2")).to.deep.equal([
        { username: "alice", password: "pw1" },
        { username: "bob", password: "pw2" },
      ]);
    });

    it("trims whitespace around entries", () => {
      expect(parseDevUsers(" alice:pw1 ,  bob:pw2 ")).to.deep.equal([
        { username: "alice", password: "pw1" },
        { username: "bob", password: "pw2" },
      ]);
    });

    it("ignores blank entries and trailing commas", () => {
      expect(parseDevUsers("alice:pw1,,bob:pw2,")).to.deep.equal([
        { username: "alice", password: "pw1" },
        { username: "bob", password: "pw2" },
      ]);
    });

    it("splits on the first colon so passwords may contain colons", () => {
      expect(parseDevUsers("alice:a:b:c")).to.deep.equal([
        { username: "alice", password: "a:b:c" },
      ]);
    });

    it("returns an empty list for an empty string", () => {
      expect(parseDevUsers("")).to.deep.equal([]);
    });

    it("throws when an entry has no colon", () => {
      expect(() => parseDevUsers("alice")).to.throw(/Invalid PERSONA_DEV_USERS/);
    });

    it("throws when the username is empty", () => {
      expect(() => parseDevUsers(":secret")).to.throw(
        /Invalid PERSONA_DEV_USERS/,
      );
    });

    it("throws when the password is empty", () => {
      expect(() => parseDevUsers("alice:")).to.throw(
        /Invalid PERSONA_DEV_USERS/,
      );
    });
  });

  describe("verifyDevUser", () => {
    const users = [
      { username: "alice", password: "alice-secret" },
      { username: "bob", password: "bob-secret" },
    ];

    it("returns true for a correct username/password", () => {
      expect(verifyDevUser(users, "alice", "alice-secret")).to.be.true;
      expect(verifyDevUser(users, "bob", "bob-secret")).to.be.true;
    });

    it("returns false for a wrong password", () => {
      expect(verifyDevUser(users, "alice", "wrong")).to.be.false;
    });

    it("returns false for an unknown username", () => {
      expect(verifyDevUser(users, "carol", "alice-secret")).to.be.false;
    });

    it("is case-sensitive on the username", () => {
      expect(verifyDevUser(users, "Alice", "alice-secret")).to.be.false;
    });

    it("returns false when no users are configured", () => {
      expect(verifyDevUser([], "alice", "alice-secret")).to.be.false;
    });
  });

  describe("resolveDevAuth", () => {
    it("returns undefined when the value is unset", () => {
      expect(resolveDevAuth(undefined, false)).to.equal(undefined);
    });

    it("returns undefined when the value is empty", () => {
      expect(resolveDevAuth("", false)).to.equal(undefined);
    });

    it("is hard-off in production even when users are configured", () => {
      expect(resolveDevAuth("alice:secret", true)).to.equal(undefined);
    });

    it("parses users outside production", () => {
      expect(resolveDevAuth("alice:secret", false)).to.deep.equal({
        users: [{ username: "alice", password: "secret" }],
      });
    });
  });
});
