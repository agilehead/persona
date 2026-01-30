/**
 * Session Repository - SQLite Implementation
 */

import type { SQLiteDatabase } from "@agilehead/persona-db";
import type { ISessionRepository } from "../../interfaces/session-repository.js";
import { create } from "./create.js";
import { findById } from "./find-by-id.js";
import { findByTokenHash } from "./find-by-token-hash.js";
import { findByIdentityId } from "./find-by-identity-id.js";
import { revoke } from "./revoke.js";
import { revokeAllByIdentityId } from "./revoke-all-by-identity-id.js";
import { revokeAllByUserId } from "./revoke-all-by-user-id.js";
import { deleteExpired } from "./delete-expired.js";

export function createSessionRepository(
  db: SQLiteDatabase,
): ISessionRepository {
  return {
    create: (data) => Promise.resolve(create(db, data)),
    findById: (id) => Promise.resolve(findById(db, id)),
    findByTokenHash: (tokenHash) =>
      Promise.resolve(findByTokenHash(db, tokenHash)),
    findByIdentityId: (identityId) =>
      Promise.resolve(findByIdentityId(db, identityId)),
    revoke: (id) => Promise.resolve(revoke(db, id)),
    revokeAllByIdentityId: (identityId) =>
      Promise.resolve(revokeAllByIdentityId(db, identityId)),
    revokeAllByUserId: (tenantId, userId) =>
      Promise.resolve(revokeAllByUserId(db, tenantId, userId)),
    deleteExpired: () => Promise.resolve(deleteExpired(db)),
  };
}
