import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createServer } from "node:net";
import {
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from "../node/packages/persona-test-utils/dist/index.js";
import { repository, run } from "./runtime-targets.mjs";
import { contracts } from "../tests/contracts/http.mjs";
import {
  environment,
  modes,
  secret,
  internalSecret,
} from "../tests/contracts/fixture.mjs";

const selection =
  process.argv[2] ?? process.env.PERSONA_DOTNET_CONTAINER_TARGET ?? "all";
assert(
  ["all", "nativeaot", "managed"].includes(selection),
  "Choose all, nativeaot or managed",
);
const variants = selection === "all" ? ["managed", "nativeaot"] : [selection];
const migrationImage = "persona-migrations:acceptance";
const docker = (args, env = process.env) =>
  execFileSync("docker", args, {
    cwd: repository,
    env,
    encoding: "utf8",
  }).trim();
function storedRows(database) {
  return database
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    )
    .all()
    .map(({ name }) => [
      name,
      database
        .prepare(`SELECT * FROM "${name.replaceAll('"', '""')}"`)
        .all()
        .map((row) => JSON.stringify(row))
        .sort(),
    ]);
}
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const port = socket.address().port;
  await new Promise((resolve) => socket.close(resolve));
  return port;
}
await run([
  "docker",
  "build",
  "-f",
  "services/persona/database/Dockerfile",
  "--target",
  "migrations",
  "-t",
  migrationImage,
  ".",
]);
let total = 0;
for (const variant of variants) {
  const image = `persona:acceptance-${variant}`;
  await run([
    "docker",
    "build",
    "-f",
    "services/persona/csharp/Dockerfile",
    "--target",
    variant,
    "-t",
    image,
    ".",
  ]);
  let passed = 0;
  for (const mode of modes) {
    const database = createTestDatabase();
    const port = await freePort(),
      url = `http://127.0.0.1:${port}`;
    const fixture = environment(port, database, mode);
    const logs = join(database.testDir, "logs");
    mkdirSync(logs);
    const envFile = join(database.testDir, "container.env");
    writeFileSync(
      envFile,
      Object.entries(fixture)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n") + "\n",
    );
    const env = {
      ...process.env,
      NODE_ENV: fixture.NODE_ENV,
      PERSONA_IMAGE: image,
      PERSONA_MIGRATIONS_IMAGE: migrationImage,
      PERSONA_TEST_PORT: String(port),
      PERSONA_DATA_HOST_DIR: dirname(database.dbPath),
      PERSONA_LOG_HOST_DIR: logs,
      ENV_FILE: envFile,
    };
    const compose = [
      "compose",
      "-p",
      `persona-acceptance-${process.pid}-${variant}-${mode}`,
      "-f",
      "services/persona/docker/development/docker-compose.yml",
    ];
    let initialized = false;
    try {
      await run(["docker", ...compose, "run", "--rm", "persona-migrations"], {
        env,
      });
      const migrated = new Database(database.dbPath, {
        readonly: true,
        fileMustExist: true,
      });
      try {
        assert.deepEqual(
          migrated
            .prepare("SELECT name FROM knex_migrations ORDER BY name")
            .all()
            .map((row) => row.name),
          readdirSync(
            join(
              repository,
              "services/persona/database/persona/sqlite/migrations",
            ),
          )
            .filter((name) => name.endsWith(".js"))
            .sort(),
          "The migration image creates the schema in the actual mounted application database",
        );
      } finally {
        migrated.close();
      }
      await setupTestDatabase(database);
      initialized = true;
      await database.knex.destroy();
      database.knex = null;
      const schema = database.db
        .prepare(
          "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
        )
        .all();
      database.db.pragma("journal_mode = DELETE");
      await run(
        [
          "docker",
          ...compose,
          "up",
          "-d",
          "--wait",
          "--wait-timeout",
          "90",
          "persona",
        ],
        { env },
      );
      const container = docker([...compose, "ps", "-q", "persona"], env);
      assert(container);
      assert.equal(
        docker(["inspect", "--format", "{{.State.Health.Status}}", container]),
        "healthy",
      );
      docker(["exec", container, "/app/persona", "health"]);
      docker([
        "exec",
        container,
        "/bin/sh",
        "-c",
        "if command -v node; then exit 1; fi",
      ]);
      if (variant === "nativeaot") {
        docker([
          "exec",
          container,
          "/bin/sh",
          "-c",
          "if command -v dotnet; then exit 1; fi",
        ]);
        assert.equal(
          docker([
            "exec",
            container,
            "od",
            "-An",
            "-tx1",
            "-N4",
            "/app/persona",
          ]).replaceAll(/\s/g, ""),
          "7f454c46",
        );
      }
      const inspect = new Database(database.dbPath, { readonly: true });
      try {
        assert.equal(
          inspect.pragma("journal_mode", { simple: true }),
          "wal",
          "A new connection observes runtime-owned WAL initialization",
        );
      } finally {
        inspect.close();
      }
      passed += await contracts({
        url,
        database,
        mode,
        secret,
        internalSecret,
      });
      assert.deepEqual(
        database.db
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
          )
          .all(),
        schema,
        "Container startup and operations must preserve the Knex schema",
      );
      await run(["docker", ...compose, "stop", "-t", "15", "persona"], { env });
      assert.equal(
        docker(["inspect", "--format", "{{.State.ExitCode}}", container]),
        "0",
        "Container shuts down cleanly",
      );
      const persisted = storedRows(database.db);
      await run(["docker", ...compose, "run", "--rm", "persona-migrations"], {
        env,
      });
      assert.deepEqual(
        storedRows(database.db),
        persisted,
        "Re-running the migration image preserves every existing row and migration record",
      );
      assert.deepEqual(
        database.db
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
          )
          .all(),
        schema,
        "Re-running the migration image preserves the complete schema",
      );
    } catch (error) {
      await run(["docker", ...compose, "logs", "--tail", "100"], { env });
      throw error;
    } finally {
      await run(["docker", ...compose, "down", "--remove-orphans"], { env });
      if (initialized) await teardownTestDatabase(database);
    }
  }
  total += passed;
  console.info(
    `persona Docker ${variant}: ${passed} shared HTTP contract cases passed; healthy and clean shutdown; no Node in the application image`,
  );
}
console.info(`persona Docker: ${total} shared HTTP contract cases passed`);
