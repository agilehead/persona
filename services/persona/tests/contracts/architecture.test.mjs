import { test } from "node:test";
import assert from "node:assert/strict";
import {
  boundaryErrors,
  verifyBoundaries,
  sourceBoundaryErrors,
} from "../../../../scripts/service-boundaries.mjs";
test("current Persona project/source graph obeys layer ownership", async () => {
  assert((await verifyBoundaries()).projects > 0);
});
test("source edges reject concrete HTTP composition and session orchestration", () => {
  for (const [owner, text] of [
    ["Domain", "using Persona.Contracts;"],
    ["Domain", "using Microsoft.EntityFrameworkCore;"],
    ["AdapterHttp", "var store = Storage.Open(path);"],
    ["AdapterHttp", "await tokens.ValidateRefresh(token, cancellation);"],
    ["AdapterHttp", "await tokens.Revoke(session, cancellation);"],
    ["AdapterSqlite", "using System.Net.Http; HttpClient client;"],
  ])
    assert.equal(
      sourceBoundaryErrors(`packages/Persona.${owner}/A.cs`, text).length,
      1,
      owner + ": " + text,
    );
  assert.equal(
    boundaryErrors(new Map([["packages/Persona.Undeclared/A.csproj", []]]))
      .length,
    1,
  );
  assert.deepEqual(
    sourceBoundaryErrors(
      "packages/Persona.AdapterHttp/SessionRoutes.cs",
      "await Authentication.Refresh(identities, tokens, refresh, cancellation);",
    ),
    [],
  );
});
test("forbidden inward and competing adapter dependencies are rejected", () => {
  for (const [a, b] of [
    ["Domain", "AdapterSqlite"],
    ["Domain", "Contracts"],
    ["Kernel", "Domain"],
    ["AdapterHttp", "AdapterSqlite"],
    ["AdapterHttp", "AdapterAuth"],
    ["AdapterHttp", "AdapterRuntime"],
    ["AdapterSqlite", "AdapterHttp"],
    ["AdapterAuth", "AdapterSqlite"],
    ["Contracts", "Domain"],
  ])
    assert.equal(
      boundaryErrors(
        new Map([
          [
            `packages/Persona.${a}/A.csproj`,
            [`packages/Persona.${b}/B.csproj`],
          ],
        ]),
      ).length,
      1,
      `${a} -> ${b}`,
    );
});
test("transport consumes domain ports and the executable composes adapters", () => {
  assert.deepEqual(
    boundaryErrors(
      new Map([
        [
          "packages/Persona.AdapterHttp/A.csproj",
          ["packages/Persona.Domain/B.csproj"],
        ],
        [
          "apps/Persona.Server/A.csproj",
          ["packages/Persona.AdapterSqlite/B.csproj"],
        ],
      ]),
    ),
    [],
  );
});
