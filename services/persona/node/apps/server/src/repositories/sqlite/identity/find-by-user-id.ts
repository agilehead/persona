/**
 * Find identity by tenant and user ID
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import { mapIdentityToDomain } from "./types.js";

export function findByUserId(
  db: SQLiteDatabase,
  tenantId: string,
  userId: string,
): Identity | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where((i) => i.tenant_id === p.tenantId && i.user_id === p.userId)
        .select((i) => i)
        .take(1),
    { tenantId, userId },
  );
  return rows[0] !== undefined ? mapIdentityToDomain(rows[0]) : null;
}
