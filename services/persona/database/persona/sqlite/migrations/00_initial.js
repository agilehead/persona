/** Canonical initial schema. Knex is the sole DDL owner. */
export async function up(knex) {
  await knex.schema.createTable("user", (t) => {
    t.string("tenant_id").notNullable();
    t.string("id", 20).notNullable();
    t.string("role_version", 64).notNullable();
    t.datetime("created_at").notNullable();
    t.datetime("updated_at").notNullable();
    t.primary(["tenant_id", "id"]);
    t.check("length(id) BETWEEN 3 AND 20 AND id NOT GLOB '*[^A-Za-z0-9_-]*'");
    t.check("length(role_version)=64 AND role_version NOT GLOB '*[^0-9a-f]*'");
    t.check("length(tenant_id)>0");
  });
  await knex.schema.createTable("user_role", (t) => {
    t.string("tenant_id").notNullable();
    t.string("user_id", 20).notNullable();
    t.string("role", 64).notNullable();
    t.primary(["tenant_id", "user_id", "role"]);
    t.foreign(["tenant_id", "user_id"])
      .references(["tenant_id", "id"])
      .inTable("user")
      .onDelete("CASCADE");
    t.check(
      "length(role) BETWEEN 1 AND 64 AND substr(role,1,1) GLOB '[A-Za-z]' AND role NOT GLOB '*[^A-Za-z0-9_:.-]*'",
    );
  });
  await knex.schema.createTable("identity", (t) => {
    t.string("id", 16).notNullable().primary();
    t.string("tenant_id").notNullable();
    t.string("provider").notNullable();
    t.string("provider_user_id").notNullable();
    t.string("email").notNullable();
    t.string("name");
    t.string("profile_image_url");
    t.string("user_id", 20);
    t.text("metadata");
    t.datetime("created_at").notNullable();
    t.datetime("updated_at").notNullable();
    t.unique(["tenant_id", "provider", "provider_user_id"]);
    t.unique(["id", "tenant_id"]);
    t.foreign(["tenant_id", "user_id"])
      .references(["tenant_id", "id"])
      .inTable("user")
      .onDelete("RESTRICT");
    t.index(["tenant_id", "user_id"]);
    t.index(["tenant_id", "email"]);
    t.check(
      "length(tenant_id)>0 AND length(provider)>0 AND length(provider_user_id)>0",
    );
    t.check("metadata IS NULL OR json_valid(metadata)");
  });
  await knex.schema.createTable("session", (t) => {
    t.string("id", 16).notNullable().primary();
    t.string("identity_id", 16).notNullable();
    t.string("tenant_id").notNullable();
    t.foreign(["identity_id", "tenant_id"])
      .references(["id", "tenant_id"])
      .inTable("identity")
      .onDelete("CASCADE");
    t.string("token_hash").notNullable().unique();
    t.datetime("expires_at").notNullable();
    t.integer("revoked").notNullable().defaultTo(0);
    t.string("ip_address");
    t.string("user_agent");
    t.datetime("created_at").notNullable();
    t.check("revoked IN (0,1)");
    t.index("tenant_id");
    t.index(["identity_id", "revoked"]);
    t.index("expires_at");
  });
}
export async function down() {
  throw new Error(
    "Use a fresh disposable fixture; production resets are forbidden",
  );
}
