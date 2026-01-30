/**
 * Token Routes
 * POST /token/refresh - Refresh access token
 */

import {
  Router,
  type Request,
  type Response,
  type CookieOptions,
} from "express";
import { createLogger } from "@agilehead/persona-logger";
import type { TokenService } from "../services/token-service.js";
import type { IIdentityRepository } from "../repositories/index.js";

const logger = createLogger("persona-token");

export type TokenRouteConfig = {
  isProduction: boolean;
  cookieDomain?: string;
};

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

export function createTokenRoutes(
  tokenService: TokenService,
  identityRepo: IIdentityRepository,
  config: TokenRouteConfig,
): Router {
  const router = Router();
  const authCookieOptions = getAuthCookieOptions(
    config.isProduction,
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

      // Generate new access token (keep same session/refresh token)
      const accessToken = tokenService.generateAccessToken(
        identity,
        session.id,
      );

      // Update access token cookie
      res.cookie("access_token", accessToken, authCookieOptions);

      res.json({
        accessToken,
        expiresIn: 900, // 15 minutes in seconds
      });
    } catch (error) {
      logger.error("Token refresh error", { error });
      res.status(500).json({ error: "Failed to refresh token" });
    }
  });

  return router;
}
