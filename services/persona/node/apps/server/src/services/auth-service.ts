/**
 * Auth Service
 * Core authentication logic for Persona service
 * All operations require tenant context
 */

import { createLogger } from "@agilehead/persona-logger";
import type { Identity, OAuthUserInfo, TokenPair, Result } from "../types.js";
import { success, failure, ErrorCode } from "../types.js";
import type { IIdentityRepository } from "../repositories/index.js";
import type { TokenService } from "./token-service.js";

const logger = createLogger("persona-auth");

export type AuthServiceDeps = {
  identityRepo: IIdentityRepository;
  tokenService: TokenService;
};

export type AuthService = {
  /**
   * Find or create an identity from OAuth login
   */
  handleOAuthLogin(
    tenantId: string,
    provider: string,
    userInfo: OAuthUserInfo,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<Result<{ identity: Identity; tokens: TokenPair; isNew: boolean }>>;

  /**
   * Link an identity to a user (called by external service after onboarding)
   */
  linkIdentityToUser(
    identityId: string,
    userId: string,
    roles: string[],
  ): Promise<Result<{ identity: Identity; tokens: TokenPair }>>;

  /**
   * Update roles for a user in a specific tenant
   */
  updateUserRoles(
    tenantId: string,
    userId: string,
    roles: string[],
  ): Promise<Result<number>>;

  /**
   * Revoke all sessions for a user in a specific tenant
   */
  revokeUserSessions(tenantId: string, userId: string): Promise<Result<number>>;

  /**
   * Get identity by ID
   */
  getIdentity(identityId: string): Promise<Identity | null>;

  /**
   * Get identity by user ID in a specific tenant
   */
  getIdentityByUserId(
    tenantId: string,
    userId: string,
  ): Promise<Identity | null>;
};

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { identityRepo, tokenService } = deps;

  return {
    async handleOAuthLogin(
      tenantId: string,
      provider: string,
      userInfo: OAuthUserInfo,
      ipAddress?: string,
      userAgent?: string,
    ): Promise<
      Result<{ identity: Identity; tokens: TokenPair; isNew: boolean }>
    > {
      try {
        // Check if identity exists for this tenant+provider+user
        let identity = await identityRepo.findByProvider(
          tenantId,
          provider,
          userInfo.id,
        );
        let isNew = false;

        if (identity === null) {
          // Create new identity with tenant
          identity = await identityRepo.create({
            tenantId,
            provider,
            providerUserId: userInfo.id,
            email: userInfo.email ?? `${userInfo.id}@${provider}.local`,
            name: userInfo.name,
            profileImageUrl: userInfo.picture,
            metadata: userInfo.raw,
          });
          isNew = true;
          logger.info("Created new identity", {
            identityId: identity.id,
            tenantId,
            provider,
          });
        } else {
          logger.info("Found existing identity", {
            identityId: identity.id,
            tenantId,
            userId: identity.userId,
          });
        }

        // Generate tokens
        const { tokens } = await tokenService.generateTokens(
          identity,
          ipAddress,
          userAgent,
        );

        return success({ identity, tokens, isNew });
      } catch (error) {
        logger.error("OAuth login failed", { error, tenantId, provider });
        return failure({
          code: ErrorCode.INTERNAL_ERROR,
          message: "Authentication failed",
        });
      }
    },

    async linkIdentityToUser(
      identityId: string,
      userId: string,
      roles: string[],
    ): Promise<Result<{ identity: Identity; tokens: TokenPair }>> {
      try {
        // Update identity with userId and roles
        const identity = await identityRepo.updateUserIdAndRoles(
          identityId,
          userId,
          roles,
        );

        if (identity === null) {
          return failure({
            code: ErrorCode.NOT_FOUND,
            message: "Identity not found",
          });
        }

        logger.info("Linked identity to user", { identityId, userId, roles });

        // Generate new tokens with updated identity
        const { tokens } = await tokenService.generateTokens(identity);

        return success({ identity, tokens });
      } catch (error) {
        logger.error("Failed to link identity to user", {
          error,
          identityId,
          userId,
        });
        return failure({
          code: ErrorCode.INTERNAL_ERROR,
          message: "Failed to link identity",
        });
      }
    },

    async updateUserRoles(
      tenantId: string,
      userId: string,
      roles: string[],
    ): Promise<Result<number>> {
      try {
        const count = await identityRepo.updateRolesByUserId(
          tenantId,
          userId,
          roles,
        );
        logger.info("Updated user roles", {
          tenantId,
          userId,
          roles,
          updatedCount: count,
        });
        return success(count);
      } catch (error) {
        logger.error("Failed to update user roles", {
          error,
          tenantId,
          userId,
        });
        return failure({
          code: ErrorCode.INTERNAL_ERROR,
          message: "Failed to update roles",
        });
      }
    },

    async revokeUserSessions(
      tenantId: string,
      userId: string,
    ): Promise<Result<number>> {
      return tokenService.revokeAllUserSessions(tenantId, userId);
    },

    async getIdentity(identityId: string): Promise<Identity | null> {
      return identityRepo.findById(identityId);
    },

    async getIdentityByUserId(
      tenantId: string,
      userId: string,
    ): Promise<Identity | null> {
      return identityRepo.findByUserId(tenantId, userId);
    },
  };
}
