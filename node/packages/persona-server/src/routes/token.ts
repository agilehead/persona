/**
 * Token Routes
 * POST /token/refresh - Refresh access token
 */

import { Router, type Request, type Response } from "express";
import { createLogger } from "@agilehead/persona-logger";
import type { TokenService } from "../services/token-service.js";
import type { IIdentityRepository } from "../repositories/index.js";
import { authCookieOptions as buildAuthCookieOptions } from "./auth-cookie.js";

const logger = createLogger("persona-token");

export type TokenRouteConfig = {
  isProduction: boolean;
  cookieDomain?: string;
  refreshTokenExpiry: string;
};

export function createTokenRoutes(
  tokenService: TokenService,
  identityRepo: IIdentityRepository,
  config: TokenRouteConfig,
): Router {
  const router = Router();
  const authCookieOptions = buildAuthCookieOptions(
    config.isProduction,
    config.refreshTokenExpiry,
    config.cookieDomain,
  );

  // POST /token/refresh - Refresh access token
  router.post("/refresh", async (req: Request, res: Response) => {
    try {
      // Get refresh token from cookie or body
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

      if (refreshToken === null) {
        res.status(401).json({ error: "No refresh token provided" });
        return;
      }

      // Validate refresh token
      const sessionResult =
        await tokenService.validateRefreshToken(refreshToken);
      if (!sessionResult.success) {
        res.clearCookie("access_token");
        res.clearCookie("refresh_token");
        res.status(401).json({ error: sessionResult.error.message });
        return;
      }

      const session = sessionResult.data;

      // Get identity
      const identity = await identityRepo.findById(session.identityId);
      if (identity === null) {
        res.status(401).json({ error: "Identity not found" });
        return;
      }

      // Roll the window forward: an active session slides its expiry out by the
      // full refresh lifetime, so continued use never lapses. Keep the same
      // refresh token value; only its lifetime (server session + cookie) extends.
      const slid = await tokenService.slideSession(session.id);
      if (!slid.success) {
        res.status(401).json({ error: slid.error.message });
        return;
      }

      // Generate new access token (keep same session/refresh token)
      const accessToken = tokenService.generateAccessToken(
        identity,
        session.id,
      );

      // Re-set BOTH cookies so the browser-side expiry slides forward too — the
      // access token (new value) and the refresh token (same value, fresh maxAge).
      res.cookie("access_token", accessToken, authCookieOptions);
      res.cookie("refresh_token", refreshToken, authCookieOptions);

      res.json({
        accessToken,
        expiresIn: tokenService.accessTokenExpirySeconds,
      });
    } catch (error) {
      logger.error("Token refresh error", { error });
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  return router;
}
