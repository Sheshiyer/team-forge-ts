import type { Env } from "../lib/env";
import { execute, nanoid, now, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface OtaRelease {
  id: string;
  channel_id: string;
  version: string;
  platform: string;
  arch: string;
  artifact_url: string;
  signature: string;
  release_notes: string | null;
  pub_date: string;
  rollout_percentage: number;
  is_active: number;
}

interface OtaChannel {
  id: string;
  name: string;
}

function parseTarget(target: string): { platform: string; arch: string } | null {
  const normalized = target.trim().toLowerCase();
  const match = normalized.match(/^([a-z0-9_]+)-([a-z0-9_]+)$/);
  if (!match) return null;

  return { platform: match[1], arch: match[2] };
}

function otaNoUpdate(message: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "x-teamforge-updater-status": message,
    },
  });
}

function otaManifestResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

export async function handleOtaCheck(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const channel = url.searchParams.get("channel") ?? env.TF_DEFAULT_OTA_CHANNEL ?? "stable";
  const target = url.searchParams.get("target");
  const parsedTarget = target ? parseTarget(target) : null;
  const platform = parsedTarget?.platform ?? url.searchParams.get("platform") ?? "darwin";
  const arch = parsedTarget?.arch ?? url.searchParams.get("arch") ?? "aarch64";
  const currentVersion = url.searchParams.get("currentVersion");

  const ch = await queryFirst<OtaChannel>(env.TEAMFORGE_DB, "SELECT id, name FROM ota_channels WHERE name = ? AND is_active = 1", channel);
  if (!ch) {
    return otaNoUpdate(`channel '${channel}' not found or inactive`);
  }

  const release = await queryFirst<OtaRelease>(
    env.TEAMFORGE_DB,
    "SELECT * FROM ota_releases WHERE channel_id = ? AND platform = ? AND arch = ? AND is_active = 1 ORDER BY pub_date DESC LIMIT 1",
    ch.id,
    platform,
    arch,
  );

  if (!release) {
    return otaNoUpdate("no active release for channel/platform/arch");
  }

  // If client is already on this version, no update needed
  if (currentVersion && currentVersion === release.version) {
    return otaNoUpdate("already up to date");
  }

  const targetKey = `${release.platform}-${release.arch}`;

  // Tauri updater manifest (must be top-level; no envelope)
  return otaManifestResponse({
    version: release.version,
    notes: release.release_notes ?? "",
    pub_date: release.pub_date,
    platforms: {
      [targetKey]: {
        url: release.artifact_url,
        signature: release.signature,
      },
    },
  });
}

export async function handleOtaInstallEvent(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  let body: {
    device_id?: string;
    workspace_id?: string;
    channel?: string;
    version_from?: string;
    version_to?: string;
    status?: string;
    error_details?: string;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  if (!body.version_to || !body.status || !body.channel) {
    return jsonError({ code: "missing_fields", message: "version_to, status, and channel are required.", retryable: false }, 400);
  }

  const eventId = nanoid();
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO ota_install_events (id, workspace_id, device_id, channel, version_from, version_to, status, error_details, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    eventId,
    body.workspace_id ?? null,
    body.device_id ?? null,
    body.channel,
    body.version_from ?? null,
    body.version_to,
    body.status,
    body.error_details ?? null,
    now(),
  );

  return jsonOk({ id: eventId, recorded: true });
}
