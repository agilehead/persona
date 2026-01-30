/**
 * Logout Route
 * POST /logout - Revoke session and clear cookies
 */

import {
  Router,
  type Request,
  type Response,
  type CookieOptions,
} from "express";
import { createLogger } from "@agilehead/persona-logger";
import type { TokenService } from "../services/token-service.js";

const logger = createLogger("persona-logout");

export type LogoutRouteConfig = {
  isProduction: boolean;
  cookieDomain?: string;
};

function getClearCookieOptions(
  isProduction: boolean,
  domain?: string,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
  };
  if (domain !== undefined && domain !== "") {
    options.domain = domain;
  }
  return options;
}

export function createLogoutRoutes(
  tokenService: TokenService,
  config: LogoutRouteConfig,
): Router {
  const router = Router();
  const clearCookieOptions = getClearCookieOptions(
    config.isProduction,
    config.cookieDomain,
  );

  // POST /logout - Revoke session and clear cookies
  router.post("/", async (req: Request, res: Response) => {
    try {
      // Get refresh token to identify session
      const cookies = req.cookies as Record<string, unknown> | undefined;
      const cookieToken = cookies?.refresh_token;
      const bodyToken = (req.body as Record<string, unknown> | undefined)
        ?.refreshToken;
      const refreshToken =
        typeof cookieToken === "string"
          ? cookieToken
          : typeof bodyToken === "string"
            ? bodyToken
            : null;

      if (refreshToken !== null) {
        const sessionResult =
          await tokenService.validateRefreshToken(refreshToken);
        if (sessionResult.success) {
          await tokenService.revokeSession(sessionResult.data.id);
          logger.info("Session revoked", { sessionId: sessionResult.data.id });
        }
      }

      // Clear cookies
      res.clearCookie("access_token", clearCookieOptions);
      res.clearCookie("refresh_token", clearCookieOptions);

      res.json({ success: true });
    } catch (error) {
      logger.error("Logout error", { error });
      // Still clear cookies even on error
      res.clearCookie("access_token", clearCookieOptions);
      res.clearCookie("refresh_token", clearCookieOptions);
      res.json({ success: true });
    }
  });

  return router;
}
