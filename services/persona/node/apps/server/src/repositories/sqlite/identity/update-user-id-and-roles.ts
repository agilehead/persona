/**
 * Update identity with user ID and roles
 */

import { executeUpdate, executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import { mapIdentityToDomain } from "./types.js";

export function updateUserIdAndRoles(
  db: SQLiteDatabase,
  id: string,
  userId: string,
  roles: string[],
): Identity | null {
  const now = new Date().toISOString();
  const rolesCsv = roles.join(",");

  const changes = executeUpdate(
    db,
    schema,
    (q, p) =>
      q
        .update("identity")
        .set({
          user_id: p.userId,
          roles: p.roles,
          updated_at: p.updatedAt,
        })
        .where((i) => i.id === p.id),
    { id, userId, roles: rolesCsv, updatedAt: now },
  );

  if (changes === 0) {
    return null;
  }

  // Fetch the updated identity
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
