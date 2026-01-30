/**
 * Find identity by tenant and email
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import { mapIdentityToDomain } from "./types.js";

export function findByEmail(
  db: SQLiteDatabase,
  tenantId: string,
  email: string,
): Identity | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where((i) => i.tenant_id === p.tenantId && i.email === p.email)
        .select((i) => i)
        .take(1),
    { tenantId, email },
  );
  return rows[0] !== undefined ? mapIdentityToDomain(rows[0]) : null;
}
