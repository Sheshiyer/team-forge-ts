import type { Env, D1DatabaseLike } from "../lib/env";
import { jsonError, jsonOk } from "../lib/response";
import { verifyMultiCaCallback } from "../lib/auth-multica";
import { parseCallbackBody } from "../lib/commands/callback";
import { recordRunResult } from "../lib/commands/result-storage";
import { getRunById } from "../lib/commands/runs";

function requireDb(
  env: Env,
): { ok: true; db: D1DatabaseLike } | { ok: false; response: Response } {
  if (!env.TEAMFORGE_DB) {
    return {
      ok: false,
      response: jsonError(
        { code: "database_unavailable", message: "TEAMFORGE_DB binding not configured", retryable: false },
        503,
      ),
    };
  }
  return { ok: true, db: env.TEAMFORGE_DB };
}

const TERMINAL = new Set(["succeeded", "failed", "partial"]);

export async function handleCommandsCallback(
  env: Env,
  request: Request,
  runId: string,
): Promise<Response> {
  // 1) HMAC verify — also consumes the body (returned as string) so we
  //    don't have to re-read the stream.
  const verified = await verifyMultiCaCallback(request, env);
  if (!verified.ok) return verified.response;

  // 2) Parse JSON
  let parsed: unknown;
  try {
    parsed = JSON.parse(verified.body);
  } catch {
    return jsonError(
      { code: "bad_json", message: "request body is not valid JSON", retryable: false },
      400,
    );
  }
  const v = parseCallbackBody(parsed);
  if (!v.ok) {
    return jsonError(
      { code: "invalid_envelope", message: v.reason, retryable: false },
      400,
    );
  }
  const envelope = v.value;

  // 3) Path runId must equal envelope.run_id
  if (envelope.run_id !== runId) {
    return jsonError(
      { code: "run_id_mismatch", message: "envelope.run_id does not match path", retryable: false },
      400,
    );
  }

  // 4) DB binding
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;
  const db = dbCheck.db;

  // 5) Fetch the run
  let run;
  try {
    run = await getRunById(db, runId);
  } catch {
    return jsonError(
      { code: "internal_error", message: "command pipeline failed", retryable: true },
      500,
    );
  }
  if (!run) {
    return jsonError(
      { code: "not_found", message: `run ${runId} not found`, retryable: false },
      404,
    );
  }

  // 6) Correlation_id must match the stored run
  if (run.correlation_id !== envelope.correlation_id) {
    return jsonError(
      { code: "correlation_mismatch", message: "envelope.correlation_id does not match stored run", retryable: false },
      400,
    );
  }

  // 7) Idempotency: same (run, correlation, terminal state) → no-op
  if (TERMINAL.has(envelope.state) && run.state === envelope.state) {
    return jsonOk(run);
  }

  // 8) Persist + audit
  try {
    const now = Date.now();
    await recordRunResult(db, runId, envelope, now);
    const updated = await getRunById(db, runId);
    return jsonOk(updated ?? run);
  } catch {
    return jsonError(
      { code: "internal_error", message: "command pipeline failed", retryable: true },
      500,
    );
  }
}
