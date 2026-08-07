import { describe, it, expect, beforeEach } from "vitest";
import { handleCommandIntent, handleGetCommandRun, handleGetCommandRunAudit, handleListCommandRuns } from "../commands";
import { makeMockDb, type MockDbHandle } from "../../lib/test-utils/mock-d1";
import type { Env } from "../../lib/env";

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
        id: "ts-standup",
        actor_id: "p",
        actor_kind: "paperclip_agent",
        auth_mode: "paperclip_token",
        correlation_id: "c-2",
        payload: {},
      }),
    );
    expect(res.status).toBe(403);
    const body = (await res.json()) as { ok: boolean; error: { code: string } };
    expect(body.error.code).toBe("forbidden");
  });

  it("POST /v1/commands/intent with valid ts-standup returns 201 created (downstream route)", async () => {
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
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { run_id: string; state: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.run_id.startsWith("run_")).toBe(true);
    expect(body.data.state).toBe("created");
    expect(mock.runs.size).toBe(1);
    expect(mock.events.length).toBeGreaterThanOrEqual(2);
    expect(mock.events.map((e) => e.kind)).toContain("command_received");
    expect(mock.events.map((e) => e.kind)).toContain("run_created");
  });

  it("POST /v1/commands/intent with valid ts-trace-signal returns 201 created (cambium_operator route)", async () => {
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
    expect(body.data.state).toBe("created");
  });

  it("POST /v1/commands/intent with valid ts-status queues to Cambium operator", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-status",
        actor_id: "f-status",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-status",
        payload: {},
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as {
      ok: boolean;
      data: { run_id: string; state: string };
    };
    expect(body.ok).toBe(true);
    expect(body.data.state).toBe("created");

    const run = mock.runs.get(body.data.run_id);
    expect(run?.state).toBe("created");
    expect(run?.result_json).toBeNull();
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
        id: "ts-standup",
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
    expect(body.data.state).toBe("created");
  });

  it("GET /v1/commands/runs/:id/audit returns ordered audit events", async () => {
    const created = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-standup",
        actor_id: "f3",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-audit",
        payload: { project_id: "proj-audit" },
      }),
    );
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { run_id: string };
    };
    const runId = createdBody.data.run_id;
    const res = await handleGetCommandRunAudit(
      env,
      runId,
      new URL("https://x/v1/commands/runs/run_x/audit?limit=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { events: Array<{ run_id: string; kind: string; payload_json: string | null }>; count: number };
    };
    expect(body.ok).toBe(true);
    expect(body.data.count).toBe(2);
    expect(body.data.events.map((event) => event.kind)).toEqual(["command_received", "run_created"]);
    expect(body.data.events.every((event) => event.run_id === runId)).toBe(true);
    expect(JSON.parse(body.data.events[0].payload_json as string).payload).toEqual({
      project_id: "proj-audit",
    });
  });

  it("GET /v1/commands/runs/:id/audit for ts-status includes queued intake events", async () => {
    const created = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-status",
        actor_id: "f3",
        actor_kind: "founder",
        auth_mode: "cf_access",
        correlation_id: "c-status-audit",
        payload: {},
      }),
    );
    const createdBody = (await created.json()) as {
      ok: boolean;
      data: { run_id: string };
    };
    const runId = createdBody.data.run_id;
    const res = await handleGetCommandRunAudit(
      env,
      runId,
      new URL("https://x/v1/commands/runs/run_x/audit?limit=10"),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: boolean;
      data: { events: Array<{ kind: string; payload_json: string | null }>; count: number };
    };
    expect(body.data.count).toBe(2);
    expect(body.data.events.map((event) => event.kind)).toEqual([
      "command_received",
      "run_created",
    ]);
    expect(JSON.parse(body.data.events[0].payload_json as string).command_id).toBe("ts-status");
  });

  it("GET /v1/commands/runs/:id/audit returns 404 for missing run", async () => {
    const res = await handleGetCommandRunAudit(
      env,
      "run_missing",
      new URL("https://x/v1/commands/runs/run_missing/audit"),
    );
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("not_found");
  });

  it("GET /v1/commands/runs/:id/audit validates limit", async () => {
    const res = await handleGetCommandRunAudit(
      env,
      "run_missing",
      new URL("https://x/v1/commands/runs/run_missing/audit?limit=nope"),
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_limit");
  });

  it("POST /v1/commands/intent with invalid actor_kind returns 400 invalid_intent", async () => {
    const res = await handleCommandIntent(
      env,
      makeReq({
        id: "ts-standup",
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
        id: "ts-standup",
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
        id: "ts-standup",
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
        id: "ts-standup",
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
        id: "ts-standup",
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

  it("after creating 2 ts-standup runs, state=created returns both", async () => {
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-standup", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "list-c1", payload: {},
      }),
    }));
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-standup", actor_id: "f2", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "list-c2", payload: {},
      }),
    }));
    const res = await handleListCommandRuns(env, listUrl("?state=created"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { runs: Array<{ command_id: string; state: string }>; count: number };
    };
    expect(body.data.count).toBe(2);
    expect(body.data.runs.every((r) => r.command_id === "ts-standup")).toBe(true);
    expect(body.data.runs.every((r) => r.state === "created")).toBe(true);
  });

  it("state=created&route=hermes_bridge filters by route correctly", async () => {
    // ts-standup is hermes_bridge
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-standup", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "rt-c1", payload: {},
      }),
    }));
    // ts-generate-brief is hermes_bridge
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-generate-brief", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "rt-c2", payload: {},
      }),
    }));
    // ts-trace-signal is cambium_operator - should be excluded from hermes_bridge results
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-trace-signal", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "rt-c3", payload: {},
      }),
    }));

    const res = await handleListCommandRuns(env, listUrl("?state=created&route=hermes_bridge"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { runs: Array<{ command_id: string }>; count: number };
    };
    const cmdIds = body.data.runs.map((r) => r.command_id);
    expect(cmdIds).toContain("ts-standup");
    expect(cmdIds).toContain("ts-generate-brief");
    expect(cmdIds).not.toContain("ts-trace-signal");
  });

  it("state=created&route=cambium_operator excludes hermes_bridge runs", async () => {
    // ts-standup (hermes_bridge) stays in "created"
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-standup", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "lw-c1", payload: {},
      }),
    }));
    // ts-trace-signal (cambium_operator) also stays in "created".
    await handleCommandIntent(env, new Request("https://x/v1/commands/intent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id: "ts-trace-signal", actor_id: "f1", actor_kind: "founder", auth_mode: "cf_access",
        correlation_id: "lw-c2", payload: {},
      }),
    }));

    const createdCambium = await handleListCommandRuns(env, listUrl("?state=created&route=cambium_operator"));
    expect(createdCambium.status).toBe(200);
    const bodyCreated = (await createdCambium.json()) as {
      data: { runs: Array<{ command_id: string }>; count: number };
    };
    expect(bodyCreated.data.runs.map((r) => r.command_id)).not.toContain("ts-standup");
    expect(bodyCreated.data.runs.map((r) => r.command_id)).toContain("ts-trace-signal");
  });

  it("state=created&route=legacy_multica is a valid empty drain route", async () => {
    const res = await handleListCommandRuns(env, listUrl("?state=created&route=legacy_multica"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: { runs: Array<{ command_id: string }>; count: number };
    };
    expect(body.data.runs).toEqual([]);
    expect(body.data.count).toBe(0);
  });
});
