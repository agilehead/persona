// Database schema definition for Tinqer
// This provides type-safe queries with the Tinqer query builder

export type DatabaseSchema = {
  // OAuth identity records
  identity: {
    id: string;
    tenant_id: string; // "lesser", "app1", etc.
    provider: string; // "google", "apple", etc.
    provider_user_id: string;
    email: string;
    name: string | null;
    profile_image_url: string | null;
    user_id: string | null; // Set by consuming app after onboarding (nullable)
    roles: string | null; // CSV: "USER,ADMIN" (nullable)
    metadata: string | null; // Raw OAuth claims JSON
    created_at: string;
    updated_at: string;
  };

  // Sessions with refresh tokens
  session: {
    id: string;
    identity_id: string;
    tenant_id: string; // Denormalized for query efficiency
    token_hash: string; // SHA256 of refresh token
    expires_at: string;
    revoked: number; // 0 or 1 in SQLite
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
  };
};
