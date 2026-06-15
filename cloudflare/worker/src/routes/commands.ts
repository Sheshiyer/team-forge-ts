import type { Env, D1DatabaseLike } from "../lib/env";
import { jsonError, jsonOk } from "../lib/response";
import { getCommandSpec, isAuthorized } from "../lib/commands/registry";
import { createRun, getRunById, recordAuditEvent, transitionRun } from "../lib/commands/runs";
import type { ActorKind, AuthMode, CommandIntent } from "../lib/commands/types";

const ACTOR_KINDS = new Set<ActorKind>([
  "founder",
  "cofounder",
  "employee",
  "multica_service",
  "paperclip_agent",
]);
const AUTH_MODES = new Set<AuthMode>([
  "cf_access",
  "m2m",
  "app_bearer",
  "aws_task_role",
  "paperclip_token",
]);

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
  if (!ACTOR_KINDS.has(b.actor_kind as ActorKind)) {
    return { ok: false, reason: "actor_kind not in enum" };
  }
  if (!AUTH_MODES.has(b.auth_mode as AuthMode)) {
    return { ok: false, reason: "auth_mode not in enum" };
  }
  if (b.payload !== undefined && b.payload !== null) {
    if (typeof b.payload !== "object" || Array.isArray(b.payload)) {
      return { ok: false, reason: "payload must be an object" };
    }
  }
  return {
    ok: true,
    value: {
      id: b.id,
      actor_id: b.actor_id,
      actor_kind: b.actor_kind as ActorKind,
      auth_mode: b.auth_mode as AuthMode,
      target_kind: typeof b.target_kind === "string" ? b.target_kind : undefined,
      target_id: typeof b.target_id === "string" ? b.target_id : undefined,
      correlation_id: b.correlation_id,
      payload: (b.payload as Record<string, unknown> | null | undefined) ?? {},
    },
  };
}

function requireDb(
  env: Env,
): { ok: true; db: D1DatabaseLike } | { ok: false; response: Response } {
  if (!env.TEAMFORGE_DB) {
    return {
      ok: false,
      response: jsonError(
        {
          code: "database_unavailable",
          message: "TEAMFORGE_DB binding not configured",
          retryable: false,
        },
        503,
      ),
    };
  }
  return { ok: true, db: env.TEAMFORGE_DB };
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
  // TODO(hermes-actor-kind-trust): actor_kind is currently read from the request body, which is
  // untrusted client input. When PlexusPrincipal gains an actor_kind field (Phase 2 likely),
  // derive actor_kind from the authenticated principal here, NOT from intent.actor_kind. Today
  // this is acceptable because all registered commands share the founder/cofounder tier, but
  // it becomes exploitable once multica_service- or paperclip_agent-only commands ship.
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

  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;
  const db = dbCheck.db;
  const now = Date.now();

  try {
    const run = await createRun(db, intent, now);
    await recordAuditEvent(
      db,
      run.id,
      "command_received",
      intent.actor_id,
      intent.actor_kind,
      {
        command_id: intent.id,
        correlation_id: intent.correlation_id,
        payload: intent.payload,
      },
      now,
    );
    await recordAuditEvent(
      db,
      run.id,
      "run_created",
      intent.actor_id,
      intent.actor_kind,
      null,
      now,
    );

    // local_worker commands transition to accepted immediately.
    // downstream_multica commands stay in "created" until the cambium-bridge
    // teamforge-consumer picks them up, dispatches via `multica issue assign`,
    // and posts back via the Phase 2 callback route (POST /v1/commands/runs/:id/result).
    if (spec.route === "local_worker") {
      await transitionRun(db, run.id, "accepted", now);
    }

    const finalRun = await getRunById(db, run.id);
    const responseState = finalRun?.state ?? (spec.route === "local_worker" ? "accepted" : "created");
    return jsonOk({ run_id: run.id, state: responseState }, { status: 201 });
  } catch {
    return jsonError(
      { code: "internal_error", message: "command pipeline failed", retryable: true },
      500,
    );
  }
}

export async function handleGetCommandRun(env: Env, runId: string): Promise<Response> {
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;
  const db = dbCheck.db;
  try {
    const run = await getRunById(db, runId);
    if (!run) {
      return jsonError(
        { code: "not_found", message: `run ${runId} not found`, retryable: false },
        404,
      );
    }
    return jsonOk(run);
  } catch {
    return jsonError(
      { code: "internal_error", message: "command pipeline failed", retryable: true },
      500,
    );
  }
}
