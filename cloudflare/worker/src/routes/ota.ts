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

export async function handleOtaCheck(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const channel = url.searchParams.get("channel") ?? env.TF_DEFAULT_OTA_CHANNEL ?? "stable";
  const platform = url.searchParams.get("platform") ?? "darwin";
  const arch = url.searchParams.get("arch") ?? "aarch64";
  const currentVersion = url.searchParams.get("currentVersion");

  const ch = await queryFirst<OtaChannel>(env.TEAMFORGE_DB, "SELECT id, name FROM ota_channels WHERE name = ? AND is_active = 1", channel);
  if (!ch) {
    return jsonOk({ update: null, message: `Channel '${channel}' not found or inactive.` });
  }

  const release = await queryFirst<OtaRelease>(
    env.TEAMFORGE_DB,
    "SELECT * FROM ota_releases WHERE channel_id = ? AND platform = ? AND arch = ? AND is_active = 1 ORDER BY pub_date DESC LIMIT 1",
    ch.id,
    platform,
    arch,
  );

  if (!release) {
    return jsonOk({ update: null, message: "No active release found for this channel/platform/arch." });
  }

  // If client is already on this version, no update needed
  if (currentVersion && currentVersion === release.version) {
    return jsonOk({ update: null, message: "Already up to date." });
  }

  // Tauri-compatible updater manifest
  return jsonOk({
    version: release.version,
    notes: release.release_notes ?? "",
    pub_date: release.pub_date,
    platforms: {
      [`${platform}-${arch}`]: {
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
