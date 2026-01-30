/**
 * Identity Repository - SQLite Implementation
 */

import type { SQLiteDatabase } from "@agilehead/persona-db";
import type { IIdentityRepository } from "../../interfaces/identity-repository.js";
import { create } from "./create.js";
import { findById } from "./find-by-id.js";
import { findByProvider } from "./find-by-provider.js";
import { findByEmail } from "./find-by-email.js";
import { findByUserId } from "./find-by-user-id.js";
import { updateUserIdAndRoles } from "./update-user-id-and-roles.js";
import { updateRolesByUserId } from "./update-roles-by-user-id.js";

export function createIdentityRepository(
  db: SQLiteDatabase,
): IIdentityRepository {
  return {
    create: (data) => Promise.resolve(create(db, data)),
    findById: (id) => Promise.resolve(findById(db, id)),
    findByProvider: (tenantId, provider, providerUserId) =>
      Promise.resolve(findByProvider(db, tenantId, provider, providerUserId)),
    findByEmail: (tenantId, email) =>
      Promise.resolve(findByEmail(db, tenantId, email)),
    findByUserId: (tenantId, userId) =>
      Promise.resolve(findByUserId(db, tenantId, userId)),
    updateUserIdAndRoles: (id, userId, roles) =>
      Promise.resolve(updateUserIdAndRoles(db, id, userId, roles)),
    updateRolesByUserId: (tenantId, userId, roles) =>
      Promise.resolve(updateRolesByUserId(db, tenantId, userId, roles)),
  };
}
