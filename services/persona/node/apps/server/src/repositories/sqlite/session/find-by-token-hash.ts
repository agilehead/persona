/**
 * Find session by token hash
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Session } from "../../../types.js";
import { mapSessionToDomain } from "./types.js";

export function findByTokenHash(
  db: SQLiteDatabase,
  tokenHash: string,
): Session | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("session")
        .where((s) => s.token_hash === p.tokenHash)
        .select((s) => s)
        .take(1),
    { tokenHash },
  );
  return rows[0] !== undefined ? mapSessionToDomain(rows[0]) : null;
}
