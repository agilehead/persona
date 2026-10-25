/**
 * Revoke a session by ID
 */

import { executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function revoke(db: SQLiteDatabase, id: string): boolean {
  const changes = executeUpdate(
    db,
    schema,
    (q, p) =>
      q
        .update("session")
        .set({ revoked: 1 })
        .where((s) => s.id === p.id),
    { id },
  );
  return changes > 0;
}
