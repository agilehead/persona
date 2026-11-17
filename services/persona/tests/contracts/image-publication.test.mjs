import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../../../../", import.meta.url));
const product = "persona";

test("application startup rejects runtime selectors", () => {
  for (const target of ["csharp", "managed", "nativeaot"]) {
    const result = spawnSync(
      process.execPath,
      ["services/persona/scripts/start.mjs", target],
      { cwd: root, encoding: "utf8", timeout: 10000 },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Persona serving accepts no runtime selector/u);
  }
});

async function publish(missing, run, { dirty = false, mismatch = false } = {}) {
  const directory = await mkdtemp(
    path.join(os.tmpdir(), `${product}-publish-`),
  );
  try {
    const commands = path.join(directory, "commands");
    const log = path.join(directory, "docker.log");
    await mkdir(commands);
    const revision = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim();
    const short = spawnSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).stdout.trim();
    await writeFile(
      path.join(commands, "git"),
      `#!/bin/sh
if [ "$1" = status ]; then [ "$PUBLISH_TEST_DIRTY" = true ] && printf ' M source\\n'; exit 0; fi
if [ "$2" = --short ]; then printf '%s\\n' "$PUBLISH_TEST_SHORT"; else printf '%s\\n' "$PUBLISH_TEST_REVISION"; fi
`,
      { mode: 0o700 },
    );
    await writeFile(
      path.join(commands, "docker"),
      `#!/bin/sh
printf '%s\\n' "$*" >> "$PUBLISH_TEST_LOG"
if [ "$1 $2" = 'image inspect' ]; then
  for image in "$@"; do if [ "$image" = "$PUBLISH_TEST_MISSING" ]; then exit 17; fi; done
  printf '%s|false\\n' "$PUBLISH_TEST_IMAGE_REVISION"
fi
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
          PUBLISH_TEST_DIRTY: String(dirty),
          PUBLISH_TEST_REVISION: revision,
          PUBLISH_TEST_SHORT: short,
          PUBLISH_TEST_IMAGE_REVISION: mismatch ? "different" : revision,
        },
      },
    );
    const calls = (await readFile(log, "utf8").catch(() => ""))
      .trim()
      .split("\n")
      .filter(Boolean);
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
      `image inspect --format {{index .Config.Labels "git.commit"}}|{{index .Config.Labels "source.dirty"}} ${product}:release-test`,
      `image inspect --format {{index .Config.Labels "git.commit"}}|{{index .Config.Labels "source.dirty"}} ${product}-migrations:release-test`,
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

test("dirty source cannot publish either image", () =>
  publish(
    "",
    (result, calls) => {
      assert.equal(result.status, 2);
      assert.deepEqual(calls, []);
    },
    { dirty: true },
  ));
test("image provenance must match the clean release commit", () =>
  publish(
    "",
    (result, calls) => {
      assert.equal(result.status, 2);
      assert.equal(calls.length, 1);
      assert(calls.every((call) => call.startsWith("image inspect ")));
    },
    { mismatch: true },
  ));
