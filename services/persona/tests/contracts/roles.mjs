import assert from "node:assert/strict";

export async function roleContracts({ request, tenant, auth, seededId, mode }) {
  let passed = 0;
  async function check(name, operation) {
    await operation();
    passed++;
    console.info("HTTP contract PASS: " + name);
  }
  const path = "/internal/user/alice/roles" + tenant;
  const read = () => request(path, undefined, { ...auth, method: "GET" });
  const write = (roles, etag) =>
    request(
      path,
      { roles },
      {
        ...auth,
        method: "PUT",
        headers: {
          ...auth.headers,
          ...(etag === undefined ? {} : { "if-match": etag }),
        },
      },
    );
  await check(
    "role bulk lookup authentication and tenant isolation",
    async () => {
      assert.equal(
        (
          await request("/internal/users/role-lookups" + tenant, {
            userIds: ["alice"],
          })
        ).status,
        401,
      );
      const result = await request(
        "/internal/users/role-lookups" + tenant,
        { userIds: ["alice", "absent"] },
        auth,
      );
      assert.equal(result.status, 200);
      assert.equal(result.body.users.length, 2);
      assert.deepEqual(result.body.users[0].roles, ["MODERATOR", "REVIEWER"]);
      assert.deepEqual(result.body.users[1], {
        userId: "absent",
        exists: false,
        roles: [],
        etag: null,
      });
      assert.equal(
        result.body.users[0].etag,
        (await read()).headers.get("etag"),
      );
      if (mode === "multi") {
        const other = await request(
          "/internal/users/role-lookups?tenant=app2",
          { userIds: ["alice"] },
          auth,
        );
        assert.equal(other.status, 200);
        assert.equal(other.body.users[0].exists, false);
        assert.equal(
          (
            await request(
              `/internal/identity/${seededId}/link?tenant=app2`,
              { userId: "wrong-user", roles: ["admin"] },
              auth,
            )
          ).status,
          404,
        );
      }
    },
  );
  await check("role bulk boundaries and invalid keys", async () => {
    const ids = Array.from({ length: 500 }, (_, i) => "missing-" + i);
    assert.equal(
      (
        await request(
          "/internal/users/role-lookups" + tenant,
          { userIds: ids },
          auth,
        )
      ).body.users.length,
      500,
    );
    for (const body of [
      { userIds: [...ids, "overflow"] },
      { userIds: ["alice", "alice"] },
      { userIds: ["x".repeat(21)] },
      { userIds: [null] },
      { userIds: ["alice"], extra: true },
    ])
      assert.equal(
        (await request("/internal/users/role-lookups" + tenant, body, auth))
          .status,
        400,
      );
    assert.deepEqual(
      (
        await request(
          "/internal/users/role-lookups" + tenant,
          { userIds: [] },
          auth,
        )
      ).body,
      { users: [] },
    );
  });
  await check(
    "role replacement preconditions and empty membership",
    async () => {
      const before = await read();
      const tag = before.headers.get("etag");
      assert.equal((await write([], undefined)).status, 428);
      for (const bad of ["*", "W/" + tag, '"invalid"', tag + ", " + tag])
        assert.equal((await write([], bad)).status, 400);
      const cleared = await write([], tag);
      assert.equal(cleared.status, 200);
      assert.deepEqual(cleared.body.user.roles, []);
      assert.equal((await write(["admin"], tag)).status, 412);
      const replay = await request(
        `/internal/identity/${seededId}/link${tenant}`,
        { userId: "alice", roles: ["admin"] },
        auth,
      );
      assert.equal(replay.status, 200);
      assert.deepEqual(replay.body.identity.roles, []);
      assert.equal(
        (
          await request(
            `/internal/identity/${seededId}/link${tenant}`,
            { userId: "someone-else", roles: [] },
            auth,
          )
        ).status,
        409,
      );
      assert.deepEqual((await read()).body.roles, []);
      assert.equal(
        (await write(["MODERATOR", "REVIEWER"], cleared.headers.get("etag")))
          .status,
        200,
      );
    },
  );
  await check("role name and membership validation", async () => {
    const tag = (await read()).headers.get("etag");
    for (const roles of [
      ["admin", "admin"],
      ["bad,role"],
      [""],
      ["1admin"],
      ["a".repeat(65)],
      Array.from({ length: 65 }, (_, i) => "role" + i),
    ])
      assert.equal((await write(roles, tag)).status, 400);
    assert.equal((await read()).headers.get("etag"), tag);
  });
  await check(
    "competing role replacements have exactly one winner",
    async () => {
      const before = await read();
      const etag = before.headers.get("etag");
      const results = await Promise.all([
        write(["reader"], etag),
        write(["editor"], etag),
      ]);
      assert.deepEqual(results.map((x) => x.status).sort(), [200, 412]);
      const winner = results.find((x) => x.status === 200);
      assert.equal(
        (await read()).headers.get("etag"),
        winner.headers.get("etag"),
      );
      assert.equal(
        (await write(before.body.roles, winner.headers.get("etag"))).status,
        200,
      );
    },
  );
  await check("role read for a missing user", async () => {
    assert.equal(
      (
        await request("/internal/user/absent/roles" + tenant, undefined, {
          ...auth,
          method: "GET",
        })
      ).status,
      404,
    );
  });
  return passed;
}
