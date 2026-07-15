import type { D1DatabaseLike, Env } from "../lib/env";
import { requireBearerAuth } from "../lib/auth";
import { queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1_000;

interface ProjectAggregateRow {
  total: number | string | null;
  active: number | string | null;
  completed: number | string | null;
  archived: number | string | null;
  latest_at: string | null;
  recent_count: number | string | null;
}

interface ClientAggregateRow {
  total: number | string | null;
  active: number | string | null;
  latest_at: string | null;
  recent_count: number | string | null;
}

interface EmployeeAggregateRow {
  total: number | string | null;
  active: number | string | null;
  latest_at: string | null;
  recent_count: number | string | null;
}

interface TimeAggregateRow {
  total: number | string | null;
  total_duration_seconds: number | string | null;
  latest_at: string | null;
  recent_count: number | string | null;
  recent_duration_seconds: number | string | null;
}

type FreshnessStatus = "fresh" | "stale" | "no_signal";

interface FreshnessSource {
  source: "projects" | "clients" | "employees" | "time_entries";
  status: FreshnessStatus;
  latestHistoricalAt: string | null;
  signalsLast7Days: number;
}

function count(value: number | string | null | undefined): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function noStore(response: Response): Response {
  response.headers.set("cache-control", "no-store");
  return response;
}

function sourceFreshness(
  source: FreshnessSource["source"],
  latestHistoricalAt: string | null,
  signalsLast7Days: number,
  windowStartsAt: string,
): FreshnessSource {
  const status: FreshnessStatus = latestHistoricalAt === null
    ? "no_signal"
    : latestHistoricalAt >= windowStartsAt
      ? "fresh"
      : "stale";

  return {
    source,
    status,
    latestHistoricalAt,
    signalsLast7Days,
  };
}

function latestTimestamp(sources: FreshnessSource[]): string | null {
  const timestamps = sources
    .map((source) => source.latestHistoricalAt)
    .filter((timestamp): timestamp is string => timestamp !== null)
    .sort();
  return timestamps.at(-1) ?? null;
}

async function queryWeeklyAggregates(
  db: D1DatabaseLike,
  workspaceId: string,
  windowStartsAt: string,
) {
  const [projects, clients, employees, timeEntries] = await Promise.all([
    queryFirst<ProjectAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'active' THEN 1 ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'archived' THEN 1 ELSE 0 END), 0) AS archived,
         MAX(updated_at) AS latest_at,
         COALESCE(SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END), 0) AS recent_count
       FROM projects
       WHERE workspace_id = ?`,
      windowStartsAt,
      workspaceId,
    ),
    queryFirst<ClientAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active,
         MAX(updated_at) AS latest_at,
         COALESCE(SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END), 0) AS recent_count
       FROM client_profiles
       WHERE workspace_id = ?`,
      windowStartsAt,
      workspaceId,
    ),
    queryFirst<EmployeeAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active,
         MAX(updated_at) AS latest_at,
         COALESCE(SUM(CASE WHEN updated_at >= ? THEN 1 ELSE 0 END), 0) AS recent_count
       FROM employees
       WHERE workspace_id = ?`,
      windowStartsAt,
      workspaceId,
    ),
    queryFirst<TimeAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
         MAX(COALESCE(end_time, start_time, updated_at, created_at)) AS latest_at,
         COALESCE(SUM(CASE WHEN start_time >= ? THEN 1 ELSE 0 END), 0) AS recent_count,
         COALESCE(SUM(CASE WHEN start_time >= ? THEN duration_seconds ELSE 0 END), 0) AS recent_duration_seconds
       FROM time_entries
       WHERE workspace_id = ?`,
      windowStartsAt,
      windowStartsAt,
      workspaceId,
    ),
  ]);

  return { projects, clients, employees, timeEntries };
}

