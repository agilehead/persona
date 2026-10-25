import { csharpProjects, run } from "../../scripts/runtime-targets.mjs";
import assert from "node:assert/strict";
assert.equal(
  process.platform,
  "linux",
  "The verified native deployment target is Linux",
);
for (const project of csharpProjects) {
  await run([
    "dotnet",
    "publish",
    project,
    "-c",
    "Release",
    "-r",
    `linux-${process.arch}`,
    "-p:PublishAot=true",
    "-p:CppCompilerAndLinker=gcc",
    "-p:UseSharedCompilation=false",
    "--disable-build-servers",
  ]);
}
