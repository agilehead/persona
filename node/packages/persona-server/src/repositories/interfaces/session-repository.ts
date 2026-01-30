/**
 * Session Repository Interface
 * Database-agnostic contract for session data access
 * All methods require tenant_id for multi-tenant isolation
 */

import type { Session } from "../../types.js";

export type CreateSessionData = {
  identityId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  ipAddress: string | undefined;
  userAgent: string | undefined;
};

export type ISessionRepository = {
  create(data: CreateSessionData): Promise<Session>;
  findById(id: string): Promise<Session | null>;
  findByTokenHash(tokenHash: string): Promise<Session | null>;
  findByIdentityId(identityId: string): Promise<Session[]>;
  revoke(id: string): Promise<boolean>;
  revokeAllByIdentityId(identityId: string): Promise<number>;
  revokeAllByUserId(tenantId: string, userId: string): Promise<number>;
  deleteExpired(): Promise<number>;
};
