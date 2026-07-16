import { describe, it, expect, beforeEach } from "vitest";
import {
  handleCommandIntent as handleCommandIntentRoute,
  handleGetCommandRun,
  handleListCommandRuns,
} from "../commands";
import { makeMockDb, type MockDbHandle } from "../../lib/test-utils/mock-d1";
import { createRun } from "../../lib/commands/runs";
import type { Env } from "../../lib/env";
import type { AuthenticatedCommandPrincipal, CommandIntent } from "../../lib/commands/types";

const FOUNDER_PRINCIPAL: AuthenticatedCommandPrincipal = {
  actor_id: "pid_founder",
  actor_kind: "founder",
  auth_mode: "cf_access",
};

function handleCommandIntent(
  env: Env,
  request: Request,
  principal: AuthenticatedCommandPrincipal = FOUNDER_PRINCIPAL,
): Promise<Response> {
  return handleCommandIntentRoute(env, request, principal);
}

function makeReq(body: unknown): Request {
  return new Request("https://x/v1/commands/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("commands routes", () => {
  let mock: MockDbHandle;
  let env: Env;
  beforeEach(() => {
    mock = makeMockDb();
    env = { TF_ENV: "test", TEAMFORGE_DB: mock.db } as unknown as Env;
  });

  it("POST /v1/commands/intent with bad JSON returns 400 bad_json", async () => {
    const req = new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    const res = await handleCommandIntent(env, req);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("bad_json");
  });

  it("POST /v1/commands/intent with missing fields returns 400 invalid_intent", async () => {
    const res = await handleCommandIntent(env, makeReq({ id: "ts-standup" }));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("invalid_intent");
  });

  it("POST /v1/commands/intent with unknown command_id returns 400 unknown_command", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "nope",
        actor_id: "f",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-1",
        payload: {},
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("unknown_command");
  });

  it("POST /v1/commands/intent with disallowed actor_kind returns 403 forbidden", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "p",
        actor_kind: "paperclip_agent",
        auth_mode: "paperclip_token",
        correlation_id: "c-2",
        payload: {},
      }),
      {
        actor_id: "paperclip_service",
        actor_kind: "paperclip_agent",
        auth_mode: "paperclip_token",
      },
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("rejects an employee principal forging a founder body claim", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "forged-founder",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-forged-employee",
        payload: {},
      }),
      {
        actor_id: "pid_employee",
        actor_kind: "employee",
        auth_mode: "cf_access",
      },
    );

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain("authenticated actor_kind employee");
    expect(mock.runs.size).toBe(0);
  });

  it("persists authenticated principal attribution instead of body actor claims", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "forged-founder",
        actor_kind: "employee",
        auth_mode: "app_bearer",
        correlation_id: "c-derived-employee",
        payload: {},
      }),
      {
        actor_id: "pid_employee",
        actor_kind: "employee",
        auth_mode: "cf_access",
      },
    );

    expect(res.status).toBe(201);
    const [run] = [...mock.runs.values()];
    expect(run.actor_id).toBe("pid_employee");
    expect(run.actor_kind).toBe("employee");
    expect(run.auth_mode).toBe("cf_access");
    expect(mock.events.every((event) => event.actor_id === "pid_employee")).toBe(true);
    expect(mock.events.every((event) => event.actor_kind === "employee")).toBe(true);
  });

  it("POST /v1/commands/intent with retired ts-standup returns 410 without persistence", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-standup",
        actor_id: "f1",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-3",
        payload: {},
      }),
    );
    expect(res.status).toBe(410);
    const body = (await res.json()) as {
      ok: boolean;
      error: { code: string; message: string };
    };
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe("command_retired");
    expect(body.error.message).toContain("Hermes /ts-standup");
    expect(mock.runs.size).toBe(0);
    expect(mock.events).toHaveLength(0);
  });

  it("POST /v1/commands/intent with valid ts-trace-signal returns 201 accepted (local_worker route)", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f2",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-4",
        payload: {},
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { run_id: string; state: string };
    };
    expect(body.data.state).toBe("accepted");
  });

  it("GET /v1/commands/runs/:id returns 404 for missing run", async () => {
    const res = await handleGetCommandRun(env, "run_missing");
    expect(res.status).toBe(404);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("GET /v1/commands/runs/:id returns 200 with run for known id", async () => {
    const created = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f3",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-5",
        payload: {},
      }),
    );
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { run_id: string };
    };
    const runId = createdBody.data.run_id;
    const res = await handleGetCommandRun(env, runId);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { id: string; state: string };
    };
    expect(body.data.id).toBe(runId);
    expect(body.data.state).toBe("accepted");
  });

  it("POST /v1/commands/intent with invalid actor_kind returns 400 invalid_intent", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f",
        actor_kind: "not_a_role",
        auth_mode: "cf_access",
        correlation_id: "c-bad-actor",
        payload: {},
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_intent");
  });

  it("POST /v1/commands/intent with invalid auth_mode returns 400 invalid_intent", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f",
        actor_kind: "founder",
        auth_mode: "fake_token",
        correlation_id: "c-bad-auth",
        payload: {},
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_intent");
  });

  it("POST /v1/commands/intent with non-object payload returns 400 invalid_intent", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-bad-payload",
        payload: "hello",
      }),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_intent");
  });

  it("POST /v1/commands/intent preserves payload in command_received audit event", async () => {
    await handleCommandIntent(
      env,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-payload",
        payload: { project_id: "proj-42", since: "2026-06-14" },
      }),
    );
    const cmdReceived = mock.events.find((e) => e.kind === "command_received");
    expect(cmdReceived).toBeDefined();
    const payload = JSON.parse(cmdReceived!.payload_json as string);
    expect(payload.payload).toEqual({ project_id: "proj-42", since: "2026-06-14" });
  });

  it("POST /v1/commands/intent returns 503 database_unavailable when DB binding is missing", async () => {
    const envNoDb = { TF_ENV: "test" } as unknown as Env;
    const res = await handleCommandIntent(
      envNoDb,
      makeReq({
        id: "ts-trace-signal",
        actor_id: "f",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-no-db",
        payload: {},
      }),
    );
    expect(res.status).toBe(503);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("database_unavailable");
  });

});

