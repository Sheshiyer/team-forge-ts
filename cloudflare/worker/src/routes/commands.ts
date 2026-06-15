import type { Env, D1DatabaseLike } from "../lib/env";
import { jsonError, jsonOk } from "../lib/response";
import { getCommandSpec, isAuthorized } from "../lib/commands/registry";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "../lib/commands/runs";
import type { CommandIntent } from "../lib/commands/types";

function validateIntent(
  body: unknown,
): { ok: true; value: CommandIntent } | { ok: false; reason: string } {
  if (!body || typeof body !== "object") return { ok: false, reason: "body must be object" };
  const b = body as Record<string, unknown>;
  if (typeof b.id !== "string") return { ok: false, reason: "id required" };
  if (typeof b.actor_id !== "string") return { ok: false, reason: "actor_id required" };
  if (typeof b.actor_kind !== "string") return { ok: false, reason: "actor_kind required" };
  if (typeof b.auth_mode !== "string") return { ok: false, reason: "auth_mode required" };
  if (typeof b.correlation_id !== "string") return { ok: false, reason: "correlation_id required" };
  return {
    ok: true,
    value: {
      id: b.id,
      actor_id: b.actor_id,
      actor_kind: b.actor_kind as CommandIntent["actor_kind"],
      auth_mode: b.auth_mode as CommandIntent["auth_mode"],
      target_kind: typeof b.target_kind === "string" ? b.target_kind : undefined,
      target_id: typeof b.target_id === "string" ? b.target_id : undefined,
      correlation_id: b.correlation_id,
      payload: (b.payload as Record<string, unknown>) ?? {},
    },
  };
}

function requireDb(env: Env): D1DatabaseLike {
  if (!env.TEAMFORGE_DB) {
    throw new Error("TEAMFORGE_DB binding not configured");
  }
  return env.TEAMFORGE_DB;
}

export async function handleCommandIntent(env: Env, request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(
      { code: "bad_json", message: "request body is not valid JSON", retryable: false },
      400,
    );
  }
  const v = validateIntent(body);
  if (!v.ok) {
    return jsonError(
      { code: "invalid_intent", message: v.reason, retryable: false },
      400,
    );
  }
  const intent = v.value;

  const spec = getCommandSpec(intent.id);
  if (!spec) {
    return jsonError(
      { code: "unknown_command", message: `no such command_id: ${intent.id}`, retryable: false },
      400,
    );
  }
  if (!isAuthorized(intent.id, intent.actor_kind)) {
    return jsonError(
      {
        code: "forbidden",
        message: `actor_kind ${intent.actor_kind} not allowed for ${intent.id}`,
        retryable: false,
      },
      403,
    );
  }

  const db = requireDb(env);
  const now = Date.now();
  const run = await createRun(db, intent, now);
  await recordAuditEvent(
    db,
    run.id,
    "command_received",
    intent.actor_id,
    intent.actor_kind,
    { command_id: intent.id, correlation_id: intent.correlation_id },
    now,
  );
  await recordAuditEvent(db, run.id, "run_created", intent.actor_id, intent.actor_kind, null, now);

  // local_worker commands transition to accepted immediately.
  // downstream_multica / downstream_paperclip commands stay in "created" until callback (Phase 2/3).
  if (spec.route === "local_worker") {
    await transitionRun(db, run.id, "accepted", now);
  }

  return jsonOk(
    { run_id: run.id, state: spec.route === "local_worker" ? "accepted" : "created" },
    { status: 201 },
  );
}

export async function handleGetCommandRun(env: Env, runId: string): Promise<Response> {
  const db = requireDb(env);
  const run = await getRunById(db, runId);
  if (!run) {
    return jsonError(
      { code: "not_found", message: `run ${runId} not found`, retryable: false },
      404,
    );
  }
  return jsonOk(run);
}
