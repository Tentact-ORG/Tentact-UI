import "server-only";
import { pbkdf2, randomBytes, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const pbkdf2Async = promisify(pbkdf2);

/**
 * Encoded hash format: `pbkdf2-sha256.<iterations>.<salt base64url>.<key base64url>`.
 * Dots separate the fields because base64url never contains them, and the
 * format stays free of `$`, which `.env` loaders treat as variable expansion.
 * `scripts/hash-password.mjs` produces the same format.
 */
export const PASSWORD_HASH_ALGORITHM = "pbkdf2-sha256";
/** OWASP's current recommendation for PBKDF2-HMAC-SHA256. */
const DEFAULT_ITERATIONS = 600_000;
const MIN_ITERATIONS = 100_000;
const KEY_LENGTH_BYTES = 32;
const SALT_LENGTH_BYTES = 16;

interface ParsedPasswordHash {
  iterations: number;
  salt: Buffer;
  key: Buffer;
}

export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const key = await pbkdf2Async(password, salt, iterations, KEY_LENGTH_BYTES, "sha256");
  return [PASSWORD_HASH_ALGORITHM, iterations, salt.toString("base64url"), key.toString("base64url")].join(".");
}

export function parsePasswordHash(encoded: string): ParsedPasswordHash | null {
  const [algorithm, iterationsText, saltText, keyText, ...rest] = encoded.split(".");
  if (algorithm !== PASSWORD_HASH_ALGORITHM || !iterationsText || !saltText || !keyText || rest.length > 0) return null;

  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations < MIN_ITERATIONS) return null;

  const salt = Buffer.from(saltText, "base64url");
  const key = Buffer.from(keyText, "base64url");
  if (salt.length === 0 || key.length === 0) return null;

  return { iterations, salt, key };
}

export function isPasswordHash(encoded: string): boolean {
  return parsePasswordHash(encoded) !== null;
}

/** Constant-time comparison of a password against an encoded hash. */
export async function verifyPassword(password: string, encodedHash: string): Promise<boolean> {
  const parsed = parsePasswordHash(encodedHash);
  if (!parsed) return false;

  const key = await pbkdf2Async(password, parsed.salt, parsed.iterations, parsed.key.length, "sha256");
  return key.length === parsed.key.length && timingSafeEqual(key, parsed.key);
}

let dummyHash: Promise<string> | undefined;

/**
 * A throw-away hash used to verify against when no account matches, so that an
 * unknown email takes as long to reject as a wrong password.
 */
export function getDummyPasswordHash(): Promise<string> {
  dummyHash ??= hashPassword(randomBytes(32).toString("hex"));
  return dummyHash;
}
