import { randomBytes } from "crypto";

// Base62 alphabet: 0-9, A-Z, a-z
const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/**
 * Generate a short, URL-friendly ID using base62 encoding.
 * Default length is 16 characters, providing 62^16 (~4.8 x 10^28) unique values.
 * This gives approximately 95 bits of entropy.
 */
export function generateId(length = 16): string {
  const bytes = randomBytes(length);
  let result = "";

  for (let i = 0; i < length; i++) {
    const byte = bytes[i];
    if (byte === undefined) {
      throw new Error("Failed to generate random bytes");
    }
    const char = BASE62_ALPHABET[byte % 62];
    if (char === undefined) {
      throw new Error("Failed to generate character");
    }
    result += char;
  }

  return result;
}
