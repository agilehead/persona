/**
 * Revoke all sessions for a user (via their identities) in a specific tenant
 */

import { executeSelect, executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function revokeAllByUserId(
  db: SQLiteDatabase,
  tenantId: string,
  userId: string,
): number {
  // First, find all identity IDs for this user in this tenant
  const identities = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where((i) => i.tenant_id === p.tenantId && i.user_id === p.userId)
        .select((i) => ({ id: i.id })),
    { tenantId, userId },
  );

  if (identities.length === 0) {
    return 0;
  }

  // Revoke sessions for each identity
  let totalRevoked = 0;
  for (const identity of identities) {
    const changes = executeUpdate(
      db,
      schema,
      (q, p) =>
        q
          .update("session")
          .set({ revoked: 1 })
          .where((s) => s.identity_id === p.identityId && s.revoked === 0),
      { identityId: identity.id },
    );
    totalRevoked += changes;
  }

  return totalRevoked;
}
