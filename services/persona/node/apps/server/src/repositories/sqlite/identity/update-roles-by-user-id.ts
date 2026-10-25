/**
 * Update roles for all identities with a given tenant and user ID
 */

import { executeUpdate } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";

export function updateRolesByUserId(
  db: SQLiteDatabase,
  tenantId: string,
  userId: string,
  roles: string[],
): number {
  const now = new Date().toISOString();
  const rolesCsv = roles.join(",");

  return executeUpdate(
    db,
    schema,
    (q, p) =>
      q
        .update("identity")
        .set({
          roles: p.roles,
          updated_at: p.updatedAt,
        })
        .where((i) => i.tenant_id === p.tenantId && i.user_id === p.userId),
    { tenantId, userId, roles: rolesCsv, updatedAt: now },
  );
}
