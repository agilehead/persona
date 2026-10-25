/**
 * Find all active sessions for an identity
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Session } from "../../../types.js";
import { mapSessionToDomain } from "./types.js";

export function findByIdentityId(
  db: SQLiteDatabase,
  identityId: string,
): Session[] {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("session")
        .where((s) => s.identity_id === p.identityId && s.revoked === 0)
        .select((s) => s),
    { identityId },
  );
  return rows.map(mapSessionToDomain);
}
