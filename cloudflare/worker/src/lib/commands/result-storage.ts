import type { D1DatabaseLike } from "../env";
import type { MultiCaResultEnvelope } from "./callback";
import { recordAuditEvent } from "./runs";

/**
 * Persist a legacy MultiCA result envelope to the command_run row and emit audit events.
 *
 * Single SQL UPDATE that writes result_json + error_code + error_message + state +
 * completed_at; subsequent calls keep the earliest completed_at via COALESCE.
 *
 * Caller is responsible for idempotency. This helper unconditionally writes.
 */
export async function recordRunResult(
  db: D1DatabaseLike,
  runId: string,
  envelope: MultiCaResultEnvelope,
  now: number,
): Promise<void> {
  const isTerminal = envelope.state === "succeeded" || envelope.state === "failed" || envelope.state === "partial";
  const completedAt = isTerminal ? (envelope.completed_at ?? now) : null;
  const resultJson = envelope.result ? JSON.stringify(envelope.result) : null;
  const errorCode = envelope.error?.code ?? null;
  const errorMessage = envelope.error?.message ?? null;

  const update = await db
    .prepare(
      `UPDATE command_runs SET result_json = ?, error_code = ?, error_message = ?, state = ?, completed_at = COALESCE(completed_at, ?) WHERE id = ?`,
    )
    .bind(resultJson, errorCode, errorMessage, envelope.state, completedAt, runId)
    .run();
  if (!update.success) throw new Error("D1 UPDATE failed for command_runs result");

  if (envelope.state === "in_progress") {
    await recordAuditEvent(db, runId, "downstream_agent_responded", "legacy_multica", "legacy_multica", {
      correlation_id: envelope.correlation_id,
    }, now);
    return;
  }
  if (envelope.state === "succeeded") {
    await recordAuditEvent(db, runId, "result_received", "legacy_multica", "legacy_multica", {
      correlation_id: envelope.correlation_id,
      has_result: envelope.result !== undefined,
    }, now);
    await recordAuditEvent(db, runId, "result_delivered", "legacy_multica", "legacy_multica", null, now);
    return;
  }
  if (envelope.state === "failed") {
    await recordAuditEvent(db, runId, "failure", "legacy_multica", "legacy_multica", {
      correlation_id: envelope.correlation_id,
      error: envelope.error,
    }, now);
    return;
  }
  // partial
  await recordAuditEvent(db, runId, "partial_failure", "legacy_multica", "legacy_multica", {
    correlation_id: envelope.correlation_id,
    partial_failures: envelope.partial_failures ?? [],
  }, now);
}
