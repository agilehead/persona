import { spawn } from "node:child_process";
import { config } from "dotenv";
import { command, repository } from "./runtime-targets.mjs";
config({ path: new URL("../../../.env", import.meta.url) });
const invocation = command(process.argv[2] ?? "csharp");
const child = spawn(invocation[0], invocation.slice(1), {
  cwd: repository,
  env: process.env,
  stdio: "inherit",
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.once("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});
child.once("exit", (code, signal) => {
  process.exitCode =
    code ?? (signal === "SIGTERM" || signal === "SIGINT" ? 0 : 1);
});
