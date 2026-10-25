import { hash, verify, type Algorithm } from "@node-rs/argon2";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { getSettings } from "./config";
import { HttpError } from "./errors";

// argon2-cffi PasswordHasher defaults, so hashes stay interchangeable with the Python service.
const ARGON2_OPTIONS = {
  // Algorithm.Argon2id; the package ships it as an ambient const enum.
  algorithm: 2 as Algorithm.Argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
  outputLen: 32,
} as const;

/** Hash password using Argon2id. */
export async function hashPassword(password: string): Promise<string> {
  return hash(password, ARGON2_OPTIONS);
}

/** Verify password against an Argon2id hash; malformed hashes never verify. */
export async function verifyPassword(plainPassword: string, hashedPassword: string): Promise<boolean> {
  try {
    return await verify(hashedPassword, plainPassword);
  } catch {
    return false;
  }
}

export interface AccessTokenClaims {
  sub: string;
  org_id: number;
  role: string;
}

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getSettings().JWT_SECRET_KEY);
}

/** Create a signed JWT access token. */
export async function createAccessToken(claims: AccessTokenClaims, expiresInMinutes?: number): Promise<string> {
  const settings = getSettings();
  const nowSec = Math.floor(Date.now() / 1000);
  const ttlSec = Math.floor((expiresInMinutes ?? settings.ACCESS_TOKEN_EXPIRE_MINUTES) * 60);
  return new SignJWT({ ...claims })
    .setProtectedHeader({ alg: settings.JWT_ALGORITHM, typ: "JWT" })
    .setIssuedAt(nowSec)
    .setExpirationTime(nowSec + ttlSec)
    .sign(secretKey());
}

/** Decode and validate a JWT access token, raising HTTP 401 on any failure. */
export async function decodeAccessToken(token: string): Promise<JWTPayload> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: [getSettings().JWT_ALGORITHM] });
    return payload;
  } catch {
    throw new HttpError(401, "Could not validate credentials", { "WWW-Authenticate": "Bearer" });
  }
}
