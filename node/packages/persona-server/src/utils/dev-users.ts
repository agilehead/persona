/**
 * Dev-only username/password helpers.
 *
 * Credentials are supplied through the PERSONA_DEV_USERS env var and are never a
 * real user store. This mechanism is only ever active outside production — see
 * `resolveDevAuth` (used by config.ts) and routes/password.ts, which is mounted
 * only when `config.devAuth` is set.
 */

import { createHash, timingSafeEqual } from "crypto";

export type DevUser = { username: string; password: string };

/**
 * Parse the PERSONA_DEV_USERS value ("alice:pw1,bob:pw2") into dev users.
 *
 * The first colon separates username from password, so passwords may contain
 * colons. Blank entries (e.g. a trailing comma) are ignored; a malformed entry
 * throws so a misconfiguration fails loudly at startup rather than silently
 * disabling a login.
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

/**
 * Check a username/password pair against the configured dev users.
 *
 * The password comparison runs over fixed-length SHA-256 digests so equal-length
 * buffers are always compared. Username lookup is an exact, case-sensitive match.
 */
export function verifyDevUser(
  users: DevUser[],
  username: string,
  password: string,
): boolean {
  const candidate = users.find((u) => u.username === username);
  if (candidate === undefined) return false;
  const expected = createHash("sha256").update(candidate.password).digest();
  const actual = createHash("sha256").update(password).digest();
  return timingSafeEqual(expected, actual);
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
 *   - at least one valid user was parsed.
 *
 * The environment check is fail-closed: dev login is never active in an
 * environment we do not explicitly recognize as development. Throws (via
 * parseDevUsers) on a malformed PERSONA_DEV_USERS value.
 */
export function resolveDevAuth(
  raw: string | undefined,
  nodeEnv: string | undefined,
): { users: DevUser[] } | undefined {
  if (raw === undefined || raw === "") return undefined;
  if (!DEV_ENVIRONMENTS.has(nodeEnv ?? "")) return undefined;
  const users = parseDevUsers(raw);
  if (users.length === 0) return undefined;
  return { users };
}
