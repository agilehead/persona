/**
 * Parse a token-expiry string (e.g. "15m", "60m", "90d") into seconds.
 *
 * Shared by the token service (JWT + session lifetimes) and the auth-cookie
 * helper (cookie maxAge), so a single string configures both and they can never
 * drift. Unrecognised input falls back to 15 minutes.
 */
export function parseExpirySeconds(expiry: string): number {
  const match = /^(\d+)([smhdw])$/.exec(expiry);
  const numValue = match?.[1];
  const unitValue = match?.[2];
  if (numValue === undefined || unitValue === undefined) {
    return 900; // Default 15 minutes
  }
  const value = parseInt(numValue, 10);
  switch (unitValue) {
    case "s":
      return value;
    case "m":
      return value * 60;
    case "h":
      return value * 3600;
    case "d":
      return value * 86400;
    case "w":
      return value * 604800;
    default:
      return 900;
  }
}
