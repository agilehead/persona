import { readdir, readFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
const root = resolve(import.meta.dirname, "../services/persona/csharp");
const allowed = {
  Kernel: [],
  Domain: ["Kernel"],
  Contracts: ["Kernel"],
  AdapterHttp: ["Domain", "Contracts", "Kernel"],
  AdapterSqlite: ["Domain", "Kernel"],
  AdapterAuth: ["Domain", "Kernel"],
  AdapterRuntime: ["Kernel"],
};
export function boundaryErrors(graph) {
  const errors = [];
  for (const [file, targets] of graph) {
    const owner = /^packages\/Persona\.([^/]+)\//u.exec(file)?.[1];
    if (!owner) continue;
    if (!Object.hasOwn(allowed, owner)) {
      errors.push(`${file} has no declared layer ownership`);
      continue;
    }
    for (const target of targets) {
      const other = /^packages\/Persona\.([^/]+)\//u.exec(target)?.[1];
      if (!other || !allowed[owner]?.includes(other))
        errors.push(`${file} must not import ${target}`);
    }
  }
  return errors;
}
export function sourceBoundaryErrors(name, text) {
  const errors = [];
  if (
    /^packages\/Persona\.Domain\//u.test(name) &&
    /Persona\.(Adapter|Contracts)|Microsoft\.(AspNetCore|EntityFrameworkCore)|JsonPropertyName|JsonIgnore|JsonSerializerContext/u.test(
      text,
    )
  )
    errors.push(name + " imports wire/framework/adapter policy into Domain");
  if (
    /^packages\/Persona\.AdapterHttp\//u.test(name) &&
    /Persona\.Adapter(Auth|Runtime|Sqlite)|Storage\.Open|Settings\.Read/u.test(
      text,
    )
  )
    errors.push(name + " composes concrete adapters inside HTTP");
  if (
    /^packages\/Persona\.AdapterHttp\//u.test(name) &&
    /tokens\.(ValidateRefresh|Slide|Revoke)\(/u.test(text)
  )
    errors.push(name + " coordinates session use cases inside HTTP");
  if (
    /^packages\/Persona\.AdapterSqlite\//u.test(name) &&
    /HttpClient|HttpContext|Persona\.Adapter(Auth|Http|Runtime)/u.test(text)
  )
    errors.push(name + " mixes persistence with foreign adapter work");
  return errors;
}
async function files(folder) {
  const result = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    if (["bin", "obj"].includes(entry.name)) continue;
    const path = resolve(folder, entry.name);
    if (entry.isDirectory()) result.push(...(await files(path)));
    else result.push(path);
  }
  return result;
}
export async function verifyBoundaries() {
  const source = await files(root),
    graph = new Map();
  for (const file of source.filter((f) => f.endsWith(".csproj"))) {
    const text = await readFile(file, "utf8");
    graph.set(
      relative(root, file),
      [...text.matchAll(/<ProjectReference\s+Include="([^"]+)"/gu)].map((m) =>
        relative(root, resolve(dirname(file), m[1])),
      ),
    );
  }
  const errors = boundaryErrors(graph);
  for (const file of source.filter((f) => f.endsWith(".cs"))) {
    const name = relative(root, file),
      text = await readFile(file, "utf8");
    errors.push(...sourceBoundaryErrors(name, text));
  }
  if (errors.length) throw Error(errors.join("\n"));
  return {
    projects: graph.size,
    files: source.filter((f) => f.endsWith(".cs")).length,
  };
}
