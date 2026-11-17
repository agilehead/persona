export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type Result<T, E = Error> =
  { success: true; data: T } | { success: false; error: E };

export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

export type PersonaConfig = {
  /** Base URL of the Persona service (e.g., "http://localhost:4005") */
  endpoint: string;
  /** Secret for Authorization: Bearer header */
  internalSecret: string;
  /** Tenant ID for multi-tenant mode (appended as ?tenant=xxx) */
  tenantId?: string;
  /** Complete response timeout in milliseconds; defaults to30 seconds. */
  timeout?: number;
  /** Optional logger for debugging */
  logger?: Logger;
};

export type LinkIdentityResponse = {
  success: boolean;
  accessToken: string;
  refreshToken: string;
  identity: {
    id: string;
    tenantId: string;
    userId: string;
    email: string;
    roles: string[];
  };
};

export type UserRolesResponse = {
  userId: string;
  exists: boolean;
  roles: string[];
  etag: string | null;
};
export type RoleLookupsResponse = { users: UserRolesResponse[] };

export type UpdateRolesResponse = {
  success: boolean;
  user: UserRolesResponse;
};

export type RevokeSessionsResponse = {
  success: boolean;
  revokedCount: number;
};
