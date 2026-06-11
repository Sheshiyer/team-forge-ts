import type { Env } from "./env";

/**
 * Cloudflare Access JWT validation (Phase 4 / zero-trust).
 *
 * Validates the `Cf-Access-Jwt-Assertion` header (or `CF_Authorization`
 * cookie) against the Access application's JWKS using Web Crypto — no
 * external dependency. Returns the verified identity or null.
 *
 * Returns null (and is therefore a no-op) when TF_ACCESS_TEAM_DOMAIN /
 * TF_ACCESS_AUD are unset — so this can ship before the Access app exists
 * without breaking the interim bearer-token path.
 */

export interface AccessIdentity {
  email: string;
}

interface Jwk {
  kid: string;
  [k: string]: unknown;
}

let jwksCache: { domain: string; keys: Jwk[]; fetchedAt: number } | null = null;

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  let t = s.replace(/-/g, "+").replace(/_/g, "/");
  while (t.length % 4) t += "=";
  const bin = atob(t);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodeSegment(seg: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(b64urlToBytes(seg)));
}

function readCookie(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    if (part.slice(0, idx).trim() === name) return part.slice(idx + 1).trim();
  }
  return null;
}

async function getJwks(domain: string): Promise<Jwk[]> {
  if (jwksCache && jwksCache.domain === domain && Date.now() - jwksCache.fetchedAt < 3_600_000) {
    return jwksCache.keys;
  }
  const res = await fetch(`https://${domain}/cdn-cgi/access/certs`);
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const data = (await res.json()) as { keys?: Jwk[] };
  jwksCache = { domain, keys: data.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

export async function verifyAccessJwt(request: Request, env: Env): Promise<AccessIdentity | null> {
  const domain = env.TF_ACCESS_TEAM_DOMAIN;
  const aud = env.TF_ACCESS_AUD;
  if (!domain || !aud) return null; // Access not configured → skip (bearer fallback)

  const token = request.headers.get("cf-access-jwt-assertion") ?? readCookie(request, "CF_Authorization");
  if (!token) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;

  try {
    const header = decodeSegment(parts[0]) as { kid?: string; alg?: string };
    const payload = decodeSegment(parts[1]) as {
      exp?: number; iss?: string; aud?: string | string[]; email?: string; identity?: string;
    };

    const nowSec = Math.floor(Date.now() / 1000);
    if (typeof payload.exp === "number" && payload.exp < nowSec) return null;
    if (payload.iss && payload.iss !== `https://${domain}`) return null;
    const auds = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
    if (!auds.includes(aud)) return null;

    const keys = await getJwks(domain);
    const jwk = keys.find((k) => k.kid === header.kid);
    if (!jwk) return null;

    const key = await crypto.subtle.importKey(
      "jwk",
      jwk as JsonWebKey,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const ok = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      b64urlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
    if (!ok) return null;

    const email = payload.email ?? payload.identity;
    if (!email) return null;
    return { email: String(email).toLowerCase() };
  } catch {
    return null;
  }
}
