/**
 * Shared types and utilities for identity repository
 */

import type { Identity } from "../../../types.js";
import type { IdentityRow } from "@agilehead/persona-db";

/**
 * Map database row to domain Identity
 */
export function mapIdentityToDomain(row: IdentityRow): Identity {
  // Roles stored as CSV
  let roles: string[] = [];
  if (typeof row.roles === "string" && row.roles !== "") {
    roles = row.roles.split(",").filter((r) => r !== "");
  }

  // Metadata stored as JSON
  let metadata: Record<string, unknown> | null = null;
  if (typeof row.metadata === "string" && row.metadata !== "") {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = null;
    }
  }

  const identity: Identity = {
    id: row.id,
    tenantId: row.tenant_id,
    provider: row.provider,
    providerUserId: row.provider_user_id,
    email: row.email,
    roles,
    createdAt: new Date(row.created_at as string),
    updatedAt: new Date(row.updated_at as string),
  };

  if (row.name !== null) {
    identity.name = row.name;
  }
  if (row.profile_image_url !== null) {
    identity.profileImageUrl = row.profile_image_url;
  }
  if (row.user_id !== null) {
    identity.userId = row.user_id;
  }
  if (metadata !== null) {
    identity.metadata = metadata;
  }

  return identity;
}
