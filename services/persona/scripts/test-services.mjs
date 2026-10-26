import assert from "node:assert/strict";
import Database from "better-sqlite3";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import {
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
  truncateAllTables,
} from "../node/packages/persona-test-utils/dist/index.js";
import { command, ready, repository, run, stop } from "./runtime-targets.mjs";
import { contracts } from "../tests/contracts/http.mjs";
import {
  environment,
  modes,
  secret,
  internalSecret,
  nodeArguments,
} from "../tests/contracts/fixture.mjs";

const selected = process.argv[2] ?? "all";
assert(
  ["all", "node", "csharp", "nativeaot"].includes(selected),
  "Choose all, node, csharp or nativeaot",
);
const targets =
  selected === "all" ? ["node", "csharp", "nativeaot"] : [selected];
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
  process.execPath,
  "--test",
  "services/persona/tests/contracts/migration-paths.test.mjs",
  "services/persona/tests/contracts/image-publication.test.mjs",
]);
await run(["npm", "run", "test", "--workspace", "@agilehead/persona-client"]);
let total = 0;
for (const target of targets) {
  let targetTotal = 0;
  for (const mode of modes) {
    const database = createTestDatabase();
    await setupTestDatabase(database);
    const schema = database.db
      .prepare(
        "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
      )
      .all();
    if (database.knex !== null) {
      await database.knex.destroy();
      database.knex = null;
    }
    database.db.pragma("journal_mode = DELETE");
    let server;
    try {
      const port = await freePort();
      const url = `http://127.0.0.1:${port}`;
      const env = { ...process.env, ...environment(port, database, mode) };
      const command_ = command(target);
      if (target === "node") command_.splice(1, 0, ...nodeArguments);
      server = spawn(command_[0], command_.slice(1), {
        cwd: repository,
        env,
        stdio: "inherit",
      });
      await ready(server, url);
      const inspect = new Database(database.dbPath, { readonly: true });
      try {
        assert.equal(
          inspect.pragma("journal_mode", { simple: true }),
          "wal",
          "Runtime initializes SQLite WAL without changing the schema",
        );
      } finally {
        inspect.close();
      }
      if (mode === modes[0]) {
        await run(
          ["npm", "run", "test", "--workspace", "@agilehead/persona-server"],
          {
            env: {
              ...env,
              TEST_URL: url,
              TEST_DB_PATH: database.dbPath,
              TEST_CRON_SECRET: internalSecret,
            },
          },
        );
        truncateAllTables(database);
      }
      targetTotal += await contracts({
        url,
        database,
        mode,
        secret,
        internalSecret,
      });
      await stop(server);
      server = null;
      if (mode === modes[0] && target !== "node") {
        truncateAllTables(database);
        await run([...command(target, "ContractProbe"), database.dbPath]);
      }
      assert.deepEqual(
        database.db
          .prepare(
            "SELECT name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
          )
          .all(),
        schema,
        "Server operations must not change the Knex schema",
      );
    } finally {
      if (server) await stop(server);
      await teardownTestDatabase(database);
    }
  }
  total += targetTotal;
  console.info(`${target}: ${targetTotal} shared HTTP contract cases passed`);
}
console.info(
  `persona: ${total} shared HTTP contract cases passed; retained suites contain Node-only tests and are reported separately`,
);
