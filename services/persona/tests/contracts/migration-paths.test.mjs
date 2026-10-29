import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repository = fileURLToPath(new URL("../../../..", import.meta.url));
const configuration = new URL("../../knexfile.persona.mjs", import.meta.url)
  .href;
const anchor = repository;
for (const [name, setting, directory] of [
  ["default", "", resolve(anchor, "data")],
  ["relative", "local-fixture", resolve(anchor, "local-fixture")],
  [
    "absolute",
    resolve(tmpdir(), "persona-path-fixture"),
    resolve(tmpdir(), "persona-path-fixture"),
  ],
])
  test(`Knex ${name} data path matches the application workspace`, () => {
    const actual = JSON.parse(
      execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          `const { default: exported } = await import(${JSON.stringify(configuration)}); const config = exported.test ?? exported; process.stdout.write(JSON.stringify({ database: config.connection.filename, migrations: config.migrations.directory }));`,
        ],
        {
          cwd: resolve(repository, "services/persona"),
          env: { ...process.env, PERSONA_DATA_DIR: setting },
          encoding: "utf8",
        },
      ),
    );
    assert.equal(actual.database, resolve(directory, "persona.db"));
    assert.equal(
      actual.migrations,
      resolve(
        repository,
        "services/persona/database/persona/sqlite/migrations",
      ),
    );
  });
