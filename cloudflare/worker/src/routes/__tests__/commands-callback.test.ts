import { describe, it, expect, beforeEach } from "vitest";
import { handleCommandsCallback } from "../commands-callback";
import { makeMockDb, type MockDbHandle } from "../../lib/test-utils/mock-d1";
import { createRun } from "../../lib/commands/runs";
import type { Env } from "../../lib/env";
import type { CommandIntent } from "../../lib/commands/types";

const SECRET = "phase-2-test-secret";

async function signHex(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeSignedReq(runId: string, payload: Record<string, unknown>): Promise<Request> {
  const body = JSON.stringify(payload);
  const sig = await signHex(SECRET, body);
  return new Request(`https://x/v1/commands/runs/${runId}/result`, {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-multica-signature": sig },
  });
}

const intent = (correlationId: string): CommandIntent => ({
  id: "ts-standup",
  actor_id: "f",
  actor_kind: "founder",
  auth_mode: "cf_access",
  correlation_id: correlationId,
  payload: {},
});

describe("handleCommandsCallback", () => {
  let mock: MockDbHandle;
  let env: Env;
  beforeEach(() => {
    mock = makeMockDb();
    env = { TF_ENV: "test", MULTICA_CALLBACK_SHARED_SECRET: SECRET, TEAMFORGE_DB: mock.db } as unknown as Env;
  });

  it("returns 503 when MULTICA_CALLBACK_SHARED_SECRET is unset", async () => {
    const envBad = { TF_ENV: "test", TEAMFORGE_DB: mock.db } as unknown as Env;
    const req = await makeSignedReq("run_1", { run_id: "run_1", correlation_id: "c-1", state: "succeeded", result: {} });
    const res = await handleCommandsCallback(envBad, req, "run_1");
    expect(res.status).toBe(503);
  });

  it("returns 404 not_found for unknown run_id", async () => {
    const req = await makeSignedReq("run_missing", { run_id: "run_missing", correlation_id: "c-1", state: "succeeded", result: {} });
    const res = await handleCommandsCallback(env, req, "run_missing");
    expect(res.status).toBe(404);
  });

  it("returns 400 mismatch when path runId != envelope.run_id", async () => {
    const run = await createRun(mock.db, intent("c-1"), 1000);
    const req = await makeSignedReq(run.id, { run_id: "run_other", correlation_id: "c-1", state: "succeeded", result: {} });
    const res = await handleCommandsCallback(env, req, run.id);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("run_id_mismatch");
  });

  it("returns 400 correlation_mismatch when correlation_id != stored run", async () => {
    const run = await createRun(mock.db, intent("c-stored"), 1000);
    const req = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-other", state: "succeeded", result: {} });
    const res = await handleCommandsCallback(env, req, run.id);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("correlation_mismatch");
  });

  it("in_progress: transitions to in_progress + emits audit + returns 200 with run", async () => {
    const run = await createRun(mock.db, intent("c-2"), 1000);
    const req = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-2", state: "in_progress" });
    const res = await handleCommandsCallback(env, req, run.id);
    expect(res.status).toBe(200);
    expect(mock.runs.get(run.id)!.state).toBe("in_progress");
    expect(mock.events.map((e) => e.kind)).toContain("downstream_agent_responded");
  });

  it("succeeded: writes result_json + emits result_received + result_delivered", async () => {
    const run = await createRun(mock.db, intent("c-3"), 1000);
    const result = { yesterday: ["x"], today: ["y"], blockers: [], confidence: 0.9 };
    const req = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-3", state: "succeeded", result });
    const res = await handleCommandsCallback(env, req, run.id);
    expect(res.status).toBe(200);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("succeeded");
    expect(stored.result_json).toBe(JSON.stringify(result));
    const kinds = mock.events.map((e) => e.kind);
    expect(kinds).toContain("result_received");
    expect(kinds).toContain("result_delivered");
  });

  it("idempotency: repeated terminal callback with same correlation_id + state is a no-op", async () => {
    const run = await createRun(mock.db, intent("c-4"), 1000);
    const result = { ok: true };
    const req1 = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-4", state: "succeeded", result });
    await handleCommandsCallback(env, req1, run.id);
    const eventsAfterFirst = mock.events.length;
    const req2 = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-4", state: "succeeded", result });
    const res2 = await handleCommandsCallback(env, req2, run.id);
    expect(res2.status).toBe(200);
    expect(mock.events.length).toBe(eventsAfterFirst);  // no new events
  });

  it("idempotency does NOT short-circuit non-terminal in_progress callbacks", async () => {
    const run = await createRun(mock.db, intent("c-5"), 1000);
    const req1 = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-5", state: "in_progress" });
    await handleCommandsCallback(env, req1, run.id);
    const eventsAfterFirst = mock.events.length;
    const req2 = await makeSignedReq(run.id, { run_id: run.id, correlation_id: "c-5", state: "in_progress" });
    await handleCommandsCallback(env, req2, run.id);
    expect(mock.events.length).toBeGreaterThan(eventsAfterFirst);
  });

  it("rejects unsigned requests with 401", async () => {
    const run = await createRun(mock.db, intent("c-6"), 1000);
    const body = JSON.stringify({ run_id: run.id, correlation_id: "c-6", state: "succeeded", result: {} });
    const req = new Request(`https://x/v1/commands/runs/${run.id}/result`, {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
    });
    const res = await handleCommandsCallback(env, req, run.id);
    expect(res.status).toBe(401);
  });
});
