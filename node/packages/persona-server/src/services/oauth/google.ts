/**
 * Google OAuth Implementation
 */

import * as client from "openid-client";
import type { OAuthUserInfo } from "../../types.js";

export type GoogleOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  issuer: string;
};

// Cache for OIDC configuration
let googleOidcConfig: client.Configuration | null = null;

export async function getGoogleOidcConfig(
  config: GoogleOAuthConfig,
): Promise<client.Configuration> {
  if (googleOidcConfig !== null) {
    return googleOidcConfig;
  }

  googleOidcConfig = await client.discovery(
    new URL(config.issuer),
    config.clientId,
    config.clientSecret,
  );

  return googleOidcConfig;
}

export function buildAuthorizationUrl(
  oidcConfig: client.Configuration,
  redirectUri: string,
  state: string,
  nonce: string,
  codeChallenge: string,
): URL {
  return client.buildAuthorizationUrl(oidcConfig, {
    redirect_uri: redirectUri,
    scope: "openid email profile",
    state,
    nonce,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });
}

// Type for token response with claims helper
type TokenResponseWithClaims = Awaited<
  ReturnType<typeof client.authorizationCodeGrant>
>;

export async function exchangeCodeForTokens(
  oidcConfig: client.Configuration,
  currentUrl: URL,
  codeVerifier: string,
  expectedState: string,
  expectedNonce?: string,
): Promise<TokenResponseWithClaims> {
  const grantChecks: {
    pkceCodeVerifier: string;
    expectedState: string;
    expectedNonce?: string;
  } = {
    pkceCodeVerifier: codeVerifier,
    expectedState,
  };

  if (expectedNonce !== undefined) {
    grantChecks.expectedNonce = expectedNonce;
  }

  return client.authorizationCodeGrant(oidcConfig, currentUrl, grantChecks);
}

export function extractUserInfo(
  tokens: TokenResponseWithClaims,
): OAuthUserInfo {
  const claims = tokens.claims();
  if (claims === undefined) {
    throw new Error("No claims in ID token");
  }

  const userInfo: OAuthUserInfo = {
    id: claims.sub,
    raw: claims as Record<string, unknown>,
  };

  if (typeof claims.email === "string") {
    userInfo.email = claims.email;
  }
  if (typeof claims.name === "string") {
    userInfo.name = claims.name;
  }
  if (typeof claims.picture === "string") {
    userInfo.picture = claims.picture;
  }

  return userInfo;
}

// Re-export PKCE utilities
export const randomPKCECodeVerifier = client.randomPKCECodeVerifier;
export const calculatePKCECodeChallenge = client.calculatePKCECodeChallenge;
