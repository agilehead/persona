/**
 * Find session by ID
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Session } from "../../../types.js";
import { mapSessionToDomain } from "./types.js";

export function findById(db: SQLiteDatabase, id: string): Session | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("session")
        .where((s) => s.id === p.id)
        .select((s) => s)
        .take(1),
    { id },
  );
  return rows[0] !== undefined ? mapSessionToDomain(rows[0]) : null;
}