export async function handleGetWeeklyReportingContext(
  request: Request,
  env: Env,
  url: URL,
  now = new Date(),
): Promise<Response> {
  const authFailure = requireBearerAuth(request, env.TF_REPORTING_READ_TOKEN, "reporting");
  if (authFailure) return noStore(authFailure);

  if (url.searchParams.has("workspace_id") || url.searchParams.has("workspaceId")) {
    return noStore(jsonError(
      {
        code: "workspace_override_forbidden",
        message: "The reporting workspace is configured by the server and cannot be overridden.",
        retryable: false,
      },
      400,
    ));
  }

  const workspaceId = env.TF_REPORTING_WORKSPACE_ID?.trim();
  if (!workspaceId) {
    return noStore(jsonError(
      {
        code: "reporting_workspace_not_configured",
        message: "The reporting workspace is not configured.",
        retryable: false,
      },
      503,
    ));
  }

  if (!env.TEAMFORGE_DB) {
    return noStore(jsonError(
      {
        code: "reporting_source_unavailable",
        message: "The reporting source is unavailable.",
        retryable: true,
      },
      503,
    ));
  }

  const generatedAt = now.toISOString();
  const windowStartsAt = new Date(now.getTime() - WINDOW_MS).toISOString();

  try {
    const aggregates = await queryWeeklyAggregates(env.TEAMFORGE_DB, workspaceId, windowStartsAt);
    const projectTotal = count(aggregates.projects?.total);
    const projectActive = count(aggregates.projects?.active);
    const projectCompleted = count(aggregates.projects?.completed);
    const projectArchived = count(aggregates.projects?.archived);
    const clientTotal = count(aggregates.clients?.total);
    const clientActive = count(aggregates.clients?.active);

    const sources: FreshnessSource[] = [
      sourceFreshness("projects", aggregates.projects?.latest_at ?? null, count(aggregates.projects?.recent_count), windowStartsAt),
      sourceFreshness("clients", aggregates.clients?.latest_at ?? null, count(aggregates.clients?.recent_count), windowStartsAt),
      sourceFreshness("employees", aggregates.employees?.latest_at ?? null, count(aggregates.employees?.recent_count), windowStartsAt),
      sourceFreshness("time_entries", aggregates.timeEntries?.latest_at ?? null, count(aggregates.timeEntries?.recent_count), windowStartsAt),
    ];
    const latestHistoricalAt = latestTimestamp(sources);
    const signalsLast7Days = sources.reduce((total, source) => total + source.signalsLast7Days, 0);

    return noStore(jsonOk({
      schemaVersion: "teamforge.weekly-context.v1",
      generatedAt,
      window: {
        days: WINDOW_DAYS,
        startsAt: windowStartsAt,
        endsAt: generatedAt,
      },
      projects: {
        total: projectTotal,
        active: projectActive,
        completed: projectCompleted,
        archived: projectArchived,
        other: Math.max(0, projectTotal - projectActive - projectCompleted - projectArchived),
        updatedLast7Days: count(aggregates.projects?.recent_count),
      },
      clients: {
        total: clientTotal,
        active: clientActive,
        inactive: Math.max(0, clientTotal - clientActive),
        updatedLast7Days: count(aggregates.clients?.recent_count),
      },
      kpis: {
        employees: {
          total: count(aggregates.employees?.total),
          active: count(aggregates.employees?.active),
        },
        timeEntries: {
          totalHistorical: count(aggregates.timeEntries?.total),
          totalLast7Days: count(aggregates.timeEntries?.recent_count),
          durationSecondsHistorical: count(aggregates.timeEntries?.total_duration_seconds),
          durationSecondsLast7Days: count(aggregates.timeEntries?.recent_duration_seconds),
        },
      },
      freshness: {
        status: latestHistoricalAt === null ? "no_signal" : latestHistoricalAt >= windowStartsAt ? "fresh" : "stale",
        latestHistoricalAt,
        signalsLast7Days,
        sources,
      },
    }));
  } catch {
    return noStore(jsonError(
      {
        code: "reporting_source_unavailable",
        message: "The reporting source could not be summarized.",
        retryable: true,
      },
      503,
    ));
  }
}
