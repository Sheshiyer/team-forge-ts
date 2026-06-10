/**
 * Cloudflare Access JWT validation for the founder secrets layer.
 *
 * SECURITY MODEL (do not weaken — see RedTeam findings S1–S4, 2026-06-11):
 *  - The Worker validates the Access JWT itself. It NEVER trusts the edge having
 *    "probably" authenticated the request, because forge.thoughtseed.space is a
 *    Worker-only route (100:: origin) reachable directly, and because IP-bypass
 *    requests arrive with auth_status:NONE and no assertion at all.
 *  - A request is a FOUNDER only if: RS256 signature verifies against the team
 *    JWKS, `aud` exactly equals the configured Access AUD, `iss` exactly equals
 *    https://<team-domain>, the time window (exp/nbf/iat) is valid, AND the
 *    `email` claim is byte-equal (lowercased) to an entry in FOUNDER_ALLOWLIST.
 *  - A token carrying `common_name` (service token) is an AGENT principal, never
 *    a founder, even if it somehow also carries an email.
 *  - No valid assertion → caller is at most a machine/agent principal via a
 *    separate header check; it can never be a founder. Fail closed.
 *
 * The founder allowlist is hardcoded here on purpose: founder authority must not
 * be configurable via env, KV, or the Access policy alone. Widening it is a code
 * change that goes through review.
 */

import type { Env } from "./env";

// Canonical founder logins (One-Time PIN to the mailbox). The gmail cutover
// fallback was removed 2026-06-11 (Phase 2) after both founders confirmed
// @thoughtseed.space login works. Widening this list is a code change, reviewed.
export const FOUNDER_ALLOWLIST: readonly string[] = [
  "shesh@thoughtseed.space",
  "mohan@thoughtseed.space",
] as const;

export type Principal =
  | { kind: "founder"; email: string }
  | { kind: "agent"; commonName: string; source: "service_token" | "internal_secret" }
  | { kind: "anonymous" };

interface AccessClaims {
  aud?: string | string[];
  iss?: string;
  email?: string;
  common_name?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
}

interface JWKSKey {
  kid: string;
  kty: string;
  alg?: string;
  n: string;
  e: string;
}

// Module-scope JWKS cache. Workers isolates are reused across requests, so this
// avoids re-fetching the certs on every call (RedTeam S-perf; ISC-14).
let jwksCache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 10 * 60 * 1000; // 10 minutes

function base64UrlToUint8Array(input: string): Uint8Array {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const base64 = (input + pad).replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function decodeJwtSegmentJson<T>(segment: string): T {
  const bytes = base64UrlToUint8Array(segment);
  const text = new TextDecoder().decode(bytes);
  return JSON.parse(text) as T;
}

function teamDomain(env: Env): string | null {
  const raw = env.TF_ACCESS_TEAM_DOMAIN?.trim();
  if (!raw) return null;
  return raw.replace(/^https?:\/\//, "").replace(/\/+$/, "");
}

async function importRsaKey(jwk: JWKSKey): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
}

async function loadJwks(env: Env): Promise<Map<string, CryptoKey>> {
  const now = Date.now();
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }

  const domain = teamDomain(env);
  if (!domain) throw new Error("TF_ACCESS_TEAM_DOMAIN not configured");

  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`, {
    cf: { cacheTtl: 600, cacheEverything: true },
  } as RequestInit);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);

  const body = (await res.json()) as { keys?: JWKSKey[] };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of body.keys ?? []) {
    if (jwk.kty !== "RSA" || !jwk.kid) continue;
    try {
      keys.set(jwk.kid, await importRsaKey(jwk));
    } catch {
      // skip unparseable key
    }
  }
  if (keys.size === 0) throw new Error("JWKS contained no usable RSA keys");

  jwksCache = { keys, fetchedAt: now };
  return keys;
}

function audienceMatches(claimAud: string | string[] | undefined, expected: string): boolean {
  if (!claimAud) return false;
  if (Array.isArray(claimAud)) return claimAud.includes(expected);
  return claimAud === expected;
}

/**
 * Verify a raw Access JWT and return its claims, or null if invalid for any
 * reason (signature, aud, iss, time window, structure). Never throws on a bad
 * token — only on misconfiguration surfaced by callers via the thrown path of
 * loadJwks (treated as 503 upstream).
 */
export async function verifyAccessJwt(token: string, env: Env): Promise<AccessClaims | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signatureB64] = parts;

  let header: { alg?: string; kid?: string };
  let claims: AccessClaims;
  try {
    header = decodeJwtSegmentJson<{ alg?: string; kid?: string }>(headerB64);
    claims = decodeJwtSegmentJson<AccessClaims>(payloadB64);
  } catch {
    return null;
  }

  if (header.alg !== "RS256" || !header.kid) return null;

  const expectedAud = env.TF_ACCESS_AUDIENCE;
  if (!expectedAud || !audienceMatches(claims.aud, expectedAud)) return null;

  const domain = teamDomain(env);
  if (!domain) return null;
  if (claims.iss !== `https://${domain}`) return null;

  const nowSec = Math.floor(Date.now() / 1000);
  const skew = 60;
  // exp is mandatory: a token without an expiry must never be treated as valid
  // (defense in depth — Access always mints exp). (sec-review C1)
  if (typeof claims.exp !== "number" || nowSec > claims.exp + skew) return null;
  if (typeof claims.nbf === "number" && nowSec + skew < claims.nbf) return null;

  const keys = await loadJwks(env);
  const key = keys.get(header.kid);
  if (!key) return null;

  const signingInput = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const signature = base64UrlToUint8Array(signatureB64);
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    signature as unknown as BufferSource,
    signingInput as unknown as BufferSource,
  );
  if (!valid) return null;

  return claims;
}

