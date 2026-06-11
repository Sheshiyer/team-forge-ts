import type { Env } from "../lib/env";
import { execute, queryAll, queryFirst, now } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

/**
 * POST /v1/time-entries/backfill-clockify?workspace_id=&from=&to=
 *
 * One-time Clockify → canonical time_entries backfill (Phase 3 cutover).
 * Server-side: uses the global Clockify token + the workspace's
 * clockify_workspace_id, maps each Clockify entry to a canonical
 * employee_id/project_id via *_external_ids, and upserts with a
 * deterministic id (`clockify:<entryId>`) so re-runs are idempotent.
 * Internal-auth (TF_WEBHOOK_HMAC_SECRET) — admin/ops operation.
 */

const CLOCKIFY_API = "https://api.clockify.me/api/v1";
const PAGE_SIZE = 200;
const MAX_PAGES_PER_USER = 100; // safety cap (≤ 20k entries/employee)

interface ClockifyEntry {
  id: string;
  description?: string;
  projectId?: string | null;
  timeInterval?: { start?: string; end?: string | null };
}

export async function handleBackfillClockify(env: Env, request: Request, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }
  const token = env.TF_CLOCKIFY_API_TOKEN_GLOBAL;
  if (!token) {
    return jsonError({ code: "clockify_unconfigured", message: "TF_CLOCKIFY_API_TOKEN_GLOBAL secret is not set.", retryable: false }, 503);
  }

  const wsParam = url.searchParams.get("workspace_id");
  const workspace = wsParam
    ? await queryFirst<{ id: string; clockify_workspace_id: string | null }>(
        env.TEAMFORGE_DB, "SELECT id, clockify_workspace_id FROM workspaces WHERE id = ?", wsParam)
    : await queryFirst<{ id: string; clockify_workspace_id: string | null }>(
        env.TEAMFORGE_DB, "SELECT id, clockify_workspace_id FROM workspaces ORDER BY created_at LIMIT 1");

  if (!workspace) {
    return jsonError({ code: "no_workspace", message: "No workspace found.", retryable: false }, 404);
  }
  if (!workspace.clockify_workspace_id) {
    return jsonError({ code: "no_clockify_workspace", message: "Workspace has no clockify_workspace_id.", retryable: false }, 400);
  }

  const from = url.searchParams.get("from") ?? new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString();
  const to = url.searchParams.get("to") ?? new Date().toISOString();

  // canonical mappings
  const projRows = await queryAll<{ external_id: string; project_id: string }>(
    env.TEAMFORGE_DB, "SELECT external_id, project_id FROM project_external_ids WHERE source = 'clockify'");
  const projectMap = new Map(projRows.map(r => [r.external_id, r.project_id]));

  const empRows = await queryAll<{ clockify_user_id: string; employee_id: string }>(
    env.TEAMFORGE_DB,
    `SELECT eei.external_id AS clockify_user_id, eei.employee_id
       FROM employee_external_ids eei
       JOIN employees e ON e.id = eei.employee_id
      WHERE eei.source = 'clockify' AND e.workspace_id = ? AND e.is_active = 1`,
    workspace.id);

  const ts = now();
  let upserted = 0, skipped = 0;
  const perEmployee: { employeeId: string; upserted: number; error?: string }[] = [];

  for (const emp of empRows) {
    let empUpserted = 0;
    try {
      for (let page = 1; page <= MAX_PAGES_PER_USER; page++) {
        const qs = `start=${encodeURIComponent(from)}&end=${encodeURIComponent(to)}&page=${page}&page-size=${PAGE_SIZE}`;
        const res = await fetch(`${CLOCKIFY_API}/workspaces/${workspace.clockify_workspace_id}/user/${emp.clockify_user_id}/time-entries?${qs}`, {
          headers: { "X-Api-Key": token },
        });
        if (!res.ok) throw new Error(`Clockify ${res.status}`);
        const entries = (await res.json()) as ClockifyEntry[];
        if (!Array.isArray(entries) || entries.length === 0) break;

        for (const e of entries) {
          const start = e.timeInterval?.start;
          const end = e.timeInterval?.end;
          if (!e.id || !start || !end) { skipped++; continue; }
          const duration = Math.max(0, Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 1000));
          const projectId = e.projectId ? projectMap.get(e.projectId) ?? null : null;
          await execute(
            env.TEAMFORGE_DB,
            `INSERT INTO time_entries
               (id, workspace_id, employee_id, project_id, source, description, start_time, end_time, duration_seconds, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'clockify', ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               employee_id = excluded.employee_id, project_id = excluded.project_id,
               description = excluded.description, start_time = excluded.start_time,
               end_time = excluded.end_time, duration_seconds = excluded.duration_seconds,
               updated_at = excluded.updated_at`,
            `clockify:${e.id}`, workspace.id, emp.employee_id, projectId,
            e.description ?? null, start, end, duration, ts, ts);
          empUpserted++;
          upserted++;
        }
        if (entries.length < PAGE_SIZE) break;
      }
      perEmployee.push({ employeeId: emp.employee_id, upserted: empUpserted });
    } catch (err) {
      perEmployee.push({ employeeId: emp.employee_id, upserted: empUpserted, error: err instanceof Error ? err.message : "unknown" });
    }
  }

  return jsonOk({ workspaceId: workspace.id, from, to, employees: empRows.length, upserted, skipped, perEmployee });
}
