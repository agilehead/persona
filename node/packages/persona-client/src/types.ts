export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export type Result<T, E = Error> =
  | { success: true; data: T }
  | { success: false; error: E };

export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function failure<E = Error>(error: E): Result<never, E> {
  return { success: false, error };
}

export type PersonaConfig = {
  /** Base URL of the Persona service (e.g., "http://localhost:4005") */
  endpoint: string;
  /** Secret for X-Internal-Secret header */
  internalSecret: string;
  /** Tenant ID for multi-tenant mode (appended as ?tenant=xxx) */
  tenantId?: string;
  /** Request timeout in milliseconds */
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

export type UpdateRolesResponse = {
  success: boolean;
  updatedCount: number;
};

export type RevokeSessionsResponse = {
  success: boolean;
  revokedCount: number;
};
