import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface SyncJob {
  id: string;
  workspace_id: string;
  source: string;
  job_type: string;
  status: string;
  payload_json: string | null;
  requested_by: string | null;
  queue_message_id: string | null;
  created_at: string;
  updated_at: string;
  started_at: string | null;
  finished_at: string | null;
}

interface SyncRun {
  id: string;
  workspace_id: string;
  source: string;
  job_id: string | null;
  status: string;
  stats_json: string | null;
  error_code: string | null;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
  created_at: string;
}

export async function handlePostSyncJob(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  let body: { workspace_id?: string; source?: string; job_type?: string; requested_by?: string; payload?: unknown };
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "invalid_json", message: "Request body must be valid JSON.", retryable: false }, 400);
  }

  if (!body.workspace_id || !body.source || !body.job_type) {
    return jsonError({ code: "missing_fields", message: "workspace_id, source, and job_type are required.", retryable: false }, 400);
  }

  const validSources = ["clockify", "github", "huly", "slack"];
  if (!validSources.includes(body.source)) {
    return jsonError({ code: "invalid_source", message: `source must be one of: ${validSources.join(", ")}`, retryable: false }, 400);
  }

  const jobId = nanoid();
  const ts = now();

  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO sync_jobs (id, workspace_id, source, job_type, status, payload_json, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    jobId,
    body.workspace_id,
    body.source,
    body.job_type,
    "queued",
    body.payload ? JSON.stringify(body.payload) : null,
    body.requested_by ?? null,
    ts,
    ts,
  );

  if (env.SYNC_QUEUE) {
    try {
      await env.SYNC_QUEUE.send({
        jobId,
        workspaceId: body.workspace_id,
        source: body.source as "clockify" | "github" | "huly" | "slack",
        jobType: body.job_type,
      });
      await execute(env.TEAMFORGE_DB, "UPDATE sync_jobs SET queue_message_id = ?, updated_at = ? WHERE id = ?", "enqueued", ts, jobId);
    } catch {
      // queue send failure is non-fatal — job is still recorded
    }
  }

  const job = await queryFirst<SyncJob>(env.TEAMFORGE_DB, "SELECT * FROM sync_jobs WHERE id = ?", jobId);
  return jsonOk({ job }, { status: 202 });
}

export async function handleGetSyncJob(env: Env, jobId: string): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const job = await queryFirst<SyncJob>(env.TEAMFORGE_DB, "SELECT * FROM sync_jobs WHERE id = ?", jobId);
  if (!job) return jsonError({ code: "not_found", message: `Sync job ${jobId} not found.`, retryable: false }, 404);

  return jsonOk({ job });
}

export async function handleGetSyncRuns(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const workspaceId = url.searchParams.get("workspace_id");
  const source = url.searchParams.get("source");
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "50", 10), 200);

  let sql = "SELECT * FROM sync_runs";
  const params: unknown[] = [];
  const conditions: string[] = [];

  if (workspaceId) { conditions.push("workspace_id = ?"); params.push(workspaceId); }
  if (source) { conditions.push("source = ?"); params.push(source); }
  if (conditions.length) sql += ` WHERE ${conditions.join(" AND ")}`;
  sql += " ORDER BY started_at DESC LIMIT ?";
  params.push(limit);

  const runs = await queryAll<SyncRun>(env.TEAMFORGE_DB, sql, ...params);
  return jsonOk({ runs, total: runs.length });
}
