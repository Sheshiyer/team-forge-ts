/**
 * MultiCA callback envelope — the wire shape posted to
 * `POST /v1/commands/runs/:id/result`.
 *
 * `state` is restricted to the four transitions MultiCA owns:
 *  - `in_progress` — execution started (sets accepted_at via COALESCE)
 *  - `succeeded` — terminal, `result` populated
 *  - `failed` — terminal, `error` populated
 *  - `partial` — terminal, `result` may carry whatever was aggregated and
 *    `partial_failures` lists the agents that didn't respond
 *
 * Idempotency is keyed on (run.correlation_id, envelope.state) for terminal
 * states only. Multiple `in_progress` callbacks are allowed (they just
 * re-emit the audit event) but won't double-set `accepted_at` because the
 * UPDATE uses COALESCE.
 */
export type MultiCaCallbackState =
  | "in_progress"
  | "succeeded"
  | "failed"
  | "partial";

export interface MultiCaPartialFailure {
  agent_id: string;
  error_code: string;
  error_message: string;
}

export interface MultiCaResultEnvelope {
  run_id: string;
  correlation_id: string;
  state: MultiCaCallbackState;
  result?: Record<string, unknown>;
  error?: { code: string; message: string; retryable: boolean };
  partial_failures?: MultiCaPartialFailure[];
  completed_at?: number; // epoch ms
}

const STATES = new Set<MultiCaCallbackState>([
  "in_progress",
  "succeeded",
  "failed",
  "partial",
]);

export function parseCallbackBody(
  body: unknown,
): { ok: true; value: MultiCaResultEnvelope } | { ok: false; reason: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "body must be an object" };
  }
  const b = body as Record<string, unknown>;
  if (typeof b.run_id !== "string" || b.run_id.length === 0) {
    return { ok: false, reason: "run_id required" };
  }
  if (typeof b.correlation_id !== "string" || b.correlation_id.length === 0) {
    return { ok: false, reason: "correlation_id required" };
  }
  if (typeof b.state !== "string" || !STATES.has(b.state as MultiCaCallbackState)) {
    return { ok: false, reason: "state must be in_progress|succeeded|failed|partial" };
  }
  const state = b.state as MultiCaCallbackState;

  if (state === "failed") {
    if (!b.error || typeof b.error !== "object") {
      return { ok: false, reason: "failed state requires error block" };
    }
    const e = b.error as Record<string, unknown>;
    if (typeof e.code !== "string" || typeof e.message !== "string" || typeof e.retryable !== "boolean") {
      return { ok: false, reason: "error block requires {code:string, message:string, retryable:boolean}" };
    }
  }
  if (b.result !== undefined && (typeof b.result !== "object" || b.result === null || Array.isArray(b.result))) {
    return { ok: false, reason: "result must be an object" };
  }
  if (b.partial_failures !== undefined) {
    if (!Array.isArray(b.partial_failures)) {
      return { ok: false, reason: "partial_failures must be an array" };
    }
    for (const f of b.partial_failures) {
      if (
        !f ||
        typeof f !== "object" ||
        typeof (f as Record<string, unknown>).agent_id !== "string" ||
        typeof (f as Record<string, unknown>).error_code !== "string" ||
        typeof (f as Record<string, unknown>).error_message !== "string"
      ) {
        return { ok: false, reason: "partial_failures entries require {agent_id, error_code, error_message}" };
      }
    }
  }
  if (b.completed_at !== undefined && typeof b.completed_at !== "number") {
    return { ok: false, reason: "completed_at must be a number (epoch ms)" };
  }

  return {
    ok: true,
    value: {
      run_id: b.run_id,
      correlation_id: b.correlation_id,
      state,
      result: b.result as Record<string, unknown> | undefined,
      error: b.error as { code: string; message: string; retryable: boolean } | undefined,
      partial_failures: b.partial_failures as MultiCaPartialFailure[] | undefined,
      completed_at: b.completed_at as number | undefined,
    },
  };
}
