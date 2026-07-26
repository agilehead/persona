/**
 * Dev-only username/password helpers.
 *
 * Credentials are supplied through the PERSONA_DEV_USERS env var and are never a
 * real user store. This mechanism is only ever active outside production — see
 * `resolveDevAuth` (used by config.ts) and routes/password.ts, which is mounted
 * only when `config.devAuth` is set.
 *
 * A single wildcard entry ("*:password") accepts ANY username that presents the
 * wildcard password, so an automated test harness can sign in as arbitrary,
 * per-test identities without pre-registering each one. Persona get-or-creates
 * the identity on first login, exactly as for an explicit dev user. Explicit
 * entries always take precedence over the wildcard, and the "*" username itself
 * is reserved — it can never be used as an actual login identity.
 */

import { createHash, timingSafeEqual } from "crypto";

export type DevUser = { username: string; password: string };

/**
 * Resolved dev-auth configuration: the explicit username/password entries plus
 * an optional wildcard password that authenticates any (non-reserved) username.
 */
export type DevAuthConfig = {
  users: DevUser[];
  wildcardPassword?: string;
};

// The username that marks the wildcard entry in PERSONA_DEV_USERS. It is config
// syntax, not an account, so it can never be used as a login username.
export const WILDCARD_USERNAME = "*";

/**
 * Parse the PERSONA_DEV_USERS value ("alice:pw1,bob:pw2") into dev users.
 *
 * The first colon separates username from password, so passwords may contain
 * colons. Blank entries (e.g. a trailing comma) are ignored; a malformed entry
 * throws so a misconfiguration fails loudly at startup rather than silently
 * disabling a login. A wildcard entry ("*:pw") parses like any other pair;
 * `resolveDevAuth` is what gives "*" its special meaning.
 */
export function parseDevUsers(raw: string): DevUser[] {
  const users: DevUser[] = [];
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (trimmed === "") continue;
    const separator = trimmed.indexOf(":");
    if (separator <= 0 || separator === trimmed.length - 1) {
      throw new Error(
        `Invalid PERSONA_DEV_USERS entry "${entry}": expected "username:password"`,
      );
    }
    const username = trimmed.slice(0, separator).trim();
    const password = trimmed.slice(separator + 1).trim();
    if (username === "" || password === "") {
      throw new Error(
        `Invalid PERSONA_DEV_USERS entry "${entry}": username and password must be non-empty`,
      );
    }
    users.push({ username, password });
  }
  return users;
}

// Constant-time credential check over fixed-length SHA-256 digests, so the
// buffers handed to timingSafeEqual are always equal length regardless of input.
function secureEquals(expected: string, actual: string): boolean {
  const expectedDigest = createHash("sha256").update(expected).digest();
  const actualDigest = createHash("sha256").update(actual).digest();
  return timingSafeEqual(expectedDigest, actualDigest);
}

/**
 * Check a username/password pair against the resolved dev-auth config.
 *
 * Resolution order:
 *   1. The reserved wildcard username ("*") is never a valid login identity.
 *   2. An explicit entry for the username is authoritative — only its own
 *      password is accepted (the wildcard is not a fallback for listed users).
 *   3. Otherwise, if a wildcard password is configured, any username
 *      authenticates with it.
 *
 * Comparisons are constant-time. Username lookup is exact and case-sensitive.
 */
export function verifyDevUser(
  config: DevAuthConfig,
  username: string,
  password: string,
): boolean {
  if (username === WILDCARD_USERNAME) return false;
  const candidate = config.users.find((u) => u.username === username);
  if (candidate !== undefined) {
    return secureEquals(candidate.password, password);
  }
  if (config.wildcardPassword !== undefined) {
    return secureEquals(config.wildcardPassword, password);
  }
  return false;
}

// NODE_ENV values in which dev username/password login is permitted. This is an
// allowlist (fail-closed): any other value — production, staging, a typo, or an
// unexpected label — disables dev login even if PERSONA_DEV_USERS is set. An
// unset NODE_ENV counts as development, matching the rest of the config.
const DEV_ENVIRONMENTS = new Set(["", "development", "test"]);

/**
 * Resolve the dev-auth config from the raw env values.
 *
 * Returns `undefined` (login disabled) unless ALL of the following hold:
 *   - PERSONA_DEV_USERS is set to a non-empty value,
 *   - NODE_ENV is a recognized development environment (see DEV_ENVIRONMENTS),
 *   - at least one explicit user OR a wildcard entry was parsed.
 *
 * A single wildcard entry ("*:password") is lifted out into `wildcardPassword`
 * and is enough on its own to enable dev login. More than one wildcard entry is
 * ambiguous and throws. The environment check is fail-closed: dev login is never
 * active in an environment we do not explicitly recognize as development. Throws
 * (via parseDevUsers) on a malformed PERSONA_DEV_USERS value.
 */
export function resolveDevAuth(
  raw: string | undefined,
  nodeEnv: string | undefined,
): DevAuthConfig | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!DEV_ENVIRONMENTS.has(nodeEnv ?? "")) return undefined;

  const parsed = parseDevUsers(raw);
  const wildcards = parsed.filter((u) => u.username === WILDCARD_USERNAME);
  if (wildcards.length > 1) {
    throw new Error(
      `Invalid PERSONA_DEV_USERS: multiple wildcard ("*") entries`,
    );
  }
  const users = parsed.filter((u) => u.username !== WILDCARD_USERNAME);
  const wildcard = wildcards[0];

  if (users.length === 0 && wildcard === undefined) return undefined;

  const resolved: DevAuthConfig = { users };
  if (wildcard !== undefined) {
    resolved.wildcardPassword = wildcard.password;
  }
  return resolved;
}
