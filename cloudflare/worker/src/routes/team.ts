import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

interface Employee {
  id: string;
  workspace_id: string;
  display_name: string;
  email: string | null;
  avatar_url: string | null;
  is_active: number;
  monthly_quota_hours: number;
  created_at: string;
  updated_at: string;
}

interface EmployeeExternalId {
  employee_id: string;
  source: string;
  external_id: string;
}

interface ManualLeave {
  id: string;
  employee_id: string | null;
  leave_type: string;
  starts_on: string;
  ends_on: string;
  notes: string | null;
}

interface ManualHoliday {
  id: string;
  name: string;
  holiday_date: string;
  country_code: string | null;
  notes: string | null;
}

interface SyncCursor {
  source: string;
  cursor_key: string;
  cursor_value: string | null;
  updated_at: string;
}

interface SyncJob {
  id: string;
  status: string;
}

export async function handleGetTeamSnapshot(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  const workspaceId = url.searchParams.get("workspace_id");

  const employees = workspaceId
    ? await queryAll<Employee>(env.TEAMFORGE_DB, "SELECT * FROM employees WHERE workspace_id = ? AND is_active = 1 ORDER BY display_name", workspaceId)
    : await queryAll<Employee>(env.TEAMFORGE_DB, "SELECT * FROM employees WHERE is_active = 1 ORDER BY display_name");

  const employeeIds = employees.map((e) => e.id);

  const externalIds = employeeIds.length
    ? await queryAll<EmployeeExternalId>(
        env.TEAMFORGE_DB,
        `SELECT employee_id, source, external_id FROM employee_external_ids WHERE employee_id IN (${employeeIds.map(() => "?").join(",")})`,
        ...employeeIds,
      )
    : [];

  const extByEmployee = new Map<string, EmployeeExternalId[]>();
  for (const row of externalIds) {
    const list = extByEmployee.get(row.employee_id) ?? [];
    list.push(row);
    extByEmployee.set(row.employee_id, list);
  }

  const leaves = workspaceId
    ? await queryAll<ManualLeave>(env.TEAMFORGE_DB, "SELECT id, employee_id, leave_type, starts_on, ends_on, notes FROM manual_leave_entries WHERE workspace_id = ? ORDER BY starts_on DESC", workspaceId)
    : await queryAll<ManualLeave>(env.TEAMFORGE_DB, "SELECT id, employee_id, leave_type, starts_on, ends_on, notes FROM manual_leave_entries ORDER BY starts_on DESC");

  const holidays = workspaceId
    ? await queryAll<ManualHoliday>(env.TEAMFORGE_DB, "SELECT id, name, holiday_date, country_code, notes FROM manual_holidays WHERE workspace_id = ? ORDER BY holiday_date", workspaceId)
    : await queryAll<ManualHoliday>(env.TEAMFORGE_DB, "SELECT id, name, holiday_date, country_code, notes FROM manual_holidays ORDER BY holiday_date");

  const cursors = workspaceId
    ? await queryAll<SyncCursor>(env.TEAMFORGE_DB, "SELECT source, cursor_key, cursor_value, updated_at FROM sync_cursors WHERE workspace_id = ?", workspaceId)
    : [];

  const lastHulySync = cursors.find((c) => c.source === "huly" && c.cursor_key === "team_snapshot");

  return jsonOk({
    snapshot: {
      generated_at: now(),
      workspace_id: workspaceId ?? null,
      employees: employees.map((e) => ({
        ...e,
        is_active: Boolean(e.is_active),
        external_ids: extByEmployee.get(e.id) ?? [],
      })),
      leave_entries: leaves,
      holidays,
      meta: {
        employee_count: employees.length,
        leave_count: leaves.length,
        holiday_count: holidays.length,
        last_huly_sync: lastHulySync?.updated_at ?? null,
      },
    },
  });
}

export async function handlePostTeamRefresh(env: Env, request: Request): Promise<Response> {
  if (!env.TEAMFORGE_DB) {
    return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);
  }

  let body: { workspace_id?: string; requested_by?: string } = {};
  try {
    body = await request.json();
  } catch {
    // body is optional
  }

  const jobId = nanoid();
  const ts = now();

  await execute(
    env.TEAMFORGE_DB,
    "INSERT INTO sync_jobs (id, workspace_id, source, job_type, status, requested_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    jobId,
    body.workspace_id ?? "global",
    "huly",
    "team_snapshot",
    "queued",
    body.requested_by ?? null,
    ts,
    ts,
  );

  if (env.SYNC_QUEUE) {
    try {
      await env.SYNC_QUEUE.send({
        jobId,
        workspaceId: body.workspace_id ?? "global",
        source: "huly",
        jobType: "team_snapshot",
      });
      await execute(env.TEAMFORGE_DB, "UPDATE sync_jobs SET queue_message_id = ?, updated_at = ? WHERE id = ?", "enqueued", ts, jobId);
    } catch {
      // non-fatal
    }
  }

  const job = await queryFirst<SyncJob>(env.TEAMFORGE_DB, "SELECT id, status FROM sync_jobs WHERE id = ?", jobId);
  return jsonOk({ job }, { status: 202 });
}
