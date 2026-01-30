/**
 * Delete expired sessions
 */

import { executeDelete } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function deleteExpired(db: SQLiteDatabase): number {
  const now = new Date().toISOString();
  return executeDelete(
    db,
    schema,
    (q, p) => q.deleteFrom("session").where((s) => s.expires_at < p.now),
    { now },
  );
}
