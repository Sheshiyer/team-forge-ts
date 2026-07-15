import { describe, expect, it } from "vitest";
import type { D1DatabaseLike, Env } from "../lib/env";
import worker from "../index";
import { handleGetWeeklyReportingContext } from "./reporting";

interface ReportingRows {
  projects?: Record<string, unknown>;
  client_profiles?: Record<string, unknown>;
  employees?: Record<string, unknown>;
  time_entries?: Record<string, unknown>;
}

interface BoundQuery {
  sql: string;
  values: unknown[];
}

function makeReportingDb(rows: ReportingRows, error?: Error): {
  db: D1DatabaseLike;
  queries: BoundQuery[];
} {
  const queries: BoundQuery[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          queries.push({ sql, values });
          return {
            bind() {
              return this;
            },
            async first<T>() {
              if (error) throw error;
              const table = (Object.keys(rows) as Array<keyof ReportingRows>)
                .find((candidate) => sql.includes(`FROM ${candidate}`));
              return (table ? rows[table] : null) as T | null;
            },
            async run() {
              return { success: true };
            },
            async all<T>() {
              return { results: [] as T[] };
            },
          };
        },
        async first<T>() {
          if (error) throw error;
          return null as T | null;
        },
        async run() {
          return { success: true };
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
    },
  } as unknown as D1DatabaseLike;

  return { db, queries };
}

