import { jsonError } from "./response";

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;

  const match = header.match(/^Bearer[\t ]+([^\s]+)[\t ]*$/i);
  return match?.[1] ?? null;
}

async function sha256(value: string): Promise<Uint8Array> {
  const input = new TextEncoder().encode(value);
  return new Uint8Array(await crypto.subtle.digest("SHA-256", input));
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  const comparedLength = Math.max(left.length, right.length);
  let mismatch = left.length ^ right.length;

  for (let index = 0; index < comparedLength; index += 1) {
    mismatch |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return mismatch === 0;
}

/**
 * Dedicated verifier for the reporting machine boundary.
 *
 * Hashing both inputs before a fixed-length byte comparison prevents the
 * reporting route from inheriting the early-exit string comparison used by
 * legacy app routes. Missing configuration and missing credentials still fail
 * before hashing because neither case compares attacker-controlled secrets.
 */
export async function requireReportingBearerAuth(
  request: Request,
  expectedToken: string | undefined,
): Promise<Response | null> {
  if (!expectedToken) {
    return jsonError(
      {
        code: "server_misconfigured",
        message: "Missing secret for reporting route protection.",
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

  const [providedDigest, expectedDigest] = await Promise.all([
    sha256(providedToken),
    sha256(expectedToken),
  ]);
  if (!constantTimeEqual(providedDigest, expectedDigest)) {
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
