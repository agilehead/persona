import {
  queries,
  queryRows,
} from "../../node/packages/persona-test-utils/dist/index.js";
import assert from "node:assert/strict";
import { roleContracts } from "./roles.mjs";
import { createHash, createHmac } from "node:crypto";
import {
  insertIdentity,
  insertSession,
} from "../../node/packages/persona-test-utils/dist/index.js";

export async function contracts({
  url,
  database,
  mode,
  secret,
  internalSecret,
}) {
  let passed = 0;
  const tenant = mode === "multi" ? "?tenant=app1" : "";
  const tenantId = mode === "multi" ? "app1" : "test-tenant";
  async function check(name, operation) {
    await operation();
    passed++;
    console.info(`HTTP contract PASS: ${name}`);
  }
  async function request(path, body, options = {}) {
    const response = await fetch(url + path, {
      method: "POST",
      headers: { "content-type": "application/json", ...options.headers },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
      ...options,
    });
    const text = await response.text();
    return {
      status: response.status,
      headers: response.headers,
      text,
      body: text.startsWith("{") ? JSON.parse(text) : null,
    };
  }
  function jwt(token) {
    const [header, payload, signature] = token.split(".");
    assert.equal(JSON.parse(Buffer.from(header, "base64url")).alg, "HS256");
    assert.equal(
      signature,
      createHmac("sha256", secret)
        .update(header + "." + payload)
        .digest("base64url"),
    );
    return JSON.parse(Buffer.from(payload, "base64url"));
  }
  function refresh(response) {
    const cookie = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("refresh_token="));
    assert(cookie, "refresh cookie is present");
    assert.match(cookie, /HttpOnly/i);
    return cookie.split(";", 1)[0].slice("refresh_token=".length);
  }
  const auth = {
    headers: {
      authorization: "Bearer " + internalSecret,
      "content-type": "application/json",
    },
  };
  await check("health", async () => {
    const response = await request("/health", undefined, { method: "GET" });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "ok" });
  });
  await check(
    "public auth configuration describes the actual enabled providers",
    async () => {
      const result = await request("/auth/config", undefined, {
        method: "GET",
      });
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, {
        googleEnabled: mode === "multi",
        devLoginEnabled: mode !== "production",
        tenantRequired: mode === "multi",
      });
      assert.match(result.headers.get("cache-control"), /no-store/);
      assert.equal(result.headers.get("x-content-type-options"), "nosniff");
    },
  );
  await check("internal authentication", async () => {
    assert.equal(
      (
        await request("/internal/identity/missing/link" + tenant, {
          userId: "alice",
          roles: ["USER"],
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request(
          "/internal/identity/missing/link" + tenant,
          { userId: "alice", roles: ["USER"] },
          {
            headers: {
              authorization: "Bearer wrong",
              "content-type": "application/json",
            },
          },
        )
      ).status,
      401,
    );
  });
  await check("tenant boundary", async () => {
    const path = "/internal/identity/missing/link";
    const response = await request(
      path + (mode === "multi" ? "" : "?tenant=forbidden"),
      { userId: "alice", roles: ["USER"] },
      auth,
    );
    assert.equal(response.status, 400);
    assert.equal(
      response.body.error,
      mode === "multi"
        ? "tenant parameter required"
        : "tenant parameter not allowed in single-tenant mode",
    );
  });
  await check(
    "tenant validation rejects empty, duplicate and unconfigured values",
    async () => {
      const path = "/internal/identity/missing/link";
      for (const query of [
        "?tenant=",
        "?tenant=unknown",
        "?tenant=app1&tenant=app2",
        "?tenant=app%2F1",
      ]) {
        const response = await request(
          path + query,
          { userId: "alice", roles: ["USER"] },
          auth,
        );
        assert.equal(response.status, 400);
      }
      if (mode === "multi") {
        for (const query of ["?tenant=app1", "?tenant=app%32"]) {
          const response = await request(
            path + query,
            { userId: "alice", roles: ["USER"] },
            auth,
          );
          assert.equal(
            response.status,
            404,
            "configured tenants pass boundary validation",
          );
        }
      }
    },
  );
  await check("unknown identity", async () => {
    const response = await request(
      "/internal/identity/missing/link" + tenant,
      { userId: "alice", roles: ["USER"] },
      auth,
    );
    assert.equal(response.status, 404);
    assert.equal(response.body.error, "Identity not found");
  });
  await check("validation details", async () => {
    const response = await request(
      "/internal/identity/missing/link" + tenant,
      { userId: "ab", roles: [] },
      auth,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(response.body, {
      error: "Invalid request body",
      details: [
        {
          origin: "string",
          code: "too_small",
          minimum: 3,
          inclusive: true,
          path: ["userId"],
          message: "Too small: expected string to have >=3 characters",
        },
      ],
    });
  });
  await check("missing validation fields", async () => {
    const response = await request(
      "/internal/identity/missing/link" + tenant,
      {},
      auth,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(
      response.body.details.map((issue) => issue.path),
      [["userId"], ["roles"]],
    );
    assert(
      response.body.details.every((issue) => issue.code === "invalid_type"),
    );
  });
  await check("invalid roles", async () => {
    const response = await request(
      "/internal/identity/missing/link" + tenant,
      { userId: "alice", roles: [1] },
      auth,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(response.body.details[0].path, ["roles", 0]);
  });
  await check("null validation fields", async () => {
    const response = await request(
      "/internal/identity/missing/link" + tenant,
      { userId: null, roles: null },
      auth,
    );
    assert.equal(response.status, 400);
    assert.deepEqual(
      response.body.details.map((issue) => issue.message),
      [
        "Invalid input: expected string, received null",
        "Invalid input: expected array, received null",
      ],
    );
  });
  await check("malformed JSON is rejected before authentication", async () => {
    const response = await fetch(
      url + "/internal/identity/missing/link" + tenant,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{",
      },
    );
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "Malformed JSON body" });
  });
  const seededId = "contract-seeded";
  insertIdentity(database, {
    id: seededId,
    tenantId,
    provider: "google",
    providerUserId: "seeded-google",
    email: "seeded@example.test",
    name: "Name 東京",
  });
  const seedRefresh = "seeded-refresh";
  insertSession(database, {
    id: "contract-session",
    identityId: seededId,
    tenantId,
    tokenHash: createHash("sha256").update(seedRefresh).digest("hex"),
    expiresAt: new Date(Date.now() + 60000).toISOString(),
  });
  await check("refresh a persisted session", async () => {
    const response = await request("/token/refresh", {
      refreshToken: seedRefresh,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.expiresIn, 900);
    assert.equal(jwt(response.body.accessToken).sub, seededId);
    assert.equal(refresh(response), seedRefresh);
    const stored = queryRows(
      database.db,
      queries("session").where({ id: "contract-session" }).select("expires_at"),
    )[0];
    assert(
      Date.parse(stored.expires_at) > Date.now() + 6 * 86400000,
      "rolling window moves forward",
    );
  });
  await check("cookie attributes", async () => {
    const response = await request("/token/refresh", {
      refreshToken: seedRefresh,
    });
    for (const value of response.headers.getSetCookie()) {
      assert.match(value, /Max-Age=604800/i);
      assert.match(value, /Path=\//i);
      assert.match(value, /HttpOnly/i);
      assert.match(
        value,
        mode === "production" ? /SameSite=None/i : /SameSite=Lax/i,
      );
      if (mode === "production") assert.match(value, /Secure/i);
    }
  });
  await check("refresh cookie precedence", async () => {
    const response = await request(
      "/token/refresh",
      { refreshToken: seedRefresh },
      {
        headers: {
          "content-type": "application/json",
          cookie: "refresh_token=invalid",
          origin: "http://localhost:3000",
        },
      },
    );
    assert.equal(response.status, 401);
    assert.equal(response.body.error, "Invalid refresh token");
    assert.equal(response.headers.getSetCookie().length, 2);
  });
  await check(
    "session mutations reject hostile, opaque and missing cookie origins before any change",
    async () => {
      const before = queryRows(
        database.db,
        queries("session").where({ id: "contract-session" }).select(),
      )[0];
      for (const endpoint of [
        "/logout",
        "/token/refresh",
        "/auth/login" + tenant,
      ]) {
        for (const origin of [
          "https://hostile.example",
          "null",
          "http://localhost:3000.hostile.example",
          undefined,
        ]) {
          const response = await fetch(url + endpoint, {
            method: "POST",
            headers: {
              "content-type": "application/x-www-form-urlencoded",
              cookie: "refresh_token=" + seedRefresh,
              ...(origin === undefined ? {} : { origin }),
            },
            body: "refreshToken=ignored&username=alice&password=alice-secret",
          });
          assert.equal(response.status, 403);
          assert.deepEqual(response.headers.getSetCookie(), []);
          assert.deepEqual(
            queryRows(
              database.db,
              queries("session").where({ id: "contract-session" }).select(),
            )[0],
            before,
          );
        }
      }
      const allowed = await request(
        "/token/refresh",
        {},
        {
          headers: {
            "content-type": "application/json",
            cookie: "refresh_token=" + seedRefresh,
            origin: "http://localhost:3000",
          },
        },
      );
      assert.equal(allowed.status, 200);
      assert.equal(
        allowed.headers.get("access-control-allow-origin"),
        "http://localhost:3000",
      );
      assert.equal(
        (await request("/token/refresh", { refreshToken: seedRefresh })).status,
        200,
        "Non-browser token clients do not require ambient cookies or a browser origin",
      );
    },
  );
  await check("refresh missing and invalid", async () => {
    assert.equal(
      (await request("/token/refresh", {})).body.error,
      "No refresh token provided",
    );
    assert.equal(
      (await request("/token/refresh", { refreshToken: 12 })).status,
      401,
    );
    assert.equal(
      (await request("/token/refresh", { refreshToken: "invalid" })).status,
      401,
    );
  });
  await check("link existing identity", async () => {
    const response = await request(
      `/internal/identity/${seededId}/link${tenant}`,
      { userId: "alice", roles: ["USER", "ADMIN"] },
      auth,
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.deepEqual(response.body.identity, {
      id: seededId,
      tenantId,
      userId: "alice",
      email: "seeded@example.test",
      roles: ["ADMIN", "USER"],
    });
    const claims = jwt(response.body.accessToken);
    assert.equal(claims.userId, "alice");
    assert.equal(claims.name, "Name 東京");
    assert.match(response.body.refreshToken, /^[0-9a-f]{64}$/);
    assert.deepEqual(
      (
        await request("/internal/user/alice/roles" + tenant, undefined, {
          ...auth,
          method: "GET",
        })
      ).body.roles,
      ["ADMIN", "USER"],
    );
  });
  async function roleEtag() {
    return (
      await request("/internal/user/alice/roles" + tenant, undefined, {
        ...auth,
        method: "GET",
      })
    ).headers.get("etag");
  }
  await check("role updates", async () => {
    const etag = await roleEtag();
    const response = await request(
      "/internal/user/alice/roles" + tenant,
      { roles: ["MODERATOR"] },
      {
        ...auth,
        method: "PUT",
        headers: { ...auth.headers, "if-match": etag },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.success, true);
    assert.equal(Object.hasOwn(response.body, "updatedCount"), false);
    assert.deepEqual(response.body.user.roles, ["MODERATOR"]);
    assert.equal(
      jwt(
        (await request("/token/refresh", { refreshToken: seedRefresh })).body
          .accessToken,
      ).roles[0],
      "MODERATOR",
    );
  });
  await check("URL encoded role arrays", async () => {
    const etag = await roleEtag();
    const response = await fetch(url + "/internal/user/alice/roles" + tenant, {
      method: "PUT",
      headers: {
        authorization: "Bearer " + internalSecret,
        "content-type": "application/x-www-form-urlencoded",
        "if-match": etag,
      },
      body: "roles[]=MODERATOR&roles[]=REVIEWER",
    });
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).user.roles, [
      "MODERATOR",
      "REVIEWER",
    ]);
    assert.deepEqual(
      (
        await request("/internal/user/alice/roles" + tenant, undefined, {
          ...auth,
          method: "GET",
        })
      ).body.roles,
      ["MODERATOR", "REVIEWER"],
    );
  });
  passed += await roleContracts({
    request,
    tenant,
    tenantId,
    auth,
    seededId,
    mode,
  });
  await check("revoke user sessions", async () => {
    const response = await request(
      "/internal/user/alice/sessions" + tenant,
      undefined,
      { ...auth, method: "DELETE" },
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.revokedCount, 3);
    const rejected = await request("/token/refresh", {
      refreshToken: seedRefresh,
    });
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.error, "Session has been revoked");
  });
  await check("logout is idempotent", async () => {
    for (const body of [{}, { refreshToken: "invalid" }]) {
      const response = await request("/logout", body);
      assert.equal(response.status, 200);
      assert.deepEqual(response.body, { success: true });
      assert.equal(response.headers.getSetCookie().length, 2);
    }
  });
  if (mode === "production") {
    await check("development login disabled in production", async () => {
      assert.equal(
        (
          await request("/auth/login", {
            username: "alice",
            password: "alice-secret",
          })
        ).status,
        404,
      );
    });
    return passed;
  }
  await check("development credentials validated", async () => {
    assert.equal((await request("/auth/login" + tenant, {})).status, 400);
    assert.equal(
      (await request("/auth/login" + tenant, { username: "alice" })).status,
      400,
    );
    assert.equal(
      (await request("/auth/login" + tenant, { password: "alice-secret" }))
        .status,
      400,
    );
    assert.equal(
      (
        await request("/auth/login" + tenant, {
          username: "alice",
          password: "wrong",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login" + tenant, {
          username: "*",
          password: "wild-secret",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login" + tenant, {
          username: "alice",
          password: "wild-secret",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login" + tenant, {
          username: "Alice",
          password: "alice-secret",
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request("/auth/login" + tenant, {
          username: "unknown",
          password: "wrong",
        })
      ).status,
      401,
    );
  });
  let login;
  await check("development login wire and storage", async () => {
    login = await request("/auth/login" + tenant, {
      username: "alice",
      password: "alice-secret",
    });
    assert.equal(login.status, 200);
    assert.equal(login.body.refreshToken, undefined);
    assert.equal(login.body.expiresIn, 900);
    assert.deepEqual(Object.keys(login.body.identity).sort(), [
      "email",
      "id",
      "name",
      "roles",
    ]);
    const row = queryRows(
      database.db,
      queries("identity").where({ id: login.body.identity.id }).select(),
    )[0];
    assert.match(row.id, /^[0-9A-Za-z]{16}$/);
    assert.equal(row.metadata, "{}");
    assert.equal(Object.hasOwn(row, "roles"), false);
    assert.equal(row.provider, "password");
    assert.equal(row.tenant_id, tenantId);
    assert.match(row.created_at, /\.\d{3}Z$/);
    const token = refresh(login);
    const session = queryRows(
      database.db,
      queries("session")
        .where({ token_hash: createHash("sha256").update(token).digest("hex") })
        .select(),
    )[0];
    assert.equal(session.identity_id, row.id);
    assert.equal(jwt(login.body.accessToken).sessionId, session.id);
  });
  await check("repeat login reuses identity", async () => {
    const response = await request("/auth/login" + tenant, {
      username: "alice",
      password: "alice-secret",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.identity.id, login.body.identity.id);
  });
  await check("wildcard email identity", async () => {
    const response = await request("/auth/login" + tenant, {
      username: "wild@example.test",
      password: "wild-secret",
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.identity.email, "wild@example.test");
    assert.equal(jwt(response.body.accessToken).tenant, tenantId);
  });
  await check("logout revokes selected cookie session", async () => {
    const token = refresh(login);
    const response = await request(
      "/logout",
      { refreshToken: "ignored" },
      {
        headers: {
          "content-type": "application/json",
          cookie: "refresh_token=" + token,
          origin: "http://localhost:3000",
        },
      },
    );
    assert.equal(response.status, 200);
    assert.equal(
      (await request("/token/refresh", { refreshToken: token })).status,
      401,
    );
  });
  if (mode === "multi")
    await check("tenant identity isolation", async () => {
      const other = await request("/auth/login?tenant=app2", {
        username: "alice",
        password: "alice-secret",
      });
      assert.equal(other.status, 200);
      assert.notEqual(other.body.identity.id, login.body.identity.id);
      assert.equal(jwt(other.body.accessToken).tenant, "app2");
      assert.equal(
        (
          await request("/auth/login?tenant=unknown", {
            username: "alice",
            password: "alice-secret",
          })
        ).body.error,
        "invalid tenant",
      );
    });
  if (mode === "multi")
    await check("Google callback recovers tenant from state", async () => {
      const response = await request("/auth/google/callback", undefined, {
        method: "GET",
      });
      assert.equal(response.status, 302);
      assert.equal(
        response.headers.get("location"),
        url + "?error=invalid_state",
      );
    });
  return passed;
}
