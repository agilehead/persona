/**
 * Find identity by tenant, provider and provider user ID
 */

import { executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import { mapIdentityToDomain } from "./types.js";

export function findByProvider(
  db: SQLiteDatabase,
  tenantId: string,
  provider: string,
  providerUserId: string,
): Identity | null {
  const rows = executeSelect(
    db,
    schema,
    (q, p) =>
      q
        .from("identity")
        .where(
          (i) =>
            i.tenant_id === p.tenantId &&
            i.provider === p.provider &&
            i.provider_user_id === p.providerUserId,
        )
        .select((i) => i)
        .take(1),
    { tenantId, provider, providerUserId },
  );
  return rows[0] !== undefined ? mapIdentityToDomain(rows[0]) : null;
}
