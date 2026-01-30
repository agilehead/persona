/**
 * Token Service
 * Handles JWT generation, validation, and refresh token management
 * Includes tenant information in JWT payload
 */

import jwt from "jsonwebtoken";
import type {
  Identity,
  Session,
  JWTPayload,
  TokenPair,
  Result,
} from "../types.js";
import { success, failure, ErrorCode } from "../types.js";
import type { ISessionRepository } from "../repositories/index.js";
import { hashToken, generateRefreshToken } from "../utils/crypto.js";

export type TokenServiceConfig = {
  jwtSecret: string;
  accessTokenExpiry: string;
  refreshTokenExpiry: string;
};

export type TokenServiceDeps = {
  sessionRepo: ISessionRepository;
  config: TokenServiceConfig;
};

export type TokenService = {
  /**
   * Generate access and refresh tokens for an identity
   */
  generateTokens(
    identity: Identity,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<{ tokens: TokenPair; session: Session }>;

  /**
   * Generate a new access token for an existing session
   */
  generateAccessToken(identity: Identity, sessionId: string): string;

  /**
   * Verify an access token and return the payload
   */
  verifyAccessToken(token: string): Result<JWTPayload>;

  /**
   * Validate a refresh token and return the session
   */
  validateRefreshToken(token: string): Promise<Result<Session>>;

  /**
   * Revoke a session
   */
  revokeSession(sessionId: string): Promise<Result<void>>;

  /**
   * Revoke all sessions for an identity
   */
  revokeAllIdentitySessions(identityId: string): Promise<Result<number>>;

  /**
   * Revoke all sessions for a user (across all identities) in a specific tenant
   */
  revokeAllUserSessions(
    tenantId: string,
    userId: string,
  ): Promise<Result<number>>;
};

function parseExpiry(expiry: string): number {
  const match = /^(\d+)([smhdw])$/.exec(expiry);
  const numValue = match?.[1];
  const unitValue = match?.[2];
  if (numValue === undefined || unitValue === undefined) {
    return 900; // Default 15 minutes
  }
  const value = parseInt(numValue, 10);
  const unit = unitValue;
  switch (unit) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    case "w":
      return value * 604800;
    default:
      return 900;
  }
}

export function createTokenService(deps: TokenServiceDeps): TokenService {
  const { sessionRepo, config } = deps;
  const accessTokenExpirySeconds = parseExpiry(config.accessTokenExpiry);
  const refreshTokenExpirySeconds = parseExpiry(config.refreshTokenExpiry);

  return {
    async generateTokens(
      identity: Identity,
      ipAddress?: string,
      userAgent?: string,
    ): Promise<{ tokens: TokenPair; session: Session }> {
      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const tokenHash = hashToken(refreshToken);
      const expiresAt = new Date(Date.now() + refreshTokenExpirySeconds * 1000);

      // Create session with tenant
      const session = await sessionRepo.create({
        identityId: identity.id,
        tenantId: identity.tenantId,
        tokenHash,
        expiresAt,
        ipAddress,
        userAgent,
      });

      // Generate access token
      const accessToken = this.generateAccessToken(identity, session.id);

      return {
        tokens: {
          accessToken,
          refreshToken,
          expiresIn: accessTokenExpirySeconds,
        },
        session,
      };
    },

    generateAccessToken(identity: Identity, sessionId: string): string {
      const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: identity.id,
        tenant: identity.tenantId,
        userId: identity.userId,
        email: identity.email,
        name: identity.name,
        profileImageUrl: identity.profileImageUrl,
        roles: identity.roles,
        sessionId,
      };

      return jwt.sign(payload, config.jwtSecret, {
        expiresIn: accessTokenExpirySeconds,
      });
    },

    verifyAccessToken(token: string): Result<JWTPayload> {
      try {
        const decoded = jwt.verify(token, config.jwtSecret) as JWTPayload;
        return success(decoded);
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          return failure({
            code: ErrorCode.INVALID_TOKEN,
            message: "Token expired",
          });
        }
        if (error instanceof jwt.JsonWebTokenError) {
          return failure({
            code: ErrorCode.INVALID_TOKEN,
            message: "Invalid token",
          });
        }
        return failure({
          code: ErrorCode.INTERNAL_ERROR,
          message: "Token verification failed",
        });
      }
    },

    async validateRefreshToken(token: string): Promise<Result<Session>> {
      const tokenHash = hashToken(token);
      const session = await sessionRepo.findByTokenHash(tokenHash);

      if (session === null) {
        return failure({
          code: ErrorCode.INVALID_TOKEN,
          message: "Invalid refresh token",
        });
      }

      if (session.revoked) {
        return failure({
          code: ErrorCode.INVALID_TOKEN,
          message: "Session has been revoked",
        });
      }

      if (session.expiresAt < new Date()) {
        return failure({
          code: ErrorCode.INVALID_TOKEN,
          message: "Refresh token expired",
        });
      }

      return success(session);
    },

    async revokeSession(sessionId: string): Promise<Result<void>> {
      const revoked = await sessionRepo.revoke(sessionId);
      if (!revoked) {
        return failure({
          code: ErrorCode.NOT_FOUND,
          message: "Session not found",
        });
      }
      return success(undefined);
    },

    async revokeAllIdentitySessions(
      identityId: string,
    ): Promise<Result<number>> {
      const count = await sessionRepo.revokeAllByIdentityId(identityId);
      return success(count);
    },

    async revokeAllUserSessions(
      tenantId: string,
      userId: string,
    ): Promise<Result<number>> {
      const count = await sessionRepo.revokeAllByUserId(tenantId, userId);
      return success(count);
    },
  };
}
