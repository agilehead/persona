/**
 * Shared types and utilities for session repository
 */

import type { Session } from "../../../types.js";
import type { SessionRow } from "@agilehead/persona-db";

/**
 * Map database row to domain Session
 */
export function mapSessionToDomain(row: SessionRow): Session {
  const session: Session = {
    id: row.id,
    identityId: row.identity_id,
    tenantId: row.tenant_id,
    tokenHash: row.token_hash,
    expiresAt: new Date(row.expires_at as string),
    revoked: row.revoked === 1 || row.revoked === true,
    createdAt: new Date(row.created_at as string),
  };

  if (row.ip_address !== null) {
    session.ipAddress = row.ip_address;
  }
  if (row.user_agent !== null) {
    session.userAgent = row.user_agent;
  }

  return session;
}
