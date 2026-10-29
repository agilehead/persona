import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const product = "persona";
const owner = `services/${product}`;
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.deepEqual(manifest.workspaces, [
  "services/*",
  "services/*/apps/*",
  "services/*/node/packages/*",
]);
const required = [
  `${owner}/package.json`,
  `${owner}/database/${product}/sqlite/schema.d.ts`,
  `${owner}/csharp/Dockerfile`,
  `${owner}/knexfile.${product}.mjs`,
];
for (const file of required)
  assert(existsSync(join(root, file)), `Missing canonical owner: ${file}`);

function liveSource(directory) {
  return execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      directory,
    ],
    { cwd: root, encoding: "utf8" },
  )
    .split("\0")
    .filter((file) => file && existsSync(join(root, file)));
}
assert.equal(
  liveSource(`${owner}/node/apps`).length,
  0,
  "Retired Node application servers must not remain",
);
for (const directory of [
  "node/packages",
  "database",
  "devenv",
  "production",
  "rust",
  "e2e",
])
  assert.equal(
    liveSource(directory).length,
    0,
    `Superseded source owner remains: ${directory}`,
  );
for (const entry of readdirSync(join(root, owner, "node/packages"), {
  withFileTypes: true,
})) {
  if (!entry.isDirectory()) continue;
  const directory = `${owner}/node/packages/${entry.name}`;
  if (liveSource(directory).length)
    assert(
      existsSync(join(root, directory, "package.json")),
      `Package has no manifest: ${entry.name}`,
    );
}
const solutions = readdirSync(root).filter((name) =>
  name.endsWith(".CSharp.slnx"),
);
assert.equal(
  solutions.length,
  1,
  "One C# solution owns the product implementation",
);
const solution = readFileSync(join(root, solutions[0]), "utf8");
for (const match of solution.matchAll(/<Project Path="([^"]+)"/g)) {
  assert(
    match[1].startsWith(`${owner}/csharp/`),
    `C# project has a different owner: ${match[1]}`,
  );
  assert(existsSync(join(root, match[1])), `Missing C# project: ${match[1]}`);
}
console.info(`${product}: Ctlflow service ownership verified`);
