import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const product = "persona";

async function publish(missing, run) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), `${product}-publish-`),
  );
  try {
    const commands = path.join(directory, "commands");
    const log = path.join(directory, "docker.log");
    await mkdir(commands);
    await writeFile(
      path.join(commands, "docker"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$PUBLISH_TEST_LOG"
if [ "$1 $2" = 'image inspect' ] && [ "$3" = "$PUBLISH_TEST_MISSING" ]; then exit 17; fi
`,
      { mode: 0o700 },
    );
    const result = spawnSync(
      "bash",
      [
        path.join(root, `services/${product}/scripts/docker-push.sh`),
        "release-test",
      ],
      {
        cwd: directory,
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PATH: commands + path.delimiter + process.env.PATH,
          PUBLISH_TEST_LOG: log,
          PUBLISH_TEST_MISSING: missing,
        },
      },
    );
    const calls = (await readFile(log, "utf8")).trim().split("\n");
    await run(result, calls);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test("publishes application and migration images with release and commit tags", () =>
  publish("", (result, calls) => {
    assert.equal(result.status, 0, result.stderr);
    const commit = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim();
    assert.deepEqual(calls.slice(0, 2), [
      `image inspect ${product}:release-test`,
      `image inspect ${product}-migrations:release-test`,
    ]);
    assert.deepEqual(
      calls.filter((call) => call.startsWith("push ")),
      [
        `push ghcr.io/agilehead/${product}:${commit}`,
        `push ghcr.io/agilehead/${product}:release-test`,
        `push ghcr.io/agilehead/${product}-migrations:${commit}`,
        `push ghcr.io/agilehead/${product}-migrations:release-test`,
      ],
    );
  }));

test("missing migration image stops publication before either image is tagged or pushed", () =>
  publish(`${product}-migrations:release-test`, (result, calls) => {
    assert.equal(result.status, 17);
    assert.equal(calls.length, 2);
    assert(calls.every((call) => call.startsWith("image inspect ")));
  }));
