import { nanoid } from "./db";
import type {
  D1DatabaseLike,
  Env,
  QueueBatchLike,
  QueueMessageLike,
  SyncJobMessage,
} from "./env";
import { runQueuedProjectSync } from "./sync-control-plane";

export const SYNC_JOB_SCHEMA_VERSION = "teamforge.sync-job.v1" as const;
export const SYNC_RUNTIME_RECEIPT_SCHEMA_VERSION =
  "teamforge.sync-runtime-receipt.v1" as const;
export const SYNC_QUEUE_RUNTIME_ID = "teamforge-sync-consumer" as const;

const IDENTIFIER_MAX_BYTES = 128;
const MAX_QUEUE_ATTEMPTS = 4;

export type TeamForgeSyncJobMessage = SyncJobMessage;
export type SyncRuntimeStatus = "completed" | "failed" | "rejected";

interface SyncJobRow {
  id: string;
  workspace_id: string;
  project_id: string | null;
  source: string;
  job_type: string;
  status: string;
}

export interface SyncQueueDependencies {
  runAdapter?: (
    env: Env,
    message: TeamForgeSyncJobMessage,
    runId: string,
  ) => Promise<Record<string, unknown>>;
  now?: () => Date;
  runtimeId?: string;
}

function utf8Length(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function isBoundedIdentifier(value: unknown): value is string {
  return typeof value === "string"
    && value.trim().length > 0
    && value.trim() === value
    && utf8Length(value) <= IDENTIFIER_MAX_BYTES;
}

function isCanonicalTimestamp(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const milliseconds = Date.parse(value);
  return Number.isFinite(milliseconds)
    && new Date(milliseconds).toISOString() === value;
}

export function parseSyncJobMessage(input: unknown): TeamForgeSyncJobMessage | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  const expectedKeys = [
    "schema",
    "jobId",
    "workspaceId",
    "projectId",
    "source",
    "jobType",
    "requestedAt",
  ];
  if (
    Object.keys(candidate).length !== expectedKeys.length
    || expectedKeys.some((key) => !(key in candidate))
  ) {
    return null;
  }
  if (candidate.schema !== SYNC_JOB_SCHEMA_VERSION) return null;
  if (!isBoundedIdentifier(candidate.jobId)) return null;
  if (!isBoundedIdentifier(candidate.workspaceId)) return null;
  if (!isBoundedIdentifier(candidate.projectId)) return null;
  if (!["clockify", "github", "huly", "slack"].includes(String(candidate.source))) {
    return null;
  }
  if (candidate.jobType !== "project_sync") return null;
  if (!isCanonicalTimestamp(candidate.requestedAt)) return null;
  return candidate as unknown as TeamForgeSyncJobMessage;
}

function terminalTimestamp(clock: () => Date): string {
  return clock().toISOString();
}

function boundedRunStats(stats: Record<string, unknown>): Record<string, number> {
  const allowedKeys = [
    "updatedMappings",
    "conflictsOpened",
    "journalCompleted",
    "journalFailed",
  ] as const;
  const bounded: Record<string, number> = {};
  for (const key of allowedKeys) {
    const value = stats[key];
    if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
      bounded[key] = value;
    }
  }
  return bounded;
}

async function readJob(
  db: D1DatabaseLike,
  jobId: string,
): Promise<SyncJobRow | null> {
  return db.prepare(
    `SELECT id, workspace_id, project_id, source, job_type, status
     FROM sync_jobs
     WHERE id = ?`,
  ).bind(jobId).first<SyncJobRow>();
}

async function writeReceipt(
  db: D1DatabaseLike,
  runtimeId: string,
  queueMessageId: string,
  jobId: string,
  status: SyncRuntimeStatus,
  consumedAt: string,
  terminalAt: string,
): Promise<void> {
  await db.prepare(
    `INSERT INTO sync_runtime_receipts
      (schema_version, runtime_id, last_message_id, last_job_id, last_status,
       last_consumed_at, last_terminal_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(runtime_id) DO UPDATE SET
       schema_version = excluded.schema_version,
       last_message_id = excluded.last_message_id,
       last_job_id = excluded.last_job_id,
       last_status = excluded.last_status,
       last_consumed_at = excluded.last_consumed_at,
       last_terminal_at = excluded.last_terminal_at,
       updated_at = excluded.updated_at`,
  ).bind(
    SYNC_RUNTIME_RECEIPT_SCHEMA_VERSION,
    runtimeId,
    queueMessageId,
    jobId,
    status,
    consumedAt,
    terminalAt,
    terminalAt,
  ).run();
}

function jobMatchesMessage(
  job: SyncJobRow,
  message: TeamForgeSyncJobMessage,
): boolean {
  return job.workspace_id === message.workspaceId
    && job.project_id === message.projectId
    && job.source === message.source
    && job.job_type === message.jobType;
}

