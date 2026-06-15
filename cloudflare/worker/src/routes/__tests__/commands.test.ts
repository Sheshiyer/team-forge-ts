import { describe, it, expect, beforeEach } from "vitest";
import { handleCommandIntent, handleGetCommandRun } from "../commands";
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
