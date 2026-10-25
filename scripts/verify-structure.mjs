import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const product = "persona";
const owner = `services/${product}`;
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
assert.deepEqual(manifest.workspaces, ["services/*", "services/*/apps/*", "services/*/node/apps/*", "services/*/node/packages/*"]);
for (const file of [`${owner}/package.json`, `${owner}/node/apps/server/package.json`, `${owner}/node/apps/server/src/bin/server.ts`, `${owner}/csharp/Dockerfile`, `${owner}/knexfile.${product}.mjs`])
  assert(existsSync(join(root, file)), `Missing canonical owner: ${file}`);
for (const directory of ["node/packages", "database", "devenv", "production"]) {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard", "--", directory], { cwd: root, encoding: "utf8" }).split("\0");
  assert(!files.some(file => file && existsSync(join(root, file))), `Superseded source owner remains: ${directory}`);
}
for (const entry of readdirSync(join(root, owner, "node/packages"), { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const file = join(root, owner, "node/packages", entry.name, "package.json");
  assert(existsSync(file), `Package has no manifest: ${entry.name}`);
}
const solution = readFileSync(join(root, "Persona.CSharp.slnx"), "utf8");
for (const match of solution.matchAll(/<Project Path="([^"]+)"/g)) {
  assert(match[1].startsWith(`${owner}/csharp/`), `C# project has a different owner: ${match[1]}`);
  assert(existsSync(join(root, match[1])), `Missing C# project: ${match[1]}`);
}
console.info(`${product}: Ctlflow service ownership verified`);
