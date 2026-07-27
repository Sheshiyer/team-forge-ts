import { describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env, QueueBatchLike, QueueMessageLike } from "./env";
import {
  SYNC_JOB_SCHEMA_VERSION,
  handleSyncQueueBatch,
  parseSyncJobMessage,
  type TeamForgeSyncJobMessage,
} from "./sync-queue";
import { handlePostSyncJob } from "../routes/sync";

interface JobRow {
  id: string;
  workspace_id: string;
  project_id: string;
  source: string;
  job_type: string;
  status: string;
}

function messageBody(overrides: Partial<TeamForgeSyncJobMessage> = {}): TeamForgeSyncJobMessage {
  return {
    schema: SYNC_JOB_SCHEMA_VERSION,
    jobId: "job_123",
    workspaceId: "workspace_123",
    projectId: "project_123",
    source: "github",
    jobType: "project_sync",
    requestedAt: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

function fakeMessage(
  body: unknown,
  overrides: Partial<QueueMessageLike<unknown>> = {},
): QueueMessageLike<unknown> & { acked: boolean; retried: boolean } {
  return {
    id: "message_123",
    body,
    attempts: 1,
    acked: false,
    retried: false,
    ack() {
      this.acked = true;
    },
    retry() {
      this.retried = true;
    },
    ...overrides,
  };
}

function fakeBatch(message: QueueMessageLike<unknown>): QueueBatchLike<unknown> {
  return { queue: "teamforge-sync", messages: [message] };
}

function makeQueueDb(initialJob?: Partial<JobRow>) {
  const jobs = new Map<string, JobRow>();
  const runs = new Map<string, Record<string, unknown>>();
  const receipts = new Map<string, Record<string, unknown>>();
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  if (initialJob) {
    const row: JobRow = {
      id: "job_123",
      workspace_id: "workspace_123",
      project_id: "project_123",
      source: "github",
      job_type: "project_sync",
      status: "queued",
      ...initialJob,
    };
    jobs.set(row.id, row);
  }

  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          calls.push({ sql, values });
          return {
            async first<T>() {
              if (sql.includes("FROM sync_jobs")) {
                return (jobs.get(values[0] as string) ?? null) as T | null;
              }
              if (sql.includes("FROM sync_runtime_receipts")) {
                return (Array.from(receipts.values())[0] ?? null) as T | null;
              }
              return null;
            },
            async all<T>() {
              return { results: [] as T[] };
            },
            async run() {
              if (sql.includes("UPDATE sync_jobs") && sql.includes("status = 'running'")) {
                const id = values[values.length - 1] as string;
                const job = jobs.get(id);
                if (!job || job.status !== "queued") {
                  return { success: true, meta: { changes: 0 } };
                }
                job.status = "running";
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO sync_runs")) {
                runs.set(values[0] as string, {
                  id: values[0],
                  status: values[4],
                  error_code: null,
                  error_message: null,
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("UPDATE sync_jobs")) {
                const id = values[values.length - 1] as string;
                const job = jobs.get(id);
                if (job) job.status = values[0] as string;
                return { success: true, meta: { changes: job ? 1 : 0 } };
              }
              if (sql.includes("UPDATE sync_runs")) {
                const id = values[values.length - 1] as string;
                const run = runs.get(id);
                if (run) {
                  run.status = values[0];
                  if (sql.includes("error_code")) {
                    run.error_code = values[1];
                    run.error_message = values[2];
                  }
                }
                return { success: true, meta: { changes: run ? 1 : 0 } };
              }
              if (sql.includes("sync_runtime_receipts")) {
                receipts.set(values[1] as string, {
                  schema_version: values[0],
                  runtime_id: values[1],
                  last_message_id: values[2],
                  last_job_id: values[3],
                  last_status: values[4],
                  last_consumed_at: values[5],
                  last_terminal_at: values[6],
                  updated_at: values[7],
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("INSERT INTO sync_jobs")) {
                const row: JobRow = {
                  id: values[0] as string,
                  workspace_id: values[1] as string,
                  project_id: values[2] as string,
                  source: values[3] as string,
                  job_type: values[4] as string,
                  status: values[5] as string,
                };
                jobs.set(row.id, row);
                return { success: true, meta: { changes: 1 } };
              }
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  } as unknown as D1DatabaseLike;

  return { db, jobs, runs, receipts, calls };
}

function env(db: D1DatabaseLike): Env {
  return { TF_ENV: "test", TEAMFORGE_DB: db };
}

describe("teamforge.sync-job.v1", () => {
  it("accepts only the frozen bounded message", () => {
    const message = parseSyncJobMessage(messageBody());
    expect(message).toEqual(messageBody());
    expect(Object.keys(message ?? {}).sort()).toEqual([
      "schema",
      "jobId",
      "workspaceId",
      "source",
      "jobType",
      "projectId",
      "requestedAt",
    ].sort());
    expect(parseSyncJobMessage(messageBody({ jobType: "team_snapshot" as "project_sync" }))).toBeNull();
    expect(parseSyncJobMessage(messageBody({ source: "internal" as "github" }))).toBeNull();
    expect(parseSyncJobMessage(messageBody({ projectId: "x".repeat(129) }))).toBeNull();
    expect(parseSyncJobMessage(messageBody({ workspaceId: " " }))).toBeNull();
    expect(parseSyncJobMessage(messageBody({ requestedAt: "yesterday" }))).toBeNull();
  });

  it("producer requires project_id and sends exactly the frozen message", async () => {
    const mock = makeQueueDb();
    const send = vi.fn(async () => undefined);
    const producerEnv: Env = { ...env(mock.db), SYNC_QUEUE: { send } };
    const missing = await handlePostSyncJob(
      producerEnv,
      new Request("https://forge.example/v1/sync/jobs", {
        method: "POST",
        body: JSON.stringify({ workspace_id: "workspace_123", source: "github" }),
      }),
    );
    expect(missing.status).toBe(400);
    expect(send).not.toHaveBeenCalled();

    const response = await handlePostSyncJob(
      producerEnv,
      new Request("https://forge.example/v1/sync/jobs", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: "workspace_123",
          project_id: "project_123",
          source: "github",
          job_type: "project_sync",
          payload: { token: "must-not-be-queued" },
        }),
      }),
    );
    expect(response.status).toBe(202);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toEqual({
      schema: SYNC_JOB_SCHEMA_VERSION,
      jobId: expect.any(String),
      workspaceId: "workspace_123",
      projectId: "project_123",
      source: "github",
      jobType: "project_sync",
      requestedAt: expect.stringMatching(/Z$/),
    });
  });
});

describe("sync queue consumer", () => {
  it("fails closed before D1 and adapters for an unknown source", async () => {
    const mock = makeQueueDb({ status: "queued" });
    const queueMessage = fakeMessage(messageBody({ source: "unknown" as "github" }));
    const runAdapter = vi.fn(async () => ({}));

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), { runAdapter });

    expect(mock.calls).toHaveLength(0);
    expect(runAdapter).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retried).toBe(false);
  });

  it("acks an already completed job without rerunning it", async () => {
    const mock = makeQueueDb({ status: "completed" });
    const queueMessage = fakeMessage(messageBody());
    const runAdapter = vi.fn(async () => ({}));

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), { runAdapter });

    expect(runAdapter).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retried).toBe(false);
  });

  it("atomically claims queued work and persists completed run and receipt", async () => {
    const mock = makeQueueDb({ status: "queued" });
    const queueMessage = fakeMessage(messageBody());
    const runAdapter = vi.fn(async () => ({
      updatedMappings: 2,
      token: "must-not-be-persisted",
    }));

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });

    expect(mock.calls.some(
      ({ sql }) => sql.includes("status = 'running'") && sql.includes("status = 'queued'"),
    )).toBe(true);
    expect(runAdapter).toHaveBeenCalledTimes(1);
    expect(mock.jobs.get("job_123")?.status).toBe("completed");
    expect(Array.from(mock.runs.values())[0]?.status).toBe("completed");
    expect(JSON.stringify(mock.calls.flatMap(({ values }) => values)))
      .not.toContain("must-not-be-persisted");
    expect(mock.receipts.get("runtime_test")).toMatchObject({
      schema_version: "teamforge.sync-runtime-receipt.v1",
      runtime_id: "runtime_test",
      last_message_id: "message_123",
      last_job_id: "job_123",
      last_status: "completed",
    });
    expect(queueMessage.acked).toBe(true);
  });

  it("persists bounded non-secret failure evidence before retry", async () => {
    const mock = makeQueueDb({ status: "queued" });
    const queueMessage = fakeMessage(messageBody());
    const runAdapter = vi.fn(async () => {
      throw new Error("Bearer super-secret-token external body " + "x".repeat(2_000));
    });

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });

    const persistedValues = JSON.stringify(mock.calls.flatMap(({ values }) => values));
    expect(persistedValues).not.toContain("super-secret-token");
    expect(persistedValues).not.toContain("external body");
    expect(Array.from(mock.runs.values())[0]).toMatchObject({
      status: "failed",
      error_code: "sync_adapter_failed",
    });
    expect(mock.receipts.get("runtime_test")?.last_status).toBe("failed");
    expect(queueMessage.retried).toBe(true);
    expect(queueMessage.acked).toBe(false);
  });

  it("marks exhausted work failed before its final retry reaches the DLQ", async () => {
    const mock = makeQueueDb({ status: "queued" });
    const queueMessage = fakeMessage(messageBody(), { attempts: 4 });

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), {
      runAdapter: async () => {
        throw new Error("adapter failure");
      },
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });

    expect(mock.jobs.get("job_123")?.status).toBe("failed");
    expect(mock.receipts.get("runtime_test")?.last_status).toBe("failed");
    expect(queueMessage.retried).toBe(true);
  });
});