async function rejectMessage(
  db: D1DatabaseLike,
  queueMessage: QueueMessageLike<unknown>,
  message: TeamForgeSyncJobMessage,
  runtimeId: string,
  consumedAt: string,
  clock: () => Date,
): Promise<void> {
  const finishedAt = terminalTimestamp(clock);
  await writeReceipt(
    db,
    runtimeId,
    queueMessage.id,
    message.jobId,
    "rejected",
    consumedAt,
    finishedAt,
  );
  queueMessage.ack();
}

async function processMessage(
  queueMessage: QueueMessageLike<unknown>,
  env: Env,
  dependencies: SyncQueueDependencies,
): Promise<void> {
  // The envelope is untrusted. Validate it completely before touching D1 or
  // selecting a source adapter.
  const message = parseSyncJobMessage(queueMessage.body);
  if (!message) {
    queueMessage.ack();
    return;
  }

  const db = env.TEAMFORGE_DB;
  if (!db) {
    queueMessage.retry();
    return;
  }

  const clock = dependencies.now ?? (() => new Date());
  const runtimeId = dependencies.runtimeId ?? SYNC_QUEUE_RUNTIME_ID;
  const consumedAt = terminalTimestamp(clock);
  const job = await readJob(db, message.jobId);
  if (!job || !jobMatchesMessage(job, message)) {
    await rejectMessage(
      db,
      queueMessage,
      message,
      runtimeId,
      consumedAt,
      clock,
    );
    return;
  }

  if (job.status === "completed") {
    const finishedAt = terminalTimestamp(clock);
    await writeReceipt(
      db,
      runtimeId,
      queueMessage.id,
      message.jobId,
      "completed",
      consumedAt,
      finishedAt,
    );
    queueMessage.ack();
    return;
  }
  if (job.status !== "queued") {
    queueMessage.retry();
    return;
  }

  const startedAt = terminalTimestamp(clock);
  const claim = await db.prepare(
    `UPDATE sync_jobs
     SET status = 'running', started_at = COALESCE(started_at, ?), updated_at = ?
     WHERE id = ? AND status = 'queued'`,
  ).bind(startedAt, startedAt, message.jobId).run();
  if ((claim.meta?.changes ?? 0) !== 1) {
    const racedJob = await readJob(db, message.jobId);
    if (racedJob?.status === "completed") {
      const finishedAt = terminalTimestamp(clock);
      await writeReceipt(
        db,
        runtimeId,
        queueMessage.id,
        message.jobId,
        "completed",
        consumedAt,
        finishedAt,
      );
      queueMessage.ack();
    } else {
      queueMessage.retry();
    }
    return;
  }

  const runId = nanoid();
  await db.prepare(
    `INSERT INTO sync_runs
      (id, workspace_id, source, job_id, status, started_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).bind(
    runId,
    message.workspaceId,
    message.source,
    message.jobId,
    "running",
    startedAt,
    startedAt,
  ).run();

  try {
    const runAdapter = dependencies.runAdapter ?? runQueuedProjectSync;
    const stats = await runAdapter(env, message, runId);
    const finishedAt = terminalTimestamp(clock);
    await db.prepare(
      `UPDATE sync_runs
       SET status = ?, stats_json = ?, finished_at = ?
       WHERE id = ?`,
    ).bind(
      "completed",
      JSON.stringify(boundedRunStats(stats)),
      finishedAt,
      runId,
    ).run();
    await db.prepare(
      `UPDATE sync_jobs
       SET status = ?, finished_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind("completed", finishedAt, finishedAt, message.jobId).run();
    await writeReceipt(
      db,
      runtimeId,
      queueMessage.id,
      message.jobId,
      "completed",
      consumedAt,
      finishedAt,
    );
    queueMessage.ack();
  } catch {
    // Persist only fixed, bounded evidence. Adapter exceptions can contain
    // vendor response bodies or credentials and must never enter D1.
    const finishedAt = terminalTimestamp(clock);
    await db.prepare(
      `UPDATE sync_runs
       SET status = ?, error_code = ?, error_message = ?, finished_at = ?
       WHERE id = ?`,
    ).bind(
      "failed",
      "sync_adapter_failed",
      "The selected sync adapter failed.",
      finishedAt,
      runId,
    ).run();
    const exhausted = queueMessage.attempts >= MAX_QUEUE_ATTEMPTS;
    await db.prepare(
      `UPDATE sync_jobs
       SET status = ?, finished_at = ?, updated_at = ?
       WHERE id = ?`,
    ).bind(
      exhausted ? "failed" : "queued",
      exhausted ? finishedAt : null,
      finishedAt,
      message.jobId,
    ).run();
    await writeReceipt(
      db,
      runtimeId,
      queueMessage.id,
      message.jobId,
      "failed",
      consumedAt,
      finishedAt,
    );
    queueMessage.retry();
  }
}

export async function handleSyncQueueBatch(
  batch: QueueBatchLike<unknown>,
  env: Env,
  dependencies: SyncQueueDependencies = {},
): Promise<void> {
  for (const queueMessage of batch.messages) {
    await processMessage(queueMessage, env, dependencies);
  }
}
