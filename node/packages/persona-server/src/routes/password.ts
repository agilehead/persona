/**
 * Dev Username/Password Route
 * POST /auth/login - Authenticate a configured dev user
 *
 * DEVELOPMENT ONLY. Credentials come from PERSONA_DEV_USERS and this router is
 * mounted only when `config.devAuth` is set (never in production). It reuses the
 * standard login path (`handleOAuthLogin`) with the provider "password", so a
 * dev user gets a real identity + session just like an OAuth user. Tenant is
 * resolved by the tenant middleware, exactly like the Google flow.
 */

import {
  Router,
  type Request,
  type Response,
  type CookieOptions,
} from "express";
import { z } from "zod";
import { createLogger } from "@agilehead/persona-logger";
import type { AuthService } from "../services/auth-service.js";
import { verifyDevUser, type DevUser } from "../utils/dev-users.js";
import { getTenantFromRequest } from "../middleware/tenant.js";

const logger = createLogger("persona-auth-password");

export type PasswordAuthRoutesConfig = {
  users: DevUser[];
  isProduction: boolean;
  cookieDomain?: string;
};

const LoginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

function getAuthCookieOptions(
  isProduction: boolean,
  domain?: string,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  if (domain !== undefined && domain !== "") {
    options.domain = domain;
  }
  return options;
}

export function createPasswordAuthRoutes(
  authService: AuthService,
  config: PasswordAuthRoutesConfig,
): Router {
  const router = Router();
  const authCookieOptions = getAuthCookieOptions(
    config.isProduction,
    config.cookieDomain,
  );

  // POST /auth/login - dev username/password login (tenant set by middleware)
  router.post("/login", async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantFromRequest(req);

      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "username and password are required" });
        return;
      }

      const { username, password } = parsed.data;

      if (!verifyDevUser(config.users, username, password)) {
        logger.warn("Dev login rejected", { tenantId, username });
        res.status(401).json({ error: "Invalid username or password" });
        return;
      }

      // Reuse the OAuth login path: find-or-create the identity + issue tokens.
      const result = await authService.handleOAuthLogin(
        tenantId,
        "password",
        { id: username, name: username, raw: {} },
        req.ip,
        req.get("user-agent"),
      );

      if (!result.success) {
        logger.error("Dev login failed to issue tokens", {
          error: result.error,
        });
        res.status(500).json({ error: "Authentication failed" });
        return;
      }

      const { identity, tokens, isNew } = result.data;

      res.cookie("access_token", tokens.accessToken, authCookieOptions);
      res.cookie("refresh_token", tokens.refreshToken, authCookieOptions);

      logger.info("Dev login successful", {
        identityId: identity.id,
        tenantId: identity.tenantId,
        username,
        isNew,
      });

      // The refresh token is delivered only as an httpOnly cookie, matching the
      // OAuth flow and /token/refresh — never in the JSON body.
      res.json({
        accessToken: tokens.accessToken,
        expiresIn: tokens.expiresIn,
        identity: {
          id: identity.id,
          email: identity.email,
          name: identity.name,
          roles: identity.roles,
          userId: identity.userId,
        },
      });
    } catch (error) {
      logger.error("Dev login error", { error });
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  return router;
}
