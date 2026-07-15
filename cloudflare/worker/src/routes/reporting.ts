import type { D1DatabaseLike, Env } from "../lib/env";
import { queryFirst } from "../lib/db";
import { requireReportingBearerAuth } from "../lib/reporting-auth";
import { jsonError, jsonOk } from "../lib/response";

const WINDOW_DAYS = 7;
const WINDOW_MS = WINDOW_DAYS * 24 * 60 * 60 * 1_000;

interface ProjectAggregateRow {
  total: number | string | null;
  active: number | string | null;
  completed: number | string | null;
  archived: number | string | null;
  latest_epoch: number | string | null;
  recent_count: number | string | null;
}

interface ClientAggregateRow {
  total: number | string | null;
  active: number | string | null;
  latest_epoch: number | string | null;
  recent_count: number | string | null;
}

interface EmployeeAggregateRow {
  total: number | string | null;
  active: number | string | null;
  latest_epoch: number | string | null;
  recent_count: number | string | null;
}

interface TimeAggregateRow {
  total: number | string | null;
  total_duration_seconds: number | string | null;
  latest_epoch: number | string | null;
  recent_count: number | string | null;
  recent_duration_seconds: number | string | null;
}

type SourceFreshnessStatus = "fresh" | "stale" | "no_signal";
type OverallFreshnessStatus = SourceFreshnessStatus | "mixed";

interface FreshnessSource {
  source: "projects" | "clients" | "employees" | "time_entries";
  status: SourceFreshnessStatus;
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

function timestampFromEpoch(value: number | string | null | undefined, generatedAtMs: number): string | null {
  if (value === null || value === undefined || value === "") return null;
  const epochSeconds = Number(value);
  if (!Number.isFinite(epochSeconds)) return null;

  const timestampMs = Math.trunc(epochSeconds) * 1_000;
  if (!Number.isFinite(timestampMs) || timestampMs > generatedAtMs) return null;

  const timestamp = new Date(timestampMs);
  return Number.isFinite(timestamp.getTime()) ? timestamp.toISOString() : null;
}

function sourceFreshness(
  source: FreshnessSource["source"],
  latestEpoch: number | string | null | undefined,
  signalsLast7Days: number,
  windowStartsAtMs: number,
  generatedAtMs: number,
): FreshnessSource {
  const latestHistoricalAt = timestampFromEpoch(latestEpoch, generatedAtMs);
  const status: SourceFreshnessStatus = latestHistoricalAt === null
    ? "no_signal"
    : Date.parse(latestHistoricalAt) >= windowStartsAtMs
      ? "fresh"
      : "stale";

  return {
    source,
    status,
    latestHistoricalAt,
    signalsLast7Days,
  };
}

function overallFreshness(sources: FreshnessSource[]): OverallFreshnessStatus {
  const states = new Set(sources.map((source) => source.status));
  if (states.size !== 1) return "mixed";
  return sources[0]?.status ?? "no_signal";
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
  generatedAt: string,
) {
  const [projects, clients, employees, timeEntries] = await Promise.all([
    queryFirst<ProjectAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'active' THEN 1 ELSE 0 END), 0) AS active,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'completed' THEN 1 ELSE 0 END), 0) AS completed,
         COALESCE(SUM(CASE WHEN LOWER(status) = 'archived' THEN 1 ELSE 0 END), 0) AS archived,
         MAX(CASE
           WHEN unixepoch(updated_at) <= unixepoch(?) THEN unixepoch(updated_at)
         END) AS latest_epoch,
         COALESCE(SUM(CASE
           WHEN unixepoch(updated_at) >= unixepoch(?)
             AND unixepoch(updated_at) <= unixepoch(?) THEN 1 ELSE 0
         END), 0) AS recent_count
       FROM projects
       WHERE workspace_id = ?`,
      generatedAt,
      windowStartsAt,
      generatedAt,
      workspaceId,
    ),
    queryFirst<ClientAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN active = 1 THEN 1 ELSE 0 END), 0) AS active,
         MAX(CASE
           WHEN unixepoch(updated_at) <= unixepoch(?) THEN unixepoch(updated_at)
         END) AS latest_epoch,
         COALESCE(SUM(CASE
           WHEN unixepoch(updated_at) >= unixepoch(?)
             AND unixepoch(updated_at) <= unixepoch(?) THEN 1 ELSE 0
         END), 0) AS recent_count
       FROM client_profiles
       WHERE workspace_id = ?`,
      generatedAt,
      windowStartsAt,
      generatedAt,
      workspaceId,
    ),
    queryFirst<EmployeeAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END), 0) AS active,
         MAX(CASE
           WHEN unixepoch(updated_at) <= unixepoch(?) THEN unixepoch(updated_at)
         END) AS latest_epoch,
         COALESCE(SUM(CASE
           WHEN unixepoch(updated_at) >= unixepoch(?)
             AND unixepoch(updated_at) <= unixepoch(?) THEN 1 ELSE 0
         END), 0) AS recent_count
       FROM employees
       WHERE workspace_id = ?`,
      generatedAt,
      windowStartsAt,
      generatedAt,
      workspaceId,
    ),
    queryFirst<TimeAggregateRow>(
      db,
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds,
         MAX(CASE
           WHEN unixepoch(start_time) <= unixepoch(?) THEN unixepoch(start_time)
         END) AS latest_epoch,
         COALESCE(SUM(CASE
           WHEN unixepoch(start_time) >= unixepoch(?)
             AND unixepoch(start_time) <= unixepoch(?) THEN 1 ELSE 0
         END), 0) AS recent_count,
         COALESCE(SUM(CASE
           WHEN unixepoch(start_time) >= unixepoch(?)
             AND unixepoch(start_time) <= unixepoch(?) THEN duration_seconds ELSE 0
         END), 0) AS recent_duration_seconds
       FROM time_entries
       WHERE workspace_id = ?`,
      generatedAt,
      windowStartsAt,
      generatedAt,
      windowStartsAt,
      generatedAt,
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
  const authFailure = await requireReportingBearerAuth(request, env.TF_REPORTING_READ_TOKEN);
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
  const generatedAtMs = now.getTime();
  const windowStartsAtMs = generatedAtMs - WINDOW_MS;
  const windowStartsAt = new Date(windowStartsAtMs).toISOString();

  try {
    const aggregates = await queryWeeklyAggregates(env.TEAMFORGE_DB, workspaceId, windowStartsAt, generatedAt);
    const projectTotal = count(aggregates.projects?.total);
    const projectActive = count(aggregates.projects?.active);
    const projectCompleted = count(aggregates.projects?.completed);
    const projectArchived = count(aggregates.projects?.archived);
    const clientTotal = count(aggregates.clients?.total);
    const clientActive = count(aggregates.clients?.active);

    const sources: FreshnessSource[] = [
      sourceFreshness("projects", aggregates.projects?.latest_epoch, count(aggregates.projects?.recent_count), windowStartsAtMs, generatedAtMs),
      sourceFreshness("clients", aggregates.clients?.latest_epoch, count(aggregates.clients?.recent_count), windowStartsAtMs, generatedAtMs),
      sourceFreshness("employees", aggregates.employees?.latest_epoch, count(aggregates.employees?.recent_count), windowStartsAtMs, generatedAtMs),
      sourceFreshness("time_entries", aggregates.timeEntries?.latest_epoch, count(aggregates.timeEntries?.recent_count), windowStartsAtMs, generatedAtMs),
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
        status: overallFreshness(sources),
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
