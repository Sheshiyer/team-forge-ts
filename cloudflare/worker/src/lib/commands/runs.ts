import type { D1DatabaseLike } from "../env";
import type { AuditEventKind, CommandIntent, CommandRun, CommandRunState, ActorKind } from "./types";

function newId(prefix: string): string {
  const random = crypto.randomUUID().replace(/-/g, "");
  return `${prefix}_${random.slice(0, 24)}`;
}

/** Create a new command_run row in state=created. */
export async function createRun(
  db: D1DatabaseLike,
  intent: CommandIntent,
  now: number,
): Promise<CommandRun> {
  const id = newId("run");
  const result = await db
    .prepare(
      `INSERT INTO command_runs
       (id, command_id, actor_id, actor_kind, auth_mode, state,
        target_kind, target_id, correlation_id, requested_at)
       VALUES (?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`,
    )
    .bind(
      id,
      intent.id,
      intent.actor_id,
      intent.actor_kind,
      intent.auth_mode,
      intent.target_kind ?? null,
      intent.target_id ?? null,
      intent.correlation_id,
      now,
    )
    .run();
  if (!result.success) throw new Error("D1 INSERT failed for command_runs");
  return {
    id,
    command_id: intent.id,
    actor_id: intent.actor_id,
    actor_kind: intent.actor_kind,
    auth_mode: intent.auth_mode,
    state: "created",
    target_kind: intent.target_kind ?? null,
    target_id: intent.target_id ?? null,
    correlation_id: intent.correlation_id,
    requested_at: now,
    accepted_at: null,
    completed_at: null,
    result_json: null,
    error_code: null,
    error_message: null,
  };
}

export async function getRunById(db: D1DatabaseLike, runId: string): Promise<CommandRun | null> {
  const row = await db
    .prepare(`SELECT * FROM command_runs WHERE id = ?`)
    .bind(runId)
    .first<CommandRun>();
  return row ?? null;
}

export async function transitionRun(
  db: D1DatabaseLike,
  runId: string,
  state: CommandRunState,
  now: number,
): Promise<void> {
  const acceptedAt = state === "accepted" ? now : null;
  const completedAt = ["succeeded", "failed", "partial", "cancelled"].includes(state) ? now : null;
  const result = await db
    .prepare(
      `UPDATE command_runs SET state = ?, accepted_at = COALESCE(accepted_at, ?),
       completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
    )
    .bind(state, acceptedAt, completedAt, runId)
    .run();
  if (!result.success) throw new Error("D1 UPDATE failed for command_runs");
}

/**
 * List runs filtered by state, optionally by route (via command_id IN the routed set).
 * The route filter is resolved by the route handler using the registry; this helper
 * accepts a list of allowed command_ids.
 */
export async function listRunsByState(
  db: D1DatabaseLike,
  state: CommandRunState,
  commandIds: string[] | null,
  limit: number,
): Promise<CommandRun[]> {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  if (commandIds === null) {
    const result = await db
      .prepare(`SELECT * FROM command_runs WHERE state = ? ORDER BY requested_at ASC LIMIT ?`)
      .bind(state, safeLimit)
      .all<CommandRun>();
    return result.results;
  }
  if (commandIds.length === 0) return [];
  const placeholders = commandIds.map(() => "?").join(",");
  const result = await db
    .prepare(
      `SELECT * FROM command_runs WHERE state = ? AND command_id IN (${placeholders}) ORDER BY requested_at ASC LIMIT ?`,
    )
    .bind(state, ...commandIds, safeLimit)
    .all<CommandRun>();
  return result.results;
}

export async function recordAuditEvent(
  db: D1DatabaseLike,
  runId: string,
  kind: AuditEventKind,
  actorId: string | null,
  actorKind: ActorKind | null,
  payload: Record<string, unknown> | null,
  now: number,
): Promise<void> {
  const id = newId("evt");
  const result = await db
    .prepare(
      `INSERT INTO command_audit_events
       (id, run_id, kind, actor_id, actor_kind, payload_json, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      runId,
      kind,
      actorId,
      actorKind,
      payload ? JSON.stringify(payload) : null,
      now,
    )
    .run();
  if (!result.success) throw new Error("D1 INSERT failed for command_audit_events");
}
