import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import assert from "node:assert/strict";

export const repository = fileURLToPath(new URL("../../..", import.meta.url));
export const product = "persona";
export const name = "Persona";
export const csharpProjects = ["Server", "ContractProbe"].map(
  (app) =>
    `services/${product}/csharp/${app === "Server" ? "apps" : "tests"}/${name}.${app}/${name}.${app}.csproj`,
);

export function command(target, app = "Server") {
  assert(
    ["csharp", "nativeaot"].includes(target),
    "Choose csharp or nativeaot",
  );
  if (target === "csharp")
    return [
      "dotnet",
      `services/${product}/csharp/${app === "Server" ? "apps" : "tests"}/${name}.${app}/bin/Debug/net11.0/${name}.${app}.dll`,
    ];
  const binary = resolve(
    repository,
    `services/${product}/csharp/${app === "Server" ? "apps" : "tests"}/${name}.${app}/bin/Release/net11.0/linux-${process.arch}/publish/${name}.${app}`,
  );
  assert.deepEqual(
    [...readFileSync(binary).subarray(0, 4)],
    [127, 69, 76, 70],
    "Native acceptance requires a published ELF executable",
  );
  return [binary];
}

export async function run(command_, options = {}) {
  const child = spawn(command_[0], command_.slice(1), {
    cwd: repository,
    stdio: "inherit",
    ...options,
  });
  child.on("error", (error) => {
    console.error(error);
  });
  const [code, signal] = await once(child, "exit");
  assert.equal(code, 0, `${command_.join(" ")} failed (${signal ?? code})`);
}

export async function ready(child, url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, "Server exited before readiness");
    try {
      if ((await fetch(url + "/health")).ok) return;
    } catch {
      /* Readiness polling tolerates connection refusal until the listener opens. */
    }
    await new Promise((resolve_) => setTimeout(resolve_, 100));
  }
  throw new Error("Server did not become healthy: " + url);
}

export async function stop(child) {
  if (child.exitCode !== null) return;
  const exited = once(child, "exit");
  child.kill("SIGTERM");
  const timeout = setTimeout(() => child.kill("SIGKILL"), 10000);
  const [code] = await exited;
  clearTimeout(timeout);
  assert.equal(code, 0, "Server did not shut down cleanly");
}
