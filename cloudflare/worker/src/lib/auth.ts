import { jsonError } from "./response";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const [scheme, token] = header.split(" ", 2);
  if (!scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;

  return token.trim() || null;
}

export function requireBearerAuth(
  request: Request,
  expectedToken: string | undefined,
  context: "app" | "credentials" | "internal" | "reporting",
): Response | null {
  if (!expectedToken) {
    return jsonError(
      {
        code: "server_misconfigured",
        message: `Missing secret for ${context} route protection.`,
        retryable: false,
      },
      503,
    );
  }

  const providedToken = readBearerToken(request);
  if (!providedToken) {
    return jsonError(
      {
        code: "missing_authorization",
        message: "Authorization header with Bearer token is required.",
        retryable: false,
      },
      401,
    );
  }

  if (providedToken !== expectedToken) {
    return jsonError(
      {
        code: "invalid_authorization",
        message: "Invalid bearer token.",
        retryable: false,
      },
      403,
    );
  }

  return null;
}

/**
 * Temporary internal shared-secret auth for machine-to-machine calls (parity, Hermes bridge, etc.)
 * when Cloudflare Access service tokens have issues with this Worker route.
 *
 * Caller sends header: X-TeamForge-Internal-Secret: <secret>
 * This is an alternative to the regular app Bearer for routes that normally require requireAppAuth().
 *
 * Security: This must only be used over connections that have already passed the Access policy
 * (e.g. IP bypass on allowed founder machines, or WARP). Do not expose publicly.
 * The secret should be a long random value, rotated as needed.
 */
export function requireInternalAuth(
  request: Request,
  expectedSecret: string | undefined,
): Response | null {
  if (!expectedSecret) {
    // Not configured — fall through to other auth
    return null;
  }

  const provided = request.headers.get("x-teamforge-internal-secret");
  if (!provided) {
    return null; // no internal header — let caller fall back to bearer
  }

  if (provided !== expectedSecret) {
    return jsonError(
      {
        code: "invalid_internal_auth",
        message: "Invalid internal shared secret.",
        retryable: false,
      },
      403,
    );
  }

  return null; // success — internal auth passed
}
