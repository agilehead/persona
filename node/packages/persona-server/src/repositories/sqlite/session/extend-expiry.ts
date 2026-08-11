/**
 * Slide a session's expiry forward (rolling refresh window).
 *
 * Called on every successful token refresh so an actively-used session keeps
 * moving its expiry out; only a session left unused past its full refresh
 * lifetime is allowed to lapse.
 */

import { executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function extendExpiry(
  db: SQLiteDatabase,
  id: string,
  expiresAt: Date,
): boolean {
  const changes = executeUpdate(
    db,
    schema,
    (q, p) =>
      q
        .update("session")
        .set({ expires_at: p.expiresAt })
        .where((s) => s.id === p.id),
    { id, expiresAt: expiresAt.toISOString() },
  );
  return changes > 0;
}
