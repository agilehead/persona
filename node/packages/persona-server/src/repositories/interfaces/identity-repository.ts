/**
 * Identity Repository Interface
 * Database-agnostic contract for identity data access
 * All methods require tenant_id for multi-tenant isolation
 */

import type { Identity } from "../../types.js";

export type CreateIdentityData = {
  tenantId: string;
  provider: string;
  providerUserId: string;
  email: string;
  name: string | undefined;
  profileImageUrl: string | undefined;
  metadata: Record<string, unknown> | undefined;
};

export type IIdentityRepository = {
  create(data: CreateIdentityData): Promise<Identity>;
  findById(id: string): Promise<Identity | null>;
  findByProvider(
    tenantId: string,
    provider: string,
    providerUserId: string,
  ): Promise<Identity | null>;
  findByEmail(tenantId: string, email: string): Promise<Identity | null>;
  findByUserId(tenantId: string, userId: string): Promise<Identity | null>;
  updateUserIdAndRoles(
    id: string,
    userId: string,
    roles: string[],
  ): Promise<Identity | null>;
  updateRolesByUserId(
    tenantId: string,
    userId: string,
    roles: string[],
  ): Promise<number>;
};
