import type { Env } from "../lib/env";
import { execute, queryAll, now } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface TimeEntryInput {
  id: string;
  employeeId?: string | null;
  projectId?: string | null;
  source?: string;
  description?: string | null;
  startTime: string;
  endTime?: string | null;
  durationSeconds?: number;
}

/**
 * POST /v1/time-entries — idempotent bulk upsert of employee time entries.
 * Body: { workspaceId, entries: TimeEntryInput[] }. Upsert keyed on entry id
 * (client-generated UUID) so re-sends are safe. App-auth (bearer).
 */
export async function handlePostTimeEntries(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }
  let body: { workspaceId?: string; workspace_id?: string; entries?: TimeEntryInput[] };
  try {
    body = await request.json();
  } catch {
    return jsonError({ code: "bad_request", message: "Invalid JSON body.", retryable: false }, 400);
  }

  const workspaceId = (body.workspaceId ?? body.workspace_id ?? "").trim();
  if (!workspaceId) {
    return jsonError({ code: "missing_workspace", message: "workspaceId is required.", retryable: false }, 400);
  }
  const entries = Array.isArray(body.entries) ? body.entries : [];
  const ts = now();
  let upserted = 0;

  for (const e of entries) {
    if (!e || !e.id || !e.startTime) continue;
    await execute(
      env.TEAMFORGE_DB,
      `INSERT INTO time_entries
         (id, workspace_id, employee_id, project_id, source, description, start_time, end_time, duration_seconds, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         employee_id = excluded.employee_id,
         project_id = excluded.project_id,
         source = excluded.source,
         description = excluded.description,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         duration_seconds = excluded.duration_seconds,
         updated_at = excluded.updated_at`,
      e.id,
      workspaceId,
      e.employeeId ?? null,
      e.projectId ?? null,
      e.source ?? "plexus",
      e.description ?? null,
      e.startTime,
      e.endTime ?? null,
      e.durationSeconds ?? 0,
      ts,
      ts,
    );
    upserted++;
  }

  return jsonOk({ upserted });
}

/**
 * GET /v1/time-entries?workspace_id=&employee_id=&from=&to= — read back entries.
 */
export async function handleGetTimeEntries(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }
  const workspaceId = url.searchParams.get("workspace_id");
  const employeeId = url.searchParams.get("employee_id");
  const from = url.searchParams.get("from") ?? "1970-01-01";
  const to = url.searchParams.get("to") ?? "2999-12-31";

  const clauses = ["start_time >= ?", "start_time <= ?"];
  const params: unknown[] = [from, to];
  if (workspaceId) {
    clauses.push("workspace_id = ?");
    params.push(workspaceId);
  }
  if (employeeId) {
    clauses.push("employee_id = ?");
    params.push(employeeId);
  }

  const entries = await queryAll(
    env.TEAMFORGE_DB,
    `SELECT * FROM time_entries WHERE ${clauses.join(" AND ")} ORDER BY start_time DESC LIMIT 1000`,
    ...params,
  );
  return jsonOk({ entries });
}
