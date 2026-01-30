/**
 * SQLite-specific database row types for persona-db
 * These map directly to database tables with SQLite-specific types:
 * - INTEGER (0/1) for booleans
 * - TEXT for dates (ISO 8601 strings)
 * - TEXT for JSON
 */

// Identity table row
export type IdentityRow = {
  id: string;
  tenant_id: string; // "lesser", "app1", etc.
  provider: string; // "google", "apple", etc.
  provider_user_id: string;
  email: string;
  name: string | null;
  profile_image_url: string | null;
  user_id: string | null; // Set by consuming app after onboarding (nullable)
  roles: string | null; // CSV: "USER,ADMIN"
  metadata: string | null; // TEXT (JSON) - raw OAuth claims
  created_at: string | Date;
  updated_at: string | Date;
};

// Session table row
export type SessionRow = {
  id: string;
  identity_id: string;
  tenant_id: string; // Denormalized for query efficiency
  token_hash: string; // SHA256 of refresh token
  expires_at: string | Date;
  revoked: number | boolean; // INTEGER (0/1) in SQLite
  ip_address: string | null;
  user_agent: string | null;
  created_at: string | Date;
};
