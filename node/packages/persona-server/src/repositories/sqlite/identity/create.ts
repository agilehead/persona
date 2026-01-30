/**
 * Create a new identity
 */

import { executeInsert, executeSelect } from "@tinqerjs/better-sqlite3-adapter";
import { schema, type SQLiteDatabase } from "@agilehead/persona-db";
import type { Identity } from "../../../types.js";
import type { CreateIdentityData } from "../../interfaces/identity-repository.js";
import { mapIdentityToDomain } from "./types.js";
import { generateId } from "../../../utils/id.js";

export function create(db: SQLiteDatabase, data: CreateIdentityData): Identity {
  const now = new Date().toISOString();
  const id = generateId();
  const metadata =
    data.metadata !== undefined ? JSON.stringify(data.metadata) : null;

  executeInsert(
    db,
    schema,
    (q, p) =>
      q.insertInto("identity").values({
        id: p.id,
        tenant_id: p.tenantId,
        provider: p.provider,
        provider_user_id: p.providerUserId,
        email: p.email,
        name: p.name,
        profile_image_url: p.profileImageUrl,
        user_id: p.userId,
        roles: p.roles,
        metadata: p.metadata,
        created_at: p.createdAt,
        updated_at: p.updatedAt,
      }),
    {
      id,
      tenantId: data.tenantId,
      provider: data.provider,
      providerUserId: data.providerUserId,
      email: data.email,
      name: data.name ?? null,
      profileImageUrl: data.profileImageUrl ?? null,
      userId: null,
      roles: null,
      metadata,
      createdAt: now,
      updatedAt: now,
    },
  );

  // Fetch the created identity
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

  const row = rows[0];
  if (row === undefined) {
    throw new Error("Failed to create identity: could not find created row");
  }
  return mapIdentityToDomain(row);
}
