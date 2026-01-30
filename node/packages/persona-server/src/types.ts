/**
 * Persona Service Types
 */

// Result type for operations
export type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };

export const ErrorCode = {
  NOT_FOUND: "NOT_FOUND",
  ALREADY_EXISTS: "ALREADY_EXISTS",
  INVALID_INPUT: "INVALID_INPUT",
  INVALID_TOKEN: "INVALID_TOKEN",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export type AppError = {
  code: ErrorCode;
  message: string;
  details?: string;
  field?: string;
};

export function success<T>(data: T): Result<T, never> {
  return { success: true, data };
}

export function failure<E = AppError>(error: E): Result<never, E> {
  return { success: false, error };
}

// Identity record (with tenant)
export type Identity = {
  id: string;
  tenantId: string;
  provider: string;
  providerUserId: string;
  email: string;
  name?: string;
  profileImageUrl?: string;
  userId?: string;
  roles: string[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
};

// Session record (with tenant)
export type Session = {
  id: string;
  identityId: string;
  tenantId: string;
  tokenHash: string;
  expiresAt: Date;
  revoked: boolean;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
};

// OAuth user info from provider
export type OAuthUserInfo = {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  raw: Record<string, unknown>;
};

// JWT payload structure (with tenant)
export type JWTPayload = {
  sub: string; // identityId
  tenant: string; // tenant ID
  userId?: string;
  email: string;
  name?: string;
  profileImageUrl?: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
};

// Token pair returned after auth
export type TokenPair = {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
};

// Link request from external service
export type LinkRequest = {
  userId: string;
  roles: string[];
};

// Roles update request
export type RolesUpdateRequest = {
  roles: string[];
};

// Express request extension for tenant
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- global augmentation requires namespace
  namespace Express {
    // eslint-disable-next-line @typescript-eslint/consistent-type-definitions -- interface required for declaration merging
    interface Request {
      tenant?: string;
    }
  }
}
