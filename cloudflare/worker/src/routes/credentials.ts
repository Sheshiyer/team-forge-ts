import type { Env } from "../lib/env";
import { requireBearerAuth } from "../lib/auth";
import { jsonError, jsonOk } from "../lib/response";

function mask(token: string): string {
  if (token.length <= 8) return "****";
  return token.slice(0, 4) + "****" + token.slice(-4);
}

interface GitHubRepoIntegration {
  repo: string;
  displayName?: string;
  clientName?: string;
  defaultMilestoneNumber?: number;
  hulyProjectId?: string;
  clockifyProjectId?: string;
  enabled?: boolean;
}

interface IntegrationConfig {
  clockify?: {
    workspaceId?: string;
    ignoredEmails?: string[];
    ignoredEmployeeIds?: string[];
  };
  huly?: {
    mirrorMode?: "read_only" | "disabled";
    mirrorEnabled?: boolean;
  };
  slack?: {
    channelFilters?: string[];
    backfillDays?: number;
  };
  github?: {
    repos?: GitHubRepoIntegration[];
  };
}

function parseIntegrationConfig(raw: string | undefined): IntegrationConfig {
  if (!raw?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(raw) as IntegrationConfig;
    if (parsed && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Keep credentials available even when optional integration config is malformed.
  }

  return {};
}

/**
 * GET /v1/credentials
 *
 * Returns shared integration credentials and non-secret integration config.
 * The desktop app calls this on launch to hydrate local settings so every
 * team member gets the same Clockify / Huly / Slack / GitHub setup without
 * page-local display constraints or manual per-machine mapping.
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

  if (env.TF_GITHUB_TOKEN_GLOBAL) {
    credentials.github = {
      available: true,
      token: env.TF_GITHUB_TOKEN_GLOBAL,
      masked: mask(env.TF_GITHUB_TOKEN_GLOBAL),
    };
  } else {
    credentials.github = { available: false };
  }

  return jsonOk({
    credentials,
    integrations: parseIntegrationConfig(env.TF_INTEGRATION_CONFIG_JSON),
  });
}
