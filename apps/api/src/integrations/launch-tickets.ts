import { createHash, createPrivateKey, createPublicKey, randomUUID, sign, type KeyObject } from "node:crypto";

/**
 * Roadmap phase 10: signed launch tickets into a DM's Web VTT.
 *
 * A ticket is a compact JWS (header.payload.signature, base64url) signed with
 * Ed25519 ("EdDSA"). It names the VTT instance as its audience, lives at most
 * 60 seconds and carries a single-use id; the VTT checks all of it against the
 * public keys its host trusts. The private key comes only from the
 * environment (PLATFORM_LAUNCH_PRIVATE_KEY: a PKCS#8 PEM, or that PEM in
 * base64); never from code.
 */
export const LAUNCH_ISSUER = "dndnerds-platform";
export const LAUNCH_TTL_SECONDS = 60;

export interface LaunchClaims {
  iss: typeof LAUNCH_ISSUER;
  aud: string;
  sub: string;
  name: string;
  role: "dm" | "player" | "observer";
  tbl: string;
  tname: string;
  ed: "2014" | "2024" | "mixed";
  jti: string;
  iat: number;
  exp: number;
}

const base64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

let cached: { privateKey: KeyObject; publicPem: string; kid: string } | null | undefined;

function readPem(raw: string): string {
  const text = raw.trim();
  return text.startsWith("-----BEGIN") ? text : Buffer.from(text, "base64").toString("utf8");
}

/** The signing key from the environment, or null when launches aren't set up here. */
export function launchKey(): { privateKey: KeyObject; publicPem: string; kid: string } | null {
  if (cached !== undefined) return cached;
  const raw = process.env.PLATFORM_LAUNCH_PRIVATE_KEY;
  if (!raw) return (cached = null);
  const privateKey = createPrivateKey(readPem(raw));
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("PLATFORM_LAUNCH_PRIVATE_KEY must be an Ed25519 key.");
  const publicKey = createPublicKey(privateKey);
  const publicPem = publicKey.export({ type: "spki", format: "pem" }).toString();
  const kid = createHash("sha256").update(publicKey.export({ type: "spki", format: "der" })).digest("hex").slice(0, 16);
  return (cached = { privateKey, publicPem, kid });
}

/** For tests: forget the cached key after the environment changes. */
export function resetLaunchKey() {
  cached = undefined;
}

export function signLaunchTicket(claims: Omit<LaunchClaims, "iss" | "jti" | "iat" | "exp">, nowMs = Date.now()): { token: string; claims: LaunchClaims } {
  const key = launchKey();
  if (!key) throw new Error("LAUNCH_NOT_CONFIGURED");
  const iat = Math.floor(nowMs / 1000);
  const full: LaunchClaims = { iss: LAUNCH_ISSUER, ...claims, jti: randomUUID(), iat, exp: iat + LAUNCH_TTL_SECONDS };
  const header = { alg: "EdDSA", typ: "JWT", kid: key.kid };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(full))}`;
  const signature = sign(null, Buffer.from(signingInput), key.privateKey);
  return { token: `${signingInput}.${base64url(signature)}`, claims: full };
}
