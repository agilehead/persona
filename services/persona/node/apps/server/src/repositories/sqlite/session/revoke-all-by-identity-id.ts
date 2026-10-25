/**
 * Revoke all sessions for an identity
 */

import { executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function revokeAllByIdentityId(
  db: SQLiteDatabase,
  identityId: string,
): number {
  return executeUpdate(
    db,
    schema,
    (q, p) =>
      q
        .update("session")
        .set({ revoked: 1 })
        .where((s) => s.identity_id === p.identityId),
    { identityId },
  );
}
