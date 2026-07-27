import { describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env, QueueBatchLike, QueueMessageLike } from "./env";
import {
  SYNC_JOB_SCHEMA_VERSION,
  handleSyncQueueBatch,
  parseSyncJobMessage,
  type TeamForgeSyncJobMessage,
} from "./sync-queue";
import { handlePostSyncJob } from "../routes/sync";
import { handlePostTeamRefresh } from "../routes/team";

interface JobRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
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

function makeQueueDb(
  initialJob?: Partial<JobRow>,
  options: {
    failSyncRunInsert?: boolean;
    failCompletedJobUpdateOnce?: boolean;
  } = {},
) {
  const jobs = new Map<string, JobRow>();
  const runs = new Map<string, Record<string, unknown>>();
  const receipts = new Map<string, Record<string, unknown>>();
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  let completedJobUpdateFailures = 0;
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
              if (options.failSyncRunInsert && sql.includes("INSERT INTO sync_runs")) {
                throw new Error("deterministic sync_runs insert failure");
              }
              if (sql.includes("UPDATE sync_jobs") && sql.includes("status = 'running'")) {
                const id = values[values.length - 1] as string;
                const job = jobs.get(id);
                if (!job || job.status !== "queued") {
                  return { success: true, meta: { changes: 0 } };
                }
                job.status = "running";
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("INTO sync_runs")) {
                const hasFailureEvidence = sql.includes("error_code");
                runs.set(values[0] as string, {
                  id: values[0],
                  status: values[4],
                  error_code: hasFailureEvidence ? values[5] : null,
                  error_message: hasFailureEvidence ? values[6] : null,
                });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.includes("queue_message_id")) {
                const job = jobs.get(values[values.length - 1] as string);
                return { success: true, meta: { changes: job ? 1 : 0 } };
              }
              if (sql.includes("UPDATE sync_jobs")) {
                const id = values[values.length - 1] as string;
                const job = jobs.get(id);
                if (
                  options.failCompletedJobUpdateOnce
                  && values[0] === "completed"
                  && completedJobUpdateFailures === 0
                ) {
                  completedJobUpdateFailures += 1;
                  throw new Error("deterministic completion write failure");
                }
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
                const hasProjectId = sql.includes("project_id");
                const row: JobRow = {
                  id: values[0] as string,
                  workspace_id: values[1] as string,
                  project_id: hasProjectId ? values[2] as string : null,
                  source: values[hasProjectId ? 3 : 2] as string,
                  job_type: values[hasProjectId ? 4 : 3] as string,
                  status: values[hasProjectId ? 5 : 4] as string,
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

  it("fails terminally when the Queue binding is missing", async () => {
    const mock = makeQueueDb();
    const response = await handlePostSyncJob(
      env(mock.db),
      new Request("https://forge.example/v1/sync/jobs", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: "workspace_123",
          project_id: "project_123",
          source: "github",
        }),
      }),
    );
    const payload = await response.json() as { error: { code: string } };

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("sync_queue_unavailable");
    expect(Array.from(mock.jobs.values())[0]?.status).toBe("failed");
    expect(Array.from(mock.runs.values())[0]).toMatchObject({
      status: "failed",
      error_code: "sync_queue_unavailable",
    });
  });

  it("persists bounded terminal evidence when Queue send rejects", async () => {
    const mock = makeQueueDb();
    const response = await handlePostSyncJob(
      {
        ...env(mock.db),
        SYNC_QUEUE: {
          async send() {
            throw new Error("Bearer producer-secret external body");
          },
        },
      },
      new Request("https://forge.example/v1/sync/jobs", {
        method: "POST",
        body: JSON.stringify({
          workspace_id: "workspace_123",
          project_id: "project_123",
          source: "github",
        }),
      }),
    );
    const persistedValues = JSON.stringify(mock.calls.flatMap(({ values }) => values));

    expect(response.status).toBe(503);
    expect(Array.from(mock.jobs.values())[0]?.status).toBe("failed");
    expect(Array.from(mock.runs.values())[0]).toMatchObject({
      status: "failed",
      error_code: "sync_queue_send_failed",
    });
    expect(persistedValues).not.toContain("producer-secret");
    expect(persistedValues).not.toContain("external body");
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

  it("rejects a source array before D1 and adapters", async () => {
    const mock = makeQueueDb({ status: "queued" });
    const queueMessage = fakeMessage(messageBody({
      source: ["github"] as unknown as "github",
    }));
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

  it("recovers a claimed job when sync run insertion fails", async () => {
    const mock = makeQueueDb(
      { status: "queued" },
      { failSyncRunInsert: true },
    );
    const queueMessage = fakeMessage(messageBody());
    const runAdapter = vi.fn(async () => ({}));

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });

    expect(runAdapter).not.toHaveBeenCalled();
    expect(mock.jobs.get("job_123")?.status).toBe("queued");
    expect(mock.receipts.get("runtime_test")?.last_status).toBe("failed");
    expect(queueMessage.retried).toBe(true);
    expect(queueMessage.acked).toBe(false);
  });

  it("does not rerun an adapter after a completion persistence failure", async () => {
    const mock = makeQueueDb(
      { status: "queued" },
      { failCompletedJobUpdateOnce: true },
    );
    const runAdapter = vi.fn(async () => ({ updatedMappings: 1 }));
    const firstDelivery = fakeMessage(messageBody());

    await handleSyncQueueBatch(fakeBatch(firstDelivery), env(mock.db), {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });
    expect(firstDelivery.retried).toBe(true);
    expect(mock.jobs.get("job_123")?.status).toBe("failed");
    expect(Array.from(mock.runs.values())[0]).toMatchObject({
      status: "failed",
      error_code: "sync_completion_persistence_failed",
    });

    const redelivery = fakeMessage(messageBody(), {
      id: "message_124",
      attempts: 2,
    });
    await handleSyncQueueBatch(fakeBatch(redelivery), env(mock.db), {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:02:00.000Z"),
    });

    expect(runAdapter).toHaveBeenCalledTimes(1);
    expect(redelivery.acked).toBe(true);
    expect(redelivery.retried).toBe(false);
  });

  it("terminally rejects the exact legacy team refresh message without an adapter", async () => {
    const mock = makeQueueDb();
    let producedMessage: unknown;
    const producerEnv: Env = {
      ...env(mock.db),
      SYNC_QUEUE: {
        async send(message) {
          producedMessage = message;
        },
      },
    };
    const response = await handlePostTeamRefresh(
      producerEnv,
      new Request("https://forge.example/v1/team/refresh", {
        method: "POST",
        body: JSON.stringify({ workspace_id: "workspace_123" }),
      }),
    );
    expect(response.status).toBe(202);
    expect(producedMessage).toEqual({
      jobId: expect.any(String),
      workspaceId: "workspace_123",
      source: "huly",
      jobType: "team_snapshot",
    });

    const queueMessage = fakeMessage(producedMessage);
    const runAdapter = vi.fn(async () => ({}));
    await handleSyncQueueBatch(fakeBatch(queueMessage), producerEnv, {
      runAdapter,
      runtimeId: "runtime_test",
      now: () => new Date("2026-07-28T10:01:00.000Z"),
    });

    expect(runAdapter).not.toHaveBeenCalled();
    expect(Array.from(mock.jobs.values())[0]?.status).toBe("failed");
    expect(Array.from(mock.runs.values())[0]).toMatchObject({
      status: "failed",
      error_code: "job_type_unsupported",
    });
    expect(mock.receipts.get("runtime_test")?.last_status).toBe("rejected");
    expect(queueMessage.acked).toBe(true);
    expect(queueMessage.retried).toBe(false);
  });

  it("acks malformed legacy refresh shapes before D1", async () => {
    const mock = makeQueueDb();
    const queueMessage = fakeMessage({
      jobId: "job_123",
      workspaceId: "workspace_123",
      source: ["huly"],
      jobType: "team_snapshot",
    });
    const runAdapter = vi.fn(async () => ({}));

    await handleSyncQueueBatch(fakeBatch(queueMessage), env(mock.db), { runAdapter });

    expect(mock.calls).toHaveLength(0);
    expect(runAdapter).not.toHaveBeenCalled();
    expect(queueMessage.acked).toBe(true);
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