describe("GET /v1/commands/runs", () => {
  let mock: MockDbHandle;
  let env: Env;
  beforeEach(() => {
    mock = makeMockDb();
    env = { TF_ENV: "test", TEAMFORGE_DB: mock.db } as unknown as Env;
  });

  function listUrl(qs: string): URL {
    return new URL(`https://x/v1/commands/runs${qs}`);
  }

  it("missing state returns 400 missing_state", async () => {
    const res = await handleListCommandRuns(env, listUrl(""));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("missing_state");
  });

  it("invalid state returns 400 invalid_state", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=bogus"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_state");
  });

  it("invalid route returns 400 invalid_route", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=created&route=downstream_paperclip"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_route");
  });

  it("invalid limit returns 400 invalid_limit", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=created&limit=not-a-number"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_limit");
  });

  it("empty result returns { runs: [], count: 0 }", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=created"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { runs: unknown[]; count: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data.runs).toEqual([]);
    expect(body.data.count).toBe(0);
  });

  it("keeps a retired historical row readable by ID but outside the active run feed", async () => {
    const legacyIntent: CommandIntent = {
      id: "ts-standup",
      actor_id: "historical-founder",
      actor_kind: "founder",
      auth_mode: "cf_access",
      correlation_id: "historical-correlation",
      payload: {},
    };
    const legacyRun = await createRun(mock.db, legacyIntent, 1_000);

    const direct = await handleGetCommandRun(env, legacyRun.id);
    expect(direct.status).toBe(200);

    const listed = await handleListCommandRuns(env, listUrl("?state=created"));
    expect(listed.status).toBe(200);
    const body = (await listed.json()) as { data: { runs: unknown[]; count: number } };
    expect(body.data.runs).toEqual([]);
    expect(body.data.count).toBe(0);
  });

  it("after creating two local runs, state=accepted returns both", async () => {
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-trace-signal", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "list-c1", payload: {},
      }),
    }));
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-trace-signal", actor_id: "f2", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "list-c2", payload: {},
      }),
    }));
    const res = await handleListCommandRuns(env, listUrl("?state=accepted"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { runs: Array<{ command_id: string; state: string }>; count: number };
    };
    expect(body.data.count).toBe(2);
    expect(body.data.runs.every((r) => r.command_id === "ts-trace-signal")).toBe(true);
    expect(body.data.runs.every((r) => r.state === "accepted")).toBe(true);
  });

  it("rejects retired owner routes from the run reader", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=created&route=hermes_bridge"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_route");
  });

  it("state=accepted&route=local_worker returns the retained run", async () => {
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-trace-signal", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "lw-c1", payload: {},
      }),
    }));

    const acceptedLocal = await handleListCommandRuns(env, listUrl("?state=accepted&route=local_worker"));
    expect(acceptedLocal.status).toBe(200);
    const bodyAccepted = (await acceptedLocal.json()) as {
      data: { runs: Array<{ command_id: string }>; count: number };
    };
    expect(bodyAccepted.data.runs.map((r) => r.command_id)).toContain("ts-trace-signal");
    expect(bodyAccepted.data.count).toBe(1);
  });
});
