import type { Env } from "./env";
import { jsonError } from "./response";

/**
 * Verify an HMAC-SHA256 signature on the MultiCA callback body.
 *
 * Wire: caller sets `X-MultiCA-Signature` to lowercase-hex HMAC-SHA256(secret,
 * raw_request_body). Constant-time comparison via Web Crypto's
 * `crypto.subtle.verify` to avoid timing oracles.
 *
 * Returns the raw body string on success so the caller can JSON-parse without
 * re-reading the request stream.
 */
export async function verifyMultiCaCallback(
  request: Request,
  env: Env,
): Promise<{ ok: true; body: string } | { ok: false; response: Response }> {
  const secret = env.MULTICA_CALLBACK_SHARED_SECRET;
  if (!secret) {
    return {
      ok: false,
      response: jsonError(
        {
          code: "server_misconfigured",
          message: "MULTICA_CALLBACK_SHARED_SECRET is not set; callback route is disabled.",
          retryable: false,
        },
        503,
      ),
    };
  }
  const signature = request.headers.get("x-multica-signature");
  if (!signature) {
    return {
      ok: false,
      response: jsonError(
        { code: "missing_signature", message: "X-MultiCA-Signature header required", retryable: false },
        401,
      ),
    };
  }
  const body = await request.text();
  const sigBytes = hexToBytes(signature.trim().toLowerCase());
  if (!sigBytes) {
    return {
      ok: false,
      response: jsonError(
        { code: "invalid_signature", message: "X-MultiCA-Signature must be lowercase hex", retryable: false },
        403,
      ),
    };
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify("HMAC", key, sigBytes, new TextEncoder().encode(body));
  if (!valid) {
    return {
      ok: false,
      response: jsonError(
        { code: "invalid_signature", message: "HMAC signature does not match body", retryable: false },
        403,
      ),
    };
  }
  return { ok: true, body };
}

function hexToBytes(hex: string): Uint8Array | null {
  if (hex.length === 0 || hex.length % 2 !== 0) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) return null;
    out[i] = byte;
  }
  return out;
}
