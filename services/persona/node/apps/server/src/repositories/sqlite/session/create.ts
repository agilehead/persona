/**
 * Create a new session
 */

import { executeInsert, executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Session } from "../../../types.js";
import type { CreateSessionData } from "../../interfaces/session-repository.js";
import { mapSessionToDomain } from "./types.js";
import { generateId } from "../../../utils/id.js";

export function create(db: SQLiteDatabase, data: CreateSessionData): Session {
  const now = new Date().toISOString();
  const id = generateId();

  executeInsert(
    db,
    schema,
    (q, p) =>
      q.insertInto("session").values({
        id: p.id,
        identity_id: p.identityId,
        tenant_id: p.tenantId,
        token_hash: p.tokenHash,
        expires_at: p.expiresAt,
        revoked: p.revoked,
        ip_address: p.ipAddress,
        user_agent: p.userAgent,
        created_at: p.createdAt,
      }),
    {
      id,
      identityId: data.identityId,
      tenantId: data.tenantId,
      tokenHash: data.tokenHash,
      expiresAt: data.expiresAt.toISOString(),
      revoked: 0,
      ipAddress: data.ipAddress ?? null,
      userAgent: data.userAgent ?? null,
      createdAt: now,
    },
  );

  // Fetch the created session
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

  const row = rows[0];
  if (row === undefined) {
    throw new Error("Failed to create session: could not find created row");
  }
  return mapSessionToDomain(row);
}
