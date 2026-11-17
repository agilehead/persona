import type {
  PersonaConfig,
  Logger,
  Result,
  LinkIdentityResponse,
  UpdateRolesResponse,
  UserRolesResponse,
  RoleLookupsResponse,
  RevokeSessionsResponse,
} from "./types.js";
import { failure } from "./types.js";
import { internalRequest } from "./http-client.js";

export type PersonaClient = {
  /** Link an identity to a user after onboarding */
  linkIdentityToUser(
    identityId: string,
    userId: string,
    roles: string[],
  ): Promise<Result<LinkIdentityResponse>>;

  /** Update roles for a user */
  updateUserRoles(
    userId: string,
    roles: string[],
    etag: string,
  ): Promise<Result<UpdateRolesResponse>>;
  getUserRoles(userId: string): Promise<Result<UserRolesResponse>>;
  lookupUserRoles(userIds: string[]): Promise<Result<RoleLookupsResponse>>;

  /** Revoke all sessions for a user */
  revokeUserSessions(userId: string): Promise<Result<RevokeSessionsResponse>>;
};

export function createPersonaClient(config: PersonaConfig): PersonaClient {
  const {
    endpoint,
    internalSecret,
    tenantId,
    timeout = 30_000,
    logger,
  } = config;

  return {
    async linkIdentityToUser(
      identityId: string,
      userId: string,
      roles: string[],
    ): Promise<Result<LinkIdentityResponse>> {
      return internalRequest<LinkIdentityResponse>({
        endpoint,
        method: "POST",
        path: `/internal/identity/${encodeURIComponent(identityId)}/link`,
        secret: internalSecret,
        tenantId,
        body: { userId, roles },
        timeout,
        logger,
      });
    },

    async updateUserRoles(
      userId: string,
      roles: string[],
      etag: string,
    ): Promise<Result<UpdateRolesResponse>> {
      return internalRequest<UpdateRolesResponse>({
        endpoint,
        method: "PUT",
        path: `/internal/user/${encodeURIComponent(userId)}/roles`,
        secret: internalSecret,
        tenantId,
        body: { roles },
        ifMatch: etag,
        timeout,
        logger,
      });
    },

    async getUserRoles(userId: string): Promise<Result<UserRolesResponse>> {
      return internalRequest<UserRolesResponse>({
        endpoint,
        method: "GET",
        path: `/internal/user/${encodeURIComponent(userId)}/roles`,
        secret: internalSecret,
        tenantId,
        timeout,
        logger,
      });
    },
    async lookupUserRoles(
      userIds: string[],
    ): Promise<Result<RoleLookupsResponse>> {
      return internalRequest<RoleLookupsResponse>({
        endpoint,
        method: "POST",
        path: "/internal/users/role-lookups",
        secret: internalSecret,
        tenantId,
        body: { userIds },
        timeout,
        logger,
      });
    },

    async revokeUserSessions(
      userId: string,
    ): Promise<Result<RevokeSessionsResponse>> {
      return internalRequest<RevokeSessionsResponse>({
        endpoint,
        method: "DELETE",
        path: `/internal/user/${encodeURIComponent(userId)}/sessions`,
        secret: internalSecret,
        tenantId,
        timeout,
        logger,
      });
    },
  };
}

export function createNoOpPersonaClient(logger?: Logger): PersonaClient {
  const notConfigured = (): Promise<Result<never>> => {
    logger?.warn("Persona service is not configured");
    return Promise.resolve(
      failure(new Error("Persona service is not configured")),
    );
  };

  return {
    linkIdentityToUser: notConfigured,
    updateUserRoles: notConfigured,
    getUserRoles: notConfigured,
    lookupUserRoles: notConfigured,
    revokeUserSessions: notConfigured,
  };
}
