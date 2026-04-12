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
  context: "credentials" | "internal",
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
