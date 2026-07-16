import type { Env, D1DatabaseLike } from "../lib/env";
import { jsonError, jsonOk } from "../lib/response";
import {
  COMMAND_REGISTRY,
  getCommandSpec,
  getRetiredCommandSpec,
  isAuthorized,
} from "../lib/commands/registry";
import { createRun, getRunById, listRunsByState, recordAuditEvent, transitionRun } from "../lib/commands/runs";
import type {
  ActorKind,
  AuthenticatedCommandPrincipal,
  AuthMode,
  CommandIntent,
  CommandRunState,
} from "../lib/commands/types";

const ACTOR_KINDS = new Set<ActorKind>([
  "founder",
  "cofounder",
  "employee",
  "paperclip_agent",
]);
const AUTH_MODES = new Set<AuthMode>([
  "cf_access",
  "m2m",
  "app_bearer",
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

export async function handleCommandIntent(
  env: Env,
  request: Request,
  principal: AuthenticatedCommandPrincipal,
): Promise<Response> {
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

  const retiredResponse = retiredCommandResponse(intent.id);
  if (retiredResponse) return retiredResponse;

  const spec = getCommandSpec(intent.id);
  if (!spec) {
    return jsonError(
      { code: "unknown_command", message: `no such command_id: ${intent.id}`, retryable: false },
      400,
    );
  }
  if (intent.actor_kind !== principal.actor_kind) {
    return jsonError(
      {
        code: "forbidden",
        message: `claimed actor_kind ${intent.actor_kind} does not match authenticated actor_kind ${principal.actor_kind}`,
        retryable: false,
      },
      403,
    );
  }
  // Body actor fields remain part of the wire contract, but all authority and
  // persisted attribution come from the server-authenticated principal.
  if (!isAuthorized(intent.id, principal.actor_kind)) {
    return jsonError(
      {
        code: "forbidden",
        message: `authenticated actor_kind ${principal.actor_kind} not allowed for ${intent.id}`,
        retryable: false,
      },
      403,
    );
  }

  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;
  const db = dbCheck.db;
  const now = Date.now();
  const authenticatedIntent: CommandIntent = {
    ...intent,
    actor_id: principal.actor_id,
    actor_kind: principal.actor_kind,
    auth_mode: principal.auth_mode,
  };

  try {
    const run = await createRun(db, authenticatedIntent, now);
    await recordAuditEvent(
      db,
      run.id,
      "command_received",
      principal.actor_id,
      principal.actor_kind,
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
      principal.actor_id,
      principal.actor_kind,
      null,
      now,
    );

    // The registry contains only Worker-owned commands. Commands whose
    // execution moved to Hermes or Cambium are rejected before persistence.
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

/** Return the credential-free tombstone for a retired command ID, if any. */
export function retiredCommandResponse(commandId: string): Response | null {
  const retiredSpec = getRetiredCommandSpec(commandId);
  if (!retiredSpec) return null;
  return jsonError(
    {
      code: "command_retired",
      message: `${retiredSpec.id} is retired in TeamForge. Use ${retiredSpec.replacement_surface}; ${retiredSpec.replacement_owner} owns this command.`,
      retryable: false,
    },
    410,
  );
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

const VALID_RUN_STATES: readonly CommandRunState[] = [
  "created",
  "accepted",
  "in_progress",
  "succeeded",
  "failed",
  "partial",
  "cancelled",
];

const VALID_ROUTES = ["local_worker"] as const;

/**
 * Read existing command runs by state and optional active Worker route.
 */
export async function handleListCommandRuns(env: Env, url: URL): Promise<Response> {
  const dbCheck = requireDb(env);
  if (!dbCheck.ok) return dbCheck.response;
  const db = dbCheck.db;

  const stateParam = url.searchParams.get("state");
  if (!stateParam) {
    return jsonError(
      { code: "missing_state", message: "state query param required", retryable: false },
      400,
    );
  }
  if (!VALID_RUN_STATES.includes(stateParam as CommandRunState)) {
    return jsonError(
      {
        code: "invalid_state",
        message: `state must be one of ${VALID_RUN_STATES.join("|")}`,
        retryable: false,
      },
      400,
    );
  }
  const state = stateParam as CommandRunState;

  const routeParam = url.searchParams.get("route");
  let commandIds = COMMAND_REGISTRY.map((spec) => spec.id);
  if (routeParam) {
    if (!(VALID_ROUTES as readonly string[]).includes(routeParam)) {
      return jsonError(
        {
          code: "invalid_route",
          message: `route must be one of ${VALID_ROUTES.join("|")}`,
          retryable: false,
        },
        400,
      );
    }
    commandIds = COMMAND_REGISTRY.filter((s) => s.route === routeParam).map((s) => s.id);
  }

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number.parseInt(limitParam, 10) : 50;
  if (Number.isNaN(limit) || limit < 1) {
    return jsonError(
      { code: "invalid_limit", message: "limit must be a positive integer", retryable: false },
      400,
    );
  }

  try {
    const runs = await listRunsByState(db, state, commandIds, limit);
    return jsonOk({ runs, count: runs.length });
  } catch {
    return jsonError(
      { code: "internal_error", message: "list runs failed", retryable: true },
      500,
    );
  }
}
