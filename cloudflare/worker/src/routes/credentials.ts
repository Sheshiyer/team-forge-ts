import type { Env } from "../lib/env";
import { requireBearerAuth } from "../lib/auth";
import { jsonError, jsonOk } from "../lib/response";

function mask(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

/**
 * GET /v1/credentials
 *
 * Returns the shared integration credentials stored in Cloudflare secrets.
 * The desktop app calls this on launch to hydrate local settings so every
 * team member gets the same Clockify / Huly / Slack tokens without manual
 * entry in Settings.
 *
 * Query params:
 *   ?audience=<string>  — must match TF_ACCESS_AUDIENCE (default "teamforge-desktop")
 *
 * Headers:
 *   Authorization: Bearer <token> — must match TF_CREDENTIAL_ENVELOPE_KEY
 */
export async function handleGetCredentials(
  env: Env,
  url: URL,
  request: Request,
): Promise<Response> {
  const authFailure = requireBearerAuth(
    request,
    env.TF_CREDENTIAL_ENVELOPE_KEY,
    "credentials",
  );
  if (authFailure) return authFailure;

  const audience = url.searchParams.get("audience");
  const expected = env.TF_ACCESS_AUDIENCE ?? "teamforge-desktop";

  if (audience !== expected) {
    return jsonError(
      {
        code: "invalid_audience",
        message: "Missing or invalid audience parameter.",
        retryable: false,
      },
      403,
    );
  }

  const credentials: Record<string, { available: boolean; token?: string; masked?: string }> = {};

  if (env.TF_CLOCKIFY_API_TOKEN_GLOBAL) {
    credentials.clockify = {
      available: true,
      token: env.TF_CLOCKIFY_API_TOKEN_GLOBAL,
      masked: mask(env.TF_CLOCKIFY_API_TOKEN_GLOBAL),
    };
  } else {
    credentials.clockify = { available: false };
  }

  if (env.TF_HULY_USER_TOKEN_GLOBAL) {
    credentials.huly = {
      available: true,
      token: env.TF_HULY_USER_TOKEN_GLOBAL,
      masked: mask(env.TF_HULY_USER_TOKEN_GLOBAL),
    };
  } else {
    credentials.huly = { available: false };
  }

  if (env.TF_SLACK_BOT_TOKEN_GLOBAL) {
    credentials.slack = {
      available: true,
      token: env.TF_SLACK_BOT_TOKEN_GLOBAL,
      masked: mask(env.TF_SLACK_BOT_TOKEN_GLOBAL),
    };
  } else {
    credentials.slack = { available: false };
  }

  return jsonOk({ credentials });
}
