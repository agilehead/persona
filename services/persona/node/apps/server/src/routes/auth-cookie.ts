/**
 * The httpOnly auth cookies (access_token, refresh_token) — one definition,
 * shared by every route that sets them (Google OAuth, dev password login, and
 * token refresh). Previously each route hard-coded a 30-day maxAge, which
 * silently capped the session at 30 days regardless of the configured refresh
 * token lifetime.
 *
 * The cookie now lives exactly as long as the refresh token can, and is re-set on
 * every refresh — so an active session slides forward and the browser never drops
 * a still-valid session cookie before the server session expires.
 */

import type { CookieOptions } from "express";
import { parseExpirySeconds } from "../utils/expiry.js";

export function authCookieOptions(
  isProduction: boolean,
  refreshTokenExpiry: string,
  domain?: string,
): CookieOptions {
  const options: CookieOptions = {
    httpOnly: true,
    secure: isProduction,
    sameSite: isProduction ? "none" : "lax",
    path: "/",
    maxAge: parseExpirySeconds(refreshTokenExpiry) * 1000,
  };
  if (domain !== undefined && domain !== "") {
    options.domain = domain;
  }
  return options;
}
