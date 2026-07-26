/**
 * Dev Users Helper Tests (pure)
 */

import { describe, it } from "mocha";
import { expect } from "chai";
import {
  parseDevUsers,
  verifyDevUser,
  resolveDevAuth,
  type DevAuthConfig,
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

    it("parses a wildcard entry like any other pair", () => {
      expect(parseDevUsers("*:test-password")).to.deep.equal([
        { username: "*", password: "test-password" },
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
    const config: DevAuthConfig = {
      users: [
        { username: "alice", password: "alice-secret" },
        { username: "bob", password: "bob-secret" },
      ],
    };

    it("returns true for a correct username/password", () => {
      expect(verifyDevUser(config, "alice", "alice-secret")).to.be.true;
      expect(verifyDevUser(config, "bob", "bob-secret")).to.be.true;
    });

    it("returns false for a wrong password", () => {
      expect(verifyDevUser(config, "alice", "wrong")).to.be.false;
    });

    it("returns false for an unknown username", () => {
      expect(verifyDevUser(config, "carol", "alice-secret")).to.be.false;
    });

    it("is case-sensitive on the username", () => {
      expect(verifyDevUser(config, "Alice", "alice-secret")).to.be.false;
    });

    it("returns false when no users are configured", () => {
      expect(verifyDevUser({ users: [] }, "alice", "alice-secret")).to.be.false;
    });

    describe("wildcard", () => {
      const wildcardConfig: DevAuthConfig = {
        users: [{ username: "alice", password: "alice-secret" }],
        wildcardPassword: "wild-secret",
      };

      it("accepts any username with the wildcard password", () => {
        expect(verifyDevUser(wildcardConfig, "carol", "wild-secret")).to.be
          .true;
        expect(
          verifyDevUser(
            wildcardConfig,
            "someone-else@test.local",
            "wild-secret",
          ),
        ).to.be.true;
      });

      it("rejects an unlisted username with the wrong password", () => {
        expect(verifyDevUser(wildcardConfig, "carol", "nope")).to.be.false;
      });

      it("lets an explicit user take precedence over the wildcard", () => {
        // alice authenticates with her own password...
        expect(verifyDevUser(wildcardConfig, "alice", "alice-secret")).to.be
          .true;
        // ...but NOT with the wildcard password (explicit entries are authoritative).
        expect(verifyDevUser(wildcardConfig, "alice", "wild-secret")).to.be
          .false;
      });

      it('never authenticates the reserved "*" username', () => {
        expect(verifyDevUser(wildcardConfig, "*", "wild-secret")).to.be.false;
      });

      it("wildcard-only config authenticates any non-reserved username", () => {
        const wildcardOnly: DevAuthConfig = {
          users: [],
          wildcardPassword: "w",
        };
        expect(verifyDevUser(wildcardOnly, "anyone", "w")).to.be.true;
        expect(verifyDevUser(wildcardOnly, "*", "w")).to.be.false;
      });
    });
  });

  describe("resolveDevAuth", () => {
    it("returns undefined when the value is unset", () => {
      expect(resolveDevAuth(undefined, "development")).to.equal(undefined);
    });

    it("returns undefined when the value is empty", () => {
      expect(resolveDevAuth("", "development")).to.equal(undefined);
    });

    it("enables in development", () => {
      expect(resolveDevAuth("alice:secret", "development")).to.deep.equal({
        users: [{ username: "alice", password: "secret" }],
      });
    });

    it("enables in test", () => {
      expect(resolveDevAuth("alice:secret", "test")).to.deep.equal({
        users: [{ username: "alice", password: "secret" }],
      });
    });

    it("enables when NODE_ENV is unset", () => {
      expect(resolveDevAuth("alice:secret", undefined)).to.deep.equal({
        users: [{ username: "alice", password: "secret" }],
      });
    });

    it("is fail-closed in production", () => {
      expect(resolveDevAuth("alice:secret", "production")).to.equal(undefined);
    });

    it("is fail-closed in an unrecognized environment (e.g. staging)", () => {
      expect(resolveDevAuth("alice:secret", "staging")).to.equal(undefined);
    });

    it("returns undefined when no valid users are configured", () => {
      expect(resolveDevAuth(",", "development")).to.equal(undefined);
    });

    describe("wildcard", () => {
      it("lifts a wildcard-only entry into wildcardPassword and enables login", () => {
        expect(resolveDevAuth("*:test-password", "development")).to.deep.equal({
          users: [],
          wildcardPassword: "test-password",
        });
      });

      it("keeps explicit users alongside the wildcard", () => {
        expect(
          resolveDevAuth("alice:alice-secret,*:wild", "test"),
        ).to.deep.equal({
          users: [{ username: "alice", password: "alice-secret" }],
          wildcardPassword: "wild",
        });
      });

      it("does not leave the wildcard entry in the users list", () => {
        const resolved = resolveDevAuth("*:wild", "development");
        expect(resolved?.users).to.deep.equal([]);
      });

      it("throws on more than one wildcard entry", () => {
        expect(() => resolveDevAuth("*:a,*:b", "development")).to.throw(
          /multiple wildcard/,
        );
      });

      it("is fail-closed for a wildcard in production", () => {
        expect(resolveDevAuth("*:wild", "production")).to.equal(undefined);
      });
    });
  });
});
