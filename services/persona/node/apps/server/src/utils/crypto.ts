/**
 * Cryptographic utilities for token handling
 */

import { createHash, randomBytes } from "crypto";

/**
 * Hash a token using SHA256
 */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Generate a random refresh token (64 hex characters)
 */
export function generateRefreshToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a random state for OAuth flows
 */
export function generateOAuthState(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Generate a random nonce for OAuth flows
 */
export function generateNonce(): string {
  return randomBytes(32).toString("hex");
}
