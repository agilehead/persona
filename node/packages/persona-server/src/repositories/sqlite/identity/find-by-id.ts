/**
 * Find identity by ID
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import { mapIdentityToDomain } from "./types.js";

export function findById(db: SQLiteDatabase, id: string): Identity | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where((i) => i.id === p.id)
        .select((i) => i)
        .take(1),
    { id },
  );
  return rows[0] !== undefined ? mapIdentityToDomain(rows[0]) : null;
}
