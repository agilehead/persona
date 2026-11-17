import { createServer } from "node:http";
import { describe, it, beforeEach, afterEach } from "node:test";
import { expect } from "chai";
import { createPersonaClient, createNoOpPersonaClient } from "../client.js";
import type { PersonaConfig } from "../types.js";

type FetchCall = { url: string; init: RequestInit };

function first<T>(values: readonly T[]): T {
  const value = values[0];
  if (value === undefined) throw new Error("Expected at least one item");
  return value;
}

void describe("PersonaClient", () => {
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
    globalThis.fetch = async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      fetchCalls.push({
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        init: init ?? {},
      });
      return new Response(JSON.stringify(fetchResponse.body), {
        status: fetchResponse.status,
        headers: { "Content-Type": "application/json" },
      });
    };
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  void describe("createPersonaClient", () => {
    void describe("linkIdentityToUser", () => {
      void it("should make correct POST request", async () => {
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
        const result = await client.linkIdentityToUser("id-1", "user-1", [
          "USER",
        ]);

        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.data.accessToken).to.equal("at-123");
          expect(result.data.identity.userId).to.equal("user-1");
        }

        expect(fetchCalls).to.have.length(1);
        const call = first(fetchCalls);
        expect(call.url).to.equal(
          "http://localhost:4005/internal/identity/id-1/link",
        );
        expect(call.init.method).to.equal("POST");

        const headers = call.init.headers as Record<string, string>;
        expect(headers.Authorization).to.equal("Bearer test-secret");

        const body = JSON.parse(call.init.body as string) as Record<
          string,
          unknown
        >;
        expect(body.userId).to.equal("user-1");
        expect(body.roles).to.deep.equal(["USER"]);
      });

      void it("should include tenant query param when configured", async () => {
        fetchResponse = { status: 200, body: { success: true } };

        const tenantConfig: PersonaConfig = {
          ...config,
          tenantId: "my-tenant",
        };
        const client = createPersonaClient(tenantConfig);
        await client.linkIdentityToUser("id-1", "user-1", ["USER"]);

        expect(first(fetchCalls).url).to.include("?tenant=my-tenant");
      });
    });

    void it("reads one authoritative role resource with encoded identity and tenant", async () => {
      fetchResponse = {
        status: 200,
        body: {
          userId: "user-1",
          exists: true,
          roles: ["admin"],
          etag: '"roles-test"',
        },
      };
      const result = await createPersonaClient({
        ...config,
        tenantId: "test-tenant",
      }).getUserRoles("user-1");
      expect(result.success).to.equal(true);
      if (result.success) expect(result.data.roles).to.deep.equal(["admin"]);
      expect(first(fetchCalls).url).to.equal(
        "http://localhost:4005/internal/user/user-1/roles?tenant=test-tenant",
      );
      expect(first(fetchCalls).init.method).to.equal("GET");
    });
    void it("looks up memberships in one bulk request including absent users", async () => {
      fetchResponse = {
        status: 200,
        body: {
          users: [{ userId: "missing", exists: false, roles: [], etag: null }],
        },
      };
      const result = await createPersonaClient(config).lookupUserRoles([
        "missing",
      ]);
      expect(result.success).to.equal(true);
      if (result.success) expect(result.data.users[0]?.exists).to.equal(false);
      expect(first(fetchCalls).url).to.equal(
        "http://localhost:4005/internal/users/role-lookups",
      );
      expect(first(fetchCalls).init.body).to.equal(
        JSON.stringify({ userIds: ["missing"] }),
      );
    });

    void describe("updateUserRoles", () => {
      void it("should make correct PUT request", async () => {
        fetchResponse = {
          status: 200,
          body: {
            success: true,
            user: {
              userId: "user-1",
              exists: true,
              roles: ["USER", "ADMIN"],
              etag: "updated",
            },
          },
        };

        const client = createPersonaClient(config);
        const result = await client.updateUserRoles(
          "user-1",
          ["USER", "ADMIN"],
          '"roles-test"',
        );

        expect(result.success).to.equal(true);
        if (result.success) {
          expect(result.data.user.roles).to.deep.equal(["USER", "ADMIN"]);
        }

        const call = first(fetchCalls);
        expect(call.url).to.equal(
          "http://localhost:4005/internal/user/user-1/roles",
        );
        expect(call.init.method).to.equal("PUT");
        expect(
          (call.init.headers as Record<string, string>)["If-Match"],
        ).to.equal('"roles-test"');

        const body = JSON.parse(call.init.body as string) as Record<
          string,
          unknown
        >;
        expect(body.roles).to.deep.equal(["USER", "ADMIN"]);
      });
    });

    void it("keeps its deadline active while reading a stalled response body", async () => {
      globalThis.fetch = originalFetch;
      let beganBody = false;
      const server = createServer((_request, response) => {
        response.writeHead(200, { "Content-Type": "application/json" });
        response.write("{");
        beganBody = true;
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      try {
        const address = server.address();
        if (address === null || typeof address === "string")
          throw new Error("Missing test listener");
        const result = await createPersonaClient({
          ...config,
          endpoint: `http://127.0.0.1:${String(address.port)}`,
          timeout: 500,
        }).getUserRoles("user-1");
        expect(beganBody).to.equal(true);
        expect(result.success).to.equal(false);
        if (!result.success)
          expect(result.error.message).to.equal("Request timed out");
      } finally {
        server.closeAllConnections();
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        );
      }
    });

    void describe("revokeUserSessions", () => {
      void it("should make correct DELETE request", async () => {
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

        const call = first(fetchCalls);
        expect(call.url).to.equal(
          "http://localhost:4005/internal/user/user-1/sessions",
        );
        expect(call.init.method).to.equal("DELETE");
      });
    });

    void describe("error handling", () => {
      void it("should return failure on non-200 response", async () => {
        fetchResponse = {
          status: 404,
          body: { error: "Identity not found" },
        };

        const client = createPersonaClient(config);
        const result = await client.linkIdentityToUser("bad-id", "user-1", [
          "USER",
        ]);

        expect(result.success).to.equal(false);
        if (!result.success) {
          expect(result.error.message).to.equal("Identity not found");
        }
      });

      void it("should return failure on network error", async () => {
        globalThis.fetch = () => {
          return Promise.reject(new Error("Connection refused"));
        };

        const client = createPersonaClient(config);
        const result = await client.linkIdentityToUser("id-1", "user-1", [
          "USER",
        ]);

        expect(result.success).to.equal(false);
        if (!result.success) {
          expect(result.error.message).to.include("Connection refused");
        }
      });
    });
  });

  void describe("createNoOpPersonaClient", () => {
    void it("should return failure for all methods", async () => {
      const client = createNoOpPersonaClient();

      const link = await client.linkIdentityToUser("id", "user", ["USER"]);
      expect(link.success).to.equal(false);

      const roles = await client.updateUserRoles(
        "user",
        ["ADMIN"],
        '"roles-test"',
      );
      expect(roles.success).to.equal(false);

      expect((await client.getUserRoles("user")).success).to.equal(false);
      expect((await client.lookupUserRoles(["user"])).success).to.equal(false);
      const revoke = await client.revokeUserSessions("user");
      expect(revoke.success).to.equal(false);
    });

    void it("should log warnings when logger provided", async () => {
      const warnings: unknown[][] = [];
      const logger = {
        debug: () => undefined,
        info: () => undefined,
        warn: (...args: unknown[]) => {
          warnings.push(args);
        },
        error: () => undefined,
      };

      const client = createNoOpPersonaClient(logger);
      await client.linkIdentityToUser("id", "user", ["USER"]);

      expect(warnings).to.have.length(1);
      expect(first(warnings)[0]).to.include("not configured");
    });
  });
});
