import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
  queries,
  queryRows,
  writeQuery,
} from "../../node/packages/persona-test-utils/dist/index.js";
test("normalized memberships and tenant relationships are enforced by the canonical schema", async () => {
  const db = createTestDatabase();
  await setupTestDatabase(db);
  try {
    assert.deepEqual(
      db.db.pragma('table_info("identity")').some((c) => c.name === "roles"),
      false,
    );
    const user = {
      tenant_id: "a",
      id: "member",
      role_version: "a".repeat(64),
      created_at: "2026-11-17T00:00:00Z",
      updated_at: "2026-11-17T00:00:00Z",
    };
    const put = (table, row) => writeQuery(db.db, queries(table).insert(row));
    put("user", user);
    put("user", { ...user, tenant_id: "b" });
    assert.throws(() => put("user", user));
    for (const patch of [
      { id: "x" },
      { id: "x".repeat(21) },
      { role_version: "bad" },
      { tenant_id: "" },
    ])
      assert.throws(() => put("user", { ...user, ...patch }));
    put("user_role", { tenant_id: "a", user_id: "member", role: "admin" });
    assert.throws(() =>
      put("user_role", { tenant_id: "a", user_id: "member", role: "admin" }),
    );
    for (const role of ["", "1admin", "bad,role", "bad role", "x".repeat(65)])
      assert.throws(() =>
        put("user_role", { tenant_id: "a", user_id: "member", role }),
      );
    assert.throws(() =>
      put("user_role", {
        tenant_id: "other",
        user_id: "member",
        role: "admin",
      }),
    );
    const identity = {
      id: "identity-a",
      tenant_id: "a",
      provider: "google",
      provider_user_id: "provider",
      email: "a@example.test",
      user_id: "member",
      created_at: user.created_at,
      updated_at: user.updated_at,
    };
    put("identity", identity);
    assert.throws(() =>
      put("identity", { ...identity, id: "duplicate-provider" }),
    );
    assert.throws(() =>
      put("identity", {
        ...identity,
        id: "orphan",
        provider_user_id: "orphan",
        user_id: "missing",
      }),
    );
    assert.throws(() =>
      put("identity", {
        ...identity,
        id: "invalid-json",
        provider_user_id: "invalid-json",
        metadata: "not json",
      }),
    );
    assert.throws(() =>
      writeQuery(
        db.db,
        queries("user").where({ tenant_id: "a", id: "member" }).delete(),
      ),
    );
    const session = {
      id: "session-a",
      identity_id: identity.id,
      tenant_id: "a",
      token_hash: "hash",
      expires_at: user.updated_at,
      created_at: user.created_at,
    };
    put("session", session);
    assert.throws(() =>
      put("session", {
        ...session,
        id: "cross-tenant",
        token_hash: "other",
        tenant_id: "b",
      }),
    );
    assert.throws(() => put("session", { ...session, id: "duplicate-token" }));
    assert.throws(() =>
      put("session", {
        ...session,
        id: "bad-revoked",
        token_hash: "bad",
        revoked: 2,
      }),
    );
    writeQuery(db.db, queries("identity").where({ id: identity.id }).delete());
    assert.equal(queryRows(db.db, queries("session").select()).length, 0);
    assert.equal(
      queryRows(db.db, queries("user_role").where({ tenant_id: "a" }).select())
        .length,
      1,
    );
    writeQuery(
      db.db,
      queries("user").where({ tenant_id: "a", id: "member" }).delete(),
    );
    assert.equal(queryRows(db.db, queries("user_role").select()).length, 0);
  } finally {
    await teardownTestDatabase(db);
  }
});
