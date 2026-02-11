import { expect } from "chai";
import { createPersonaClient, createNoOpPersonaClient } from "../client.js";
import type { PersonaConfig } from "../types.js";

type FetchCall = { url: string; init: RequestInit };

describe("PersonaClient", () => {
  let fetchCalls: FetchCall[];
  let fetchResponse: { status: number; body: unknown };
  const originalFetch = globalThis.fetch;

  const config: PersonaConfig = {
    endpoint: "http://localhost:4005",
    internalSecret: "test-secret",
  };

  beforeEach(() => {
    fetchCalls = [];
    fetchResponse = { status: 200, body: {} };
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      fetchCalls.push({ url: String(input), init: init ?? {} });
      return new Response(JSON.stringify(fetchResponse.body), {
        status: fetchResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("createPersonaClient", () => {
    describe("linkIdentityToUser", () => {
      it("should make correct POST request", async () => {
        fetchResponse = {
          status: 200,
          body: {
            success: true,
            accessToken: "at-123",
            refreshToken: "rt-456",
            identity: {
              id: "id-1",
              tenantId: "lesser",
              userId: "user-1",
              email: "test@example.com",
              roles: ["USER"],
            },
          },
        };

        const client = createPersonaClient(config);
        const result = await client.linkIdentityToUser(
          "id-1",
          "user-1",
          ["USER"],
        );

        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.data.accessToken).to.equal("at-123");
          expect(result.data.identity.userId).to.equal("user-1");
        }

        expect(fetchCalls).to.have.length(1);
        const call = fetchCalls[0]!;
        expect(call.url).to.equal(
          "http://localhost:4005/internal/identity/id-1/link",
        );
        expect(call.init.method).to.equal("POST");

        const headers = call.init.headers as Record<string, string>;
        expect(headers["X-Internal-Secret"]).to.equal("test-secret");

        const body = JSON.parse(call.init.body as string) as Record<
          string,
          unknown
        >;
        expect(body.userId).to.equal("user-1");
        expect(body.roles).to.deep.equal(["USER"]);
      });

      it("should include tenant query param when configured", async () => {
        fetchResponse = { status: 200, body: { success: true } };

        const tenantConfig: PersonaConfig = {
          ...config,
          tenantId: "my-tenant",
        };
        const client = createPersonaClient(tenantConfig);
        await client.linkIdentityToUser("id-1", "user-1", ["USER"]);

        expect(fetchCalls[0]!.url).to.include("?tenant=my-tenant");
      });
    });

    describe("updateUserRoles", () => {
      it("should make correct PUT request", async () => {
        fetchResponse = {
          status: 200,
          body: { success: true, updatedCount: 1 },
        };

        const client = createPersonaClient(config);
        const result = await client.updateUserRoles("user-1", [
          "USER",
          "ADMIN",
        ]);

        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.data.updatedCount).to.equal(1);
        }

        const call = fetchCalls[0]!;
        expect(call.url).to.equal(
          "http://localhost:4005/internal/user/user-1/roles",
        );
        expect(call.init.method).to.equal("PUT");

        const body = JSON.parse(call.init.body as string) as Record<
          string,
          unknown
        >;
        expect(body.roles).to.deep.equal(["USER", "ADMIN"]);
      });
    });

    describe("revokeUserSessions", () => {
      it("should make correct DELETE request", async () => {
        fetchResponse = {
          status: 200,
          body: { success: true, revokedCount: 3 },
        };

        const client = createPersonaClient(config);
        const result = await client.revokeUserSessions("user-1");

        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.data.revokedCount).to.equal(3);
        }

        const call = fetchCalls[0]!;
        expect(call.url).to.equal(
          "http://localhost:4005/internal/user/user-1/sessions",
        );
        expect(call.init.method).to.equal("DELETE");
      });
    });

    describe("error handling", () => {
      it("should return failure on non-200 response", async () => {
        fetchResponse = {
          status: 404,
          body: { error: "Identity not found" },
        };

        const client = createPersonaClient(config);
        const result = await client.linkIdentityToUser(
          "bad-id",
          "user-1",
          ["USER"],
        );

        expect(result.success).to.equal(false);
        if (!result.success) {
          expect(result.error.message).to.equal("Identity not found");
        }
      });

      it("should return failure on network error", async () => {
        globalThis.fetch = (() => {
          return Promise.reject(new Error("Connection refused"));
        }) as typeof fetch;

        const client = createPersonaClient(config);
        const result = await client.linkIdentityToUser(
          "id-1",
          "user-1",
          ["USER"],
        );

        expect(result.success).to.equal(false);
        if (!result.success) {
          expect(result.error.message).to.include("Connection refused");
        }
      });
    });
  });

  describe("createNoOpPersonaClient", () => {
    it("should return failure for all methods", async () => {
      const client = createNoOpPersonaClient();

      const link = await client.linkIdentityToUser("id", "user", ["USER"]);
      expect(link.success).to.equal(false);

      const roles = await client.updateUserRoles("user", ["ADMIN"]);
      expect(roles.success).to.equal(false);

      const revoke = await client.revokeUserSessions("user");
      expect(revoke.success).to.equal(false);
    });

    it("should log warnings when logger provided", async () => {
      const warnings: unknown[][] = [];
      const logger = {
        debug: () => {},
        info: () => {},
        warn: (...args: unknown[]) => {
          warnings.push(args);
        },
        error: () => {},
      };

      const client = createNoOpPersonaClient(logger);
      await client.linkIdentityToUser("id", "user", ["USER"]);

      expect(warnings).to.have.length(1);
      expect(warnings[0]![0]).to.include("not configured");
    });
  });
});
