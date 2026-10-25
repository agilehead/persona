/**
 * Initial schema for Persona - OAuth authentication service
 *
 * This creates the identity and session tables with multi-tenancy support.
 */

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function up(knex) {
  // Identity table - stores OAuth identities
  await knex.schema.createTable("identity", (table) => {
    table.string("id", 10).primary();
    table.string("tenant_id").notNullable(); // "lesser", "app1", etc.
    table.string("provider").notNullable(); // "google", "apple", etc.
    table.string("provider_user_id").notNullable();
    table.string("email").notNullable();
    table.string("name");
    table.string("profile_image_url");
    table.string("user_id", 20); // Set by consuming app after onboarding
    table.text("roles"); // CSV: "USER,ADMIN"
    table.text("metadata"); // JSON - raw OAuth claims
    table.datetime("created_at").notNullable();
    table.datetime("updated_at").notNullable();

    // Same user can exist in multiple tenants
    table.unique(["tenant_id", "provider", "provider_user_id"]);
  });

  // Indexes for identity table
  await knex.schema.raw(`
    CREATE INDEX idx_identity_tenant_provider ON identity(tenant_id, provider, provider_user_id);
  `);
  await knex.schema.raw(`
    CREATE INDEX idx_identity_tenant_user ON identity(tenant_id, user_id);
  `);
  await knex.schema.raw(`
    CREATE INDEX idx_identity_email ON identity(email);
  `);

  // Session table - stores refresh token sessions
  await knex.schema.createTable("session", (table) => {
    table.string("id", 10).primary();
    table
      .string("identity_id", 10)
      .notNullable()
      .references("id")
      .inTable("identity")
      .onDelete("CASCADE");
    table.string("tenant_id").notNullable(); // Denormalized for query efficiency
    table.string("token_hash").notNullable().unique();
    table.datetime("expires_at").notNullable();
    table.integer("revoked").notNullable().defaultTo(0);
    table.string("ip_address");
    table.string("user_agent");
    table.datetime("created_at").notNullable();
  });

  // Index for session table
  await knex.schema.raw(`
    CREATE INDEX idx_session_tenant ON session(tenant_id);
  `);
  await knex.schema.raw(`
    CREATE INDEX idx_session_identity ON session(identity_id);
  `);
}

/**
 * @param {import("knex").Knex} knex
 * @returns {Promise<void>}
 */
export async function down(knex) {
  await knex.schema.dropTableIfExists("session");
  await knex.schema.dropTableIfExists("identity");
}