function request(query = "", token = "reporting-secret"): Request {
  return new Request(`https://forge.example/v1/reporting/weekly-context${query}`, {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function env(db: D1DatabaseLike, overrides: Partial<Env> = {}): Env {
  return {
    TF_ENV: "test",
    TF_REPORTING_READ_TOKEN: "reporting-secret",
    TF_REPORTING_WORKSPACE_ID: "configured-workspace",
    TEAMFORGE_DB: db,
    ...overrides,
  };
}

async function body(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

function epoch(timestamp: string): number {
  return Math.trunc(Date.parse(timestamp) / 1_000);
}

describe("GET /v1/reporting/weekly-context", () => {
  it("returns 401 for a missing dedicated bearer", async () => {
    const mock = makeReportingDb({});
    const req = request("", "");
    const response = await handleGetWeeklyReportingContext(req, env(mock.db), new URL(req.url));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await body(response)).error.code).toBe("missing_authorization");
    expect(mock.queries).toHaveLength(0);
  });

  it("returns 403 for the wrong dedicated bearer", async () => {
    const mock = makeReportingDb({});
    const req = request("", "wrong-secret");
    const response = await handleGetWeeklyReportingContext(req, env(mock.db), new URL(req.url));

    expect(response.status).toBe(403);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await body(response)).error.code).toBe("invalid_authorization");
    expect(mock.queries).toHaveLength(0);
  });

  it("routes through the Worker and returns 503 when the dedicated secret is missing", async () => {
    const mock = makeReportingDb({});
    const req = request();
    const response = await worker.fetch(
      req,
      env(mock.db, { TF_REPORTING_READ_TOKEN: undefined }),
    );

    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect((await body(response)).error.code).toBe("server_misconfigured");
    expect(mock.queries).toHaveLength(0);
  });

  it("routes a valid dedicated bearer to the bounded reporting handler", async () => {
    const mock = makeReportingDb({});
    const req = request();
    const response = await worker.fetch(req, env(mock.db));
    const payload = await body(response);

    expect(response.status).toBe(200);
    expect(payload.data.schemaVersion).toBe("teamforge.weekly-context.v1");
    expect(payload.data.freshness.status).toBe("no_signal");
    expect(mock.queries).toHaveLength(4);
  });

  it("returns 503 when the server reporting workspace is missing", async () => {
    const mock = makeReportingDb({});
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db, { TF_REPORTING_WORKSPACE_ID: "" }),
      new URL(req.url),
    );

    expect(response.status).toBe(503);
    expect((await body(response)).error.code).toBe("reporting_workspace_not_configured");
    expect(mock.queries).toHaveLength(0);
  });

  it.each(["?workspace_id=attacker", "?workspaceId=attacker"])(
    "rejects caller workspace override %s before querying",
    async (query) => {
      const mock = makeReportingDb({});
      const req = request(query);
      const response = await handleGetWeeklyReportingContext(req, env(mock.db), new URL(req.url));

      expect(response.status).toBe(400);
      expect((await body(response)).error.code).toBe("workspace_override_forbidden");
      expect(mock.queries).toHaveLength(0);
    },
  );

  it("returns the bounded v1 schema and scopes every query to the configured workspace", async () => {
    const mock = makeReportingDb({
      projects: {
        total: 23,
        active: 17,
        completed: 3,
        archived: 1,
        latest_epoch: epoch("2026-07-14T12:00:00.000Z"),
        recent_count: 4,
      },
      client_profiles: {
        total: 9,
        active: 9,
        latest_epoch: epoch("2026-07-02T12:00:00.000Z"),
        recent_count: 0,
      },
      employees: {
        total: 7,
        active: 6,
        latest_epoch: epoch("2026-07-13T12:00:00.000Z"),
        recent_count: 1,
      },
      time_entries: {
        total: 1414,
        total_duration_seconds: 720000,
        latest_epoch: epoch("2026-07-05T12:00:00.000Z"),
        recent_count: 0,
        recent_duration_seconds: 0,
      },
    });
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db),
      new URL(req.url),
      new Date("2026-07-15T12:00:00.000Z"),
    );
    const payload = await body(response);

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(payload).toEqual({
      ok: true,
      data: {
        schemaVersion: "teamforge.weekly-context.v1",
        generatedAt: "2026-07-15T12:00:00.000Z",
        window: {
          days: 7,
          startsAt: "2026-07-08T12:00:00.000Z",
          endsAt: "2026-07-15T12:00:00.000Z",
        },
        projects: {
          total: 23,
          active: 17,
          completed: 3,
          archived: 1,
          other: 2,
          updatedLast7Days: 4,
        },
        clients: {
          total: 9,
          active: 9,
          inactive: 0,
          updatedLast7Days: 0,
        },
        kpis: {
          employees: { total: 7, active: 6 },
          timeEntries: {
            totalHistorical: 1414,
            totalLast7Days: 0,
            durationSecondsHistorical: 720000,
            durationSecondsLast7Days: 0,
          },
        },
        freshness: {
          status: "mixed",
          latestHistoricalAt: "2026-07-14T12:00:00.000Z",
          signalsLast7Days: 5,
          sources: [
            { source: "projects", status: "fresh", latestHistoricalAt: "2026-07-14T12:00:00.000Z", signalsLast7Days: 4 },
            { source: "clients", status: "stale", latestHistoricalAt: "2026-07-02T12:00:00.000Z", signalsLast7Days: 0 },
            { source: "employees", status: "fresh", latestHistoricalAt: "2026-07-13T12:00:00.000Z", signalsLast7Days: 1 },
            { source: "time_entries", status: "stale", latestHistoricalAt: "2026-07-05T12:00:00.000Z", signalsLast7Days: 0 },
          ],
        },
      },
    });

    expect(mock.queries).toHaveLength(4);
    expect(mock.queries.every(({ values }) => values.at(-1) === "configured-workspace")).toBe(true);
    expect(mock.queries.every(({ sql }) => sql.includes("unixepoch("))).toBe(true);
    expect(mock.queries.every(({ sql }) => sql.includes("<= unixepoch(?)"))).toBe(true);
    expect(mock.queries.every(({ values }) => values.includes("2026-07-08T12:00:00.000Z"))).toBe(true);
    expect(mock.queries.every(({ values }) => values.includes("2026-07-15T12:00:00.000Z"))).toBe(true);
    expect(JSON.stringify(payload)).not.toMatch(/workspace|email|name|external|credential/i);
  });

  it("reports fresh only when every required source is fresh", async () => {
    const fresh = {
      total: 2,
      active: 2,
      completed: 0,
      archived: 0,
      total_duration_seconds: 600,
      latest_epoch: epoch("2026-07-14T00:00:00.000Z"),
      recent_count: 2,
      recent_duration_seconds: 600,
    };
    const mock = makeReportingDb({
      projects: fresh,
      client_profiles: fresh,
      employees: fresh,
      time_entries: fresh,
    });
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db),
      new URL(req.url),
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const payload = await body(response);

    expect(payload.data.freshness.status).toBe("fresh");
    expect(payload.data.freshness.sources.every(({ status }: { status: string }) => status === "fresh")).toBe(true);
  });

  it("reports mixed when a required source has no signal", async () => {
    const fresh = {
      total: 1,
      active: 1,
      completed: 0,
      archived: 0,
      total_duration_seconds: 60,
      latest_epoch: epoch("2026-07-14T00:00:00.000Z"),
      recent_count: 1,
      recent_duration_seconds: 60,
    };
    const mock = makeReportingDb({
      projects: fresh,
      client_profiles: { ...fresh, total: 0, active: 0, latest_epoch: null, recent_count: 0 },
      employees: fresh,
      time_entries: fresh,
    });
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db),
      new URL(req.url),
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const payload = await body(response);

    expect(payload.data.freshness.status).toBe("mixed");
    expect(payload.data.freshness.sources[1]).toEqual({
      source: "clients",
      status: "no_signal",
      latestHistoricalAt: null,
      signalsLast7Days: 0,
    });
  });

  it("normalizes offsets and refuses future or invalid latest timestamps", async () => {
    const mock = makeReportingDb({
      projects: {
        total: 1,
        active: 1,
        completed: 0,
        archived: 0,
        latest_epoch: epoch("2026-07-15T00:01:00.000Z"),
        recent_count: 0,
      },
      client_profiles: {
        total: 1,
        active: 1,
        latest_epoch: "invalid-epoch",
        recent_count: 0,
      },
      employees: {
        total: 1,
        active: 1,
        latest_epoch: epoch("2026-07-15T05:30:00+05:30"),
        recent_count: 1,
      },
      time_entries: {
        total: 1,
        total_duration_seconds: 60,
        latest_epoch: epoch("2026-06-01T00:00:00.000Z"),
        recent_count: 0,
        recent_duration_seconds: 0,
      },
    });
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db),
      new URL(req.url),
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const payload = await body(response);

    expect(payload.data.freshness.status).toBe("mixed");
    expect(payload.data.freshness.sources).toEqual([
      { source: "projects", status: "no_signal", latestHistoricalAt: null, signalsLast7Days: 0 },
      { source: "clients", status: "no_signal", latestHistoricalAt: null, signalsLast7Days: 0 },
      { source: "employees", status: "fresh", latestHistoricalAt: "2026-07-15T00:00:00.000Z", signalsLast7Days: 1 },
      { source: "time_entries", status: "stale", latestHistoricalAt: "2026-06-01T00:00:00.000Z", signalsLast7Days: 0 },
    ]);
  });

  it("labels latest historical data as stale when the seven-day window is empty", async () => {
    const stale = {
      total: 1,
      active: 1,
      completed: 0,
      archived: 0,
      total_duration_seconds: 60,
      latest_epoch: epoch("2026-06-01T00:00:00.000Z"),
      recent_count: 0,
      recent_duration_seconds: 0,
    };
    const mock = makeReportingDb({
      projects: stale,
      client_profiles: stale,
      employees: stale,
      time_entries: stale,
    });
    const req = request();
    const response = await handleGetWeeklyReportingContext(
      req,
      env(mock.db),
      new URL(req.url),
      new Date("2026-07-15T00:00:00.000Z"),
    );
    const payload = await body(response);

    expect(payload.data.freshness.status).toBe("stale");
    expect(payload.data.freshness.latestHistoricalAt).toBe("2026-06-01T00:00:00.000Z");
    expect(payload.data.freshness.signalsLast7Days).toBe(0);
  });

  it("returns a safe 503 when aggregate queries fail", async () => {
    const mock = makeReportingDb({}, new Error("sensitive database detail"));
    const req = request();
    const response = await handleGetWeeklyReportingContext(req, env(mock.db), new URL(req.url));
    const payload = await body(response);

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("reporting_source_unavailable");
    expect(JSON.stringify(payload)).not.toContain("sensitive database detail");
  });
});
