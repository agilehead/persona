import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import {
  createTestDatabase,
  setupTestDatabase,
  teardownTestDatabase,
} from "../../node/packages/persona-test-utils/dist/index.js";

const root = fileURLToPath(new URL("../../../..", import.meta.url));
assert(
  process.argv.slice(2).every((value) => value === "--check"),
  "Use --check to detect generated model drift",
);
const check = process.argv.includes("--check");
const source = ts.createSourceFile(
  "schema.ts",
  readFileSync(
    join(root, "services/persona/database/persona/sqlite/schema.d.ts"),
    "utf8",
  ),
  ts.ScriptTarget.Latest,
  true,
);
const declaration = source.statements.find(
  (node) =>
    ts.isTypeAliasDeclaration(node) && node.name.text === "DatabaseSchema",
);
assert(
  declaration && ts.isTypeLiteralNode(declaration.type),
  "Expected the current database contract",
);
const pascal = (value) =>
  value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
const output = join(
  root,
  "services/persona/csharp/packages/Persona.AdapterSqlite/generated",
);
function emit(file, text) {
  const path = join(output, file);
  if (check)
    assert(
      existsSync(path) && readFileSync(path, "utf8") === text,
      `Regenerate the SQLite mapping: ${file}`,
    );
  else writeFileSync(path, text);
}
const database = createTestDatabase();
try {
  await setupTestDatabase(database);
  mkdirSync(join(output, "Entities"), { recursive: true });
  const entities = [],
    configurations = [];
  const tables = [];
  for (const member of declaration.type.members) {
    assert(
      ts.isPropertySignature(member) &&
        member.name &&
        member.type &&
        ts.isTypeLiteralNode(member.type),
    );
    const table = member.name.getText(source).replaceAll('"', "");
    assert(/^[a-z_]+$/.test(table), "Expected literal table names");
    tables.push(table);
    const physical = database.db.pragma(`table_info(${JSON.stringify(table)})`);
    assert(physical.length > 0, `Missing table: ${table}`);
    const entity = `${pascal(table)}Row`,
      properties = [],
      configure = [];
    const keys = physical
      .filter((column) => column.pk)
      .sort((left, right) => left.pk - right.pk);
    assert(keys.length > 0, `Expected a primary key: ${table}`);
    configure.push(
      `            entity.ToTable(${JSON.stringify(table)});`,
      `            entity.HasKey(row => new { ${keys.map((column) => `row.${pascal(column.name)}`).join(", ")} });`,
    );
    const declared = [];
    for (const column of member.type.members) {
      assert(ts.isPropertySignature(column) && column.name && column.type);
      const name = column.name.getText(source).replaceAll('"', ""),
        kind = column.type.getText(source);
      const info = physical.find((column_) => column_.name === name);
      assert(info, `Missing column: ${table}.${name}`);
      declared.push(name);
      const nullable = kind.split("|").some((part) => part.trim() === "null");
      assert.equal(
        nullable,
        !info.notnull && !info.pk,
        `Nullability drift: ${table}.${name}`,
      );
      const numeric = /\bnumber\b/.test(kind);
      assert(
        !numeric || /int|bool/i.test(info.type),
        `Expected an integer carrier: ${table}.${name}`,
      );
      const type = `${numeric ? "long" : "string"}${nullable ? "?" : ""}`;
      properties.push(
        `    public ${numeric || nullable ? "" : "required "}${type} ${pascal(name)} { get; set; }`,
      );
      configure.push(
        `            entity.Property(row => row.${pascal(name)}).HasColumnName(${JSON.stringify(name)});`,
      );
    }
    assert.deepEqual(
      declared.sort(),
      physical.map((column) => column.name).sort(),
      `Column drift: ${table}`,
    );
    for (const foreign of database.db.pragma(
      `foreign_key_list(${JSON.stringify(table)})`,
    )) {
      assert(
        foreign.seq === 0,
        "Composite foreign keys require explicit model support",
      );
      assert(
        foreign.on_delete === "CASCADE",
        "Expected the current cascade contract",
      );
      configure.push(
        `            entity.HasOne<${pascal(foreign.table)}Row>().WithMany().HasForeignKey(row => row.${pascal(foreign.from)}).OnDelete(DeleteBehavior.Cascade);`,
      );
    }
    emit(
      `Entities/${entity}.g.cs`,
      `#nullable enable\n\nnamespace Persona.AdapterSqlite.Entities;\n\npublic sealed class ${entity}\n{\n${properties.join("\n")}\n}\n`,
    );
    entities.push(
      `    public DbSet<${entity}> ${pascal(table)} => Set<${entity}>();`,
    );
    configurations.push(
      `        modelBuilder.Entity<${entity}>(entity =>\n        {\n${configure.join("\n")}\n        });`,
    );
  }
  const physicalTables = database.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'knex_%'",
    )
    .all()
    .map((row) => row.name);
  assert.deepEqual(
    tables.sort(),
    physicalTables.sort(),
    "Table drift against the existing Knex schema",
  );
  emit(
    "PersonaDbContext.g.cs",
    `#nullable enable\n\nusing System.Diagnostics.CodeAnalysis;\nusing Microsoft.EntityFrameworkCore;\nusing Persona.AdapterSqlite.Entities;\n\nnamespace Persona.AdapterSqlite;\n\npublic sealed partial class PersonaDbContext : DbContext\n{\n    [UnconditionalSuppressMessage("Trimming", "IL2026", Justification = "Native publishing generates the EF compiled model and query interceptors; the native contract suite exercises them.")]\n    [UnconditionalSuppressMessage("AOT", "IL3050", Justification = "Native publishing generates the EF compiled model and query interceptors; the native contract suite exercises them.")]\n    public PersonaDbContext(DbContextOptions<PersonaDbContext> options) : base(options) { }\n\n${entities.join("\n")}\n\n    protected override void OnModelCreating(ModelBuilder modelBuilder)\n    {\n${configurations.join("\n")}\n    }\n}\n`,
  );
  console.info(
    `Persona: ${check ? "checked" : "generated"} ${entities.length} EF mappings against the database contract and fresh Knex schema`,
  );
} finally {
  await teardownTestDatabase(database);
}
