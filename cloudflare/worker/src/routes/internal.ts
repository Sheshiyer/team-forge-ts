import type { Env } from "../lib/env";
import { execute, nanoid, now, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface SyncJob {
  id: string;
  workspace_id: string;
  source: string;
  job_type: string;
  status: string;
}

// Shared handler for all vendor sync callbacks
async function handleSyncCallback(
  env: Env,
  source: "clockify" | "huly" | "slack",
  request: Request,
): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: { jobId?: string; workspaceId?: string; jobType?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body may be empty for queue-triggered callbacks
  }

  const jobId = body.jobId;
  const workspaceId = body.workspaceId ?? "global";
  const jobType = body.jobType ?? "full_sync";

  // Mark job as running if we have a job ID
  if (jobId) {
    const job = await queryFirst<SyncJob>(env.TEAMFORGE_DB, "SELECT * FROM sync_jobs WHERE id = ?", jobId);
    if (job) {
      await execute(
        env.TEAMFORGE_DB,
        "UPDATE sync_jobs SET status = ?, started_at = ?, updated_at = ? WHERE id = ?",
        "running",
        now(),
        now(),
        jobId,
      );
    }
  }

  const runId = nanoid();
  const startedAt = now();

  // Record the run start
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO sync_runs (id, workspace_id, source, job_id, status, started_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    runId,
    workspaceId,
    source,
    jobId ?? null,
    "running",
    startedAt,
    startedAt,
  );

  // Update sync cursor to track last run
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO sync_cursors (id, workspace_id, source, cursor_key, cursor_value, updated_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(workspace_id, source, cursor_key) DO UPDATE SET cursor_value = excluded.cursor_value, updated_at = excluded.updated_at",
    nanoid(),
    workspaceId,
    source,
    jobType,
    startedAt,
    startedAt,
  );

  // Mark run complete
  const finishedAt = now();
  await execute(
    env.TEAMFORGE_DB,
    "UPDATE sync_runs SET status = ?, finished_at = ?, stats_json = ? WHERE id = ?",
    "completed",
    finishedAt,
    JSON.stringify({ job_type: jobType, triggered_at: startedAt }),
    runId,
  );

  // Mark job complete
  if (jobId) {
    await execute(
      env.TEAMFORGE_DB,
      "UPDATE sync_jobs SET status = ?, finished_at = ?, updated_at = ? WHERE id = ?",
      "completed",
      finishedAt,
      finishedAt,
      jobId,
    );
  }

  return jsonOk({ run_id: runId, source, job_type: jobType, status: "completed" });
}

async function handleReconcileProjects(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: { workspace_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    // optional
  }

  const runId = nanoid();
  const ts = now();

  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO sync_runs (id, workspace_id, source, status, started_at, finished_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    runId,
    body.workspace_id ?? "global",
    "internal",
    "completed",
    ts,
    ts,
    ts,
  );

  return jsonOk({ run_id: runId, type: "reconcile_projects", status: "completed" });
}

async function handleReleasesPublish(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: {
    version?: string;
    channel?: string;
    platform?: string;
    arch?: string;
    artifact_url?: string;
    signature?: string;
    release_notes?: string;
    pub_date?: string;
    rollout_percentage?: number;
  };
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  const required = ["version", "channel", "platform", "arch", "artifact_url", "signature"] as const;
  for (const field of required) {
    if (!body[field]) {
      return jsonError({ code: "missing_fields", message: `${field} is required.`, retryable: false }, 400);
    }
  }

  // Resolve channel ID
  const channel = await queryFirst<{ id: string }>(
    env.TEAMFORGE_DB,
    "SELECT id FROM ota_channels WHERE name = ? AND is_active = 1",
    body.channel!,
  );
  if (!channel) {
    return jsonError({ code: "channel_not_found", message: `OTA channel '${body.channel}' not found.`, retryable: false }, 404);
  }

  const releaseId = nanoid();
  const ts = now();

  await execute(
    env.TEAMFORGE_DB,
    `INSERT INTO ota_releases (id, channel_id, version, platform, arch, artifact_url, signature, release_notes, pub_date, rollout_percentage, is_active, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(channel_id, version, platform, arch) DO UPDATE SET
       artifact_url = excluded.artifact_url,
       signature = excluded.signature,
       release_notes = excluded.release_notes,
       pub_date = excluded.pub_date,
       rollout_percentage = excluded.rollout_percentage,
       is_active = excluded.is_active,
       updated_at = excluded.updated_at`,
    releaseId,
    channel.id,
    body.version!,
    body.platform!,
    body.arch!,
    body.artifact_url!,
    body.signature!,
    body.release_notes ?? null,
    body.pub_date ?? ts,
    body.rollout_percentage ?? 100,
    1,
    ts,
    ts,
  );

  // Audit log
  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO audit_events (id, workspace_id, actor_type, actor_id, event_type, target_type, target_id, metadata_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    nanoid(),
    null,
    "ci",
    "github-actions",
    "ota.release.publish",
    "ota_release",
    releaseId,
    JSON.stringify({ version: body.version, channel: body.channel, platform: body.platform, arch: body.arch }),
    ts,
  );

  return jsonOk({ release_id: releaseId, version: body.version, channel: body.channel, status: "published" }, { status: 201 });
}

export async function handleInternalRequest(request: Request, url: URL, env?: Env): Promise<Response> {
  if (!env) {
    return jsonError({ code: "env_unavailable", message: "Environment not available.", retryable: false }, 500);
  }

  const { method, pathname } = { method: request.method, pathname: url.pathname };

  if (method === "POST" && pathname === "/internal/sync/clockify") return handleSyncCallback(env, "clockify", request);
  if (method === "POST" && pathname === "/internal/sync/huly") return handleSyncCallback(env, "huly", request);
  if (method === "POST" && pathname === "/internal/sync/slack") return handleSyncCallback(env, "slack", request);
  if (method === "POST" && pathname === "/internal/reconcile/projects") return handleReconcileProjects(env, request);
  if (method === "POST" && pathname === "/internal/releases/publish") return handleReleasesPublish(env, request);

  return jsonError({ code: "route_not_found", message: `No internal route for ${method} ${pathname}.`, retryable: false }, 404);
}