/**
 * Resolve the calling principal for a secrets-route request.
 *
 * Order (fail closed):
 *  1. Valid Access JWT with allowlisted email + no common_name → founder.
 *  2. Valid Access JWT with common_name → agent (service token).
 *  3. Valid X-TeamForge-Internal-Secret header → agent (internal secret).
 *  4. Otherwise → anonymous.
 *
 * Note: presence of common_name forces agent classification even if an email is
 * also present, so a service token can never be promoted to founder (RedTeam S3).
 */
export async function resolvePrincipal(request: Request, env: Env): Promise<Principal> {
  const assertion =
    request.headers.get("cf-access-jwt-assertion") ||
    readAccessCookie(request) ||
    null;

  if (assertion) {
    let claims: AccessClaims | null = null;
    try {
      claims = await verifyAccessJwt(assertion, env);
    } catch {
      // Misconfiguration (e.g. JWKS unreachable or empty during key rotation).
      // Fail closed: do not promote to founder; fall through to other auth /
      // anonymous so the handler returns 401/503 rather than a raw 500.
      // (sec-review M3)
      claims = null;
    }
    if (claims) {
      const commonName = claims.common_name?.trim();
      if (commonName) {
        return { kind: "agent", commonName, source: "service_token" };
      }
      const email = claims.email?.trim().toLowerCase();
      if (email && FOUNDER_ALLOWLIST.includes(email)) {
        // Use the canonical allowlist entry, not the raw claim (RedTeam S4).
        const canonical = FOUNDER_ALLOWLIST[FOUNDER_ALLOWLIST.indexOf(email)];
        return { kind: "founder", email: canonical };
      }
      // Valid token but not a founder and no common_name → treat as anonymous
      // for secrets purposes (no implicit authority from a bare Access login).
    }
  }

  // NOTE (sec-review H2): TF_INTERNAL_SHARED_SECRET is the SAME m2m secret used by
  // other v1 routes (projects/sync/handoffs). Knowing it therefore also grants
  // read on agents/* secrets. This is an accepted, documented conflation while
  // the secret is unset/inactive; if activated for secrets, mint a dedicated
  // secret instead and rotate the two together. Founder/shared scopes are never
  // reachable by this path — agents-read only (enforced in resolveScope).
  const internal = request.headers.get("x-teamforge-internal-secret");
  if (internal && env.TF_INTERNAL_SHARED_SECRET && internal === env.TF_INTERNAL_SHARED_SECRET) {
    return { kind: "agent", commonName: "internal-secret-bridge", source: "internal_secret" };
  }

  return { kind: "anonymous" };
}

function readAccessCookie(request: Request): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === "CF_Authorization") return rest.join("=") || null;
  }
  return null;
}
