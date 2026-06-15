import type { Env } from "../env";
import { requestPaperclipStandup } from "../paperclip-client";
import { getCommandSpec } from "./registry";
import { recordAuditEvent } from "./runs";
import { recordRunResult } from "./result-storage";
import type { CommandRun } from "./types";

/**
 * Best-effort dispatch for a freshly-created run.
 *
 * - `downstream_multica` runs: no-op. MultiCA owns pickup; result arrives via
 *   POST /v1/commands/runs/:id/result (Phase 2 callback path).
 * - `local_worker` runs: no-op. The intent handler already transitioned to
 *   `accepted`; Phase 4 will land actual local execution.
 * - `downstream_paperclip` runs: call paperclip-client + persist result via
 *   recordRunResult. Errors are written as `state=failed` so the UI can
 *   surface them; this function never throws.
 *
 * Returns silently on every code path. The route handler `await`s this before
 * responding to the caller, so the Hermes UI sees the dispatched state in its
 * first poll. If the dispatch is slow, the UI's polling loop will pick up
 * later transitions.
 */
export async function dispatchRun(env: Env, run: CommandRun): Promise<void> {
  if (!env.TEAMFORGE_DB) return;
  const spec = getCommandSpec(run.command_id);
  if (!spec) return;
  if (spec.route !== "downstream_paperclip") return;

  const db = env.TEAMFORGE_DB;
  const now = Date.now();
  await recordAuditEvent(db, run.id, "downstream_agent_contacted", null, null, {
    route: spec.route,
    correlation_id: run.correlation_id,
  }, now);

  // The payload that drove the intent was preserved in the command_received
  // audit event; but the dispatcher only needs agent_id, which we conventionally
  // pass via target_id (preferred) or run.command_id-specific defaults.
  const agentId = run.target_id ?? null;
  if (!agentId) {
    await recordRunResult(db, run.id, {
      run_id: run.id,
      correlation_id: run.correlation_id,
      state: "failed",
      error: { code: "missing_agent_id", message: "run.target_id is required for downstream_paperclip", retryable: false },
    }, Date.now());
    return;
  }

  const r = await requestPaperclipStandup(env, {
    agent_id: agentId,
    scope: {},
    correlation_id: run.correlation_id,
    requester: { kind: "teamforge_worker", identity: "worker" },
  });

  if (!r.ok) {
    await recordRunResult(db, run.id, {
      run_id: run.id,
      correlation_id: run.correlation_id,
      state: "failed",
      error: r.error,
    }, Date.now());
    return;
  }

  if (r.value.state === "failed") {
    await recordRunResult(db, run.id, {
      run_id: run.id,
      correlation_id: run.correlation_id,
      state: "failed",
      error: { code: r.value.error?.code ?? "agent_failed", message: r.value.error?.message ?? "agent reported failure", retryable: false },
    }, Date.now());
    return;
  }

  await recordRunResult(db, run.id, {
    run_id: run.id,
    correlation_id: run.correlation_id,
    state: "succeeded",
    result: {
      agent_id: r.value.agent_id,
      data: r.value.data ?? null,
      sources: r.value.sources,
    },
  }, Date.now());
}
