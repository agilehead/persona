/**
 * Google OAuth Routes
 * GET /auth/google - Start OAuth flow
 * GET /auth/google/callback - Handle OAuth callback
 *
 * Tenant is determined by middleware and stored in OAuth state cookie
 */

import {
  Router,
  type Request,
  type Response,
  type CookieOptions,
} from "express";
import { createLogger } from "@agilehead/persona-logger";
import type { AuthService } from "../../services/auth-service.js";
import type { TokenService } from "../../services/token-service.js";
import {
  getGoogleOidcConfig,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  extractUserInfo,
  randomPKCECodeVerifier,
  calculatePKCECodeChallenge,
  type GoogleOAuthConfig,
} from "../../services/oauth/google.js";
import { generateOAuthState, generateNonce } from "../../utils/crypto.js";
import { getTenantFromRequest } from "../../middleware/tenant.js";

const logger = createLogger("persona-oauth-google");

export type GoogleOAuthRoutesConfig = {
  google: GoogleOAuthConfig;
  publicUrl: string;
  defaultRedirectUrl: string;
  isProduction: boolean;
  cookieDomain?: string;
};

// Cookie options for OAuth state
function getStateCookieOptions(
  isProduction: boolean,
  domain?: string,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: 10 * 60 * 1000, // 10 minutes
  };
  if (domain !== undefined && domain !== "") {
    options.domain = domain;
  }
  return options;
}

// Cookie options for auth tokens
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

export function createGoogleOAuthRoutes(
  authService: AuthService,
  _tokenService: TokenService,
  config: GoogleOAuthRoutesConfig,
): Router {
  const router = Router();
  const stateCookieOptions = getStateCookieOptions(
    config.isProduction,
    config.cookieDomain,
  );
  const authCookieOptions = getAuthCookieOptions(
    config.isProduction,
    config.cookieDomain,
  );

  // GET /auth/google?redirect={url} - Start Google OAuth flow
  // Tenant is already set by middleware at this point
  router.get("/google", async (req: Request, res: Response) => {
    try {
      // Get tenant from middleware
      const tenantId = getTenantFromRequest(req);

      // Store redirect URL if provided
      const redirectParam = req.query.redirect;
      if (typeof redirectParam === "string" && redirectParam !== "") {
        // Validate it's a valid URL
        try {
          new URL(redirectParam);
          res.cookie("oauth_redirect", redirectParam, stateCookieOptions);
        } catch {
          logger.warn("Invalid redirect URL provided", {
            redirect: redirectParam,
          });
        }
      }

      const oidcConfig = await getGoogleOidcConfig(config.google);

      // Generate state, nonce, and PKCE verifier
      const state = generateOAuthState();
      const nonce = generateNonce();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

      // Store in cookies (including tenant for callback)
      res.cookie("oauth_state", state, stateCookieOptions);
      res.cookie("oauth_nonce", nonce, stateCookieOptions);
      res.cookie("oauth_code_verifier", codeVerifier, stateCookieOptions);
      res.cookie("oauth_tenant", tenantId, stateCookieOptions);

      // Build authorization URL
      const authUrl = buildAuthorizationUrl(
        oidcConfig,
        config.google.redirectUri,
        state,
        nonce,
        codeChallenge,
      );

      res.redirect(authUrl.href);
    } catch (error) {
      logger.error("Failed to start Google OAuth", { error });
      res.redirect(`${config.defaultRedirectUrl}?error=oauth_failed`);
    }
  });

  // GET /auth/google/callback - Handle Google OAuth callback
  // Note: Tenant middleware is NOT applied here - tenant is retrieved from cookie
  router.get("/google/callback", async (req: Request, res: Response) => {
    try {
      const oidcConfig = await getGoogleOidcConfig(config.google);

      // Get state, code verifier, and tenant from cookies
      const cookies = req.cookies as Record<string, unknown> | undefined;
      const savedState = cookies?.oauth_state;
      const savedNonce = cookies?.oauth_nonce;
      const codeVerifier = cookies?.oauth_code_verifier;
      const redirectUrl = cookies?.oauth_redirect;
      const tenantId = cookies?.oauth_tenant;

      if (
        typeof savedState !== "string" ||
        typeof codeVerifier !== "string" ||
        typeof tenantId !== "string"
      ) {
        logger.warn("Missing OAuth state, code verifier, or tenant");
        res.redirect(`${config.defaultRedirectUrl}?error=invalid_state`);
        return;
      }

      const host = req.get("host");
      if (host === undefined) {
        logger.error("Missing host header");
        res.redirect(`${config.defaultRedirectUrl}?error=invalid_request`);
        return;
      }

      // Build current URL for token exchange
      const protocol = config.isProduction ? "https" : req.protocol;
      const currentUrl = new URL(req.originalUrl, `${protocol}://${host}`);

      // Exchange code for tokens
      const tokens = await exchangeCodeForTokens(
        oidcConfig,
        currentUrl,
        codeVerifier,
        savedState,
        typeof savedNonce === "string" ? savedNonce : undefined,
      );

      // Extract user info
      const userInfo = extractUserInfo(tokens);

      // Clear OAuth state cookies
      res.clearCookie("oauth_state");
      res.clearCookie("oauth_nonce");
      res.clearCookie("oauth_code_verifier");
      res.clearCookie("oauth_redirect");
      res.clearCookie("oauth_tenant");

      // Handle OAuth login with tenant
      const result = await authService.handleOAuthLogin(
        tenantId,
        "google",
        userInfo,
        req.ip,
        req.get("user-agent"),
      );

      if (!result.success) {
        logger.error("OAuth login failed", { error: result.error });
        const finalRedirect =
          typeof redirectUrl === "string"
            ? redirectUrl
            : config.defaultRedirectUrl;
        res.redirect(`${finalRedirect}?error=auth_failed`);
        return;
      }

      const { identity, tokens: authTokens, isNew } = result.data;

      // Set auth cookies
      res.cookie("access_token", authTokens.accessToken, authCookieOptions);
      res.cookie("refresh_token", authTokens.refreshToken, authCookieOptions);

      // Determine redirect URL
      const finalRedirect =
        typeof redirectUrl === "string"
          ? redirectUrl
          : config.defaultRedirectUrl;

      logger.info("OAuth login successful", {
        identityId: identity.id,
        tenantId: identity.tenantId,
        userId: identity.userId,
        isNew,
      });

      res.redirect(finalRedirect);
    } catch (error) {
      logger.error("Google OAuth callback error", { error });
      res.redirect(`${config.defaultRedirectUrl}?error=oauth_failed`);
    }
  });

  return router;
}
