import { describe, it, expect, beforeEach } from "vitest";
import { makeMockDb, type MockDbHandle } from "../test-utils/mock-d1";
import { createRun } from "./runs";
import { recordRunResult } from "./result-storage";
import type { CommandIntent } from "./types";

const intent = (correlationId: string): CommandIntent => ({
  id: "ts-standup",
  actor_id: "founder-1",
  actor_kind: "founder",
  auth_mode: "cf_access",
  target_kind: "project",
  target_id: "proj-1",
  correlation_id: correlationId,
  payload: {},
});

describe("recordRunResult", () => {
  let mock: MockDbHandle;
  beforeEach(() => { mock = makeMockDb(); });

  it("in_progress: sets state, emits downstream_agent_responded, no result_json", async () => {
    const run = await createRun(mock.db, intent("c-1"), 1000);
    await recordRunResult(mock.db, run.id, {
      run_id: run.id,
      correlation_id: "c-1",
      state: "in_progress",
    }, 2000);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("in_progress");
    expect(stored.result_json).toBeNull();
    expect(stored.completed_at).toBeNull();
    const kinds = mock.events.map((e) => e.kind);
    expect(kinds).toContain("downstream_agent_responded");
  });

  it("succeeded: writes result_json, completed_at, emits result_received + result_delivered", async () => {
    const run = await createRun(mock.db, intent("c-2"), 1000);
    const result = { yesterday: ["ship X"], today: ["fix Y"], blockers: [], confidence: 0.92 };
    await recordRunResult(mock.db, run.id, {
      run_id: run.id,
      correlation_id: "c-2",
      state: "succeeded",
      result,
      completed_at: 2500,
    }, 3000);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("succeeded");
    expect(stored.result_json).toBe(JSON.stringify(result));
    expect(stored.completed_at).toBe(2500);
    const kinds = mock.events.map((e) => e.kind);
    expect(kinds).toContain("result_received");
    expect(kinds).toContain("result_delivered");
  });

  it("succeeded without explicit completed_at uses `now`", async () => {
    const run = await createRun(mock.db, intent("c-3"), 1000);
    await recordRunResult(mock.db, run.id, {
      run_id: run.id,
      correlation_id: "c-3",
      state: "succeeded",
      result: { ok: true },
    }, 4000);
    expect(mock.runs.get(run.id)!.completed_at).toBe(4000);
  });

  it("failed: writes error_code + error_message, emits failure", async () => {
    const run = await createRun(mock.db, intent("c-4"), 1000);
    await recordRunResult(mock.db, run.id, {
      run_id: run.id,
      correlation_id: "c-4",
      state: "failed",
      error: { code: "agent_timeout", message: "agent did not respond in 30s", retryable: true },
    }, 5000);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("failed");
    expect(stored.error_code).toBe("agent_timeout");
    expect(stored.error_message).toBe("agent did not respond in 30s");
    expect(mock.events.map((e) => e.kind)).toContain("failure");
  });

  it("partial: writes result_json + emits partial_failure with the failures payload", async () => {
    const run = await createRun(mock.db, intent("c-5"), 1000);
    const failures = [{ agent_id: "a-1", error_code: "no_data", error_message: "no signals" }];
    await recordRunResult(mock.db, run.id, {
      run_id: run.id,
      correlation_id: "c-5",
      state: "partial",
      result: { aggregated: true },
      partial_failures: failures,
    }, 6000);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("partial");
    expect(stored.result_json).toBe(JSON.stringify({ aggregated: true }));
    const partialEvt = mock.events.find((e) => e.kind === "partial_failure");
    expect(partialEvt).toBeDefined();
    const payload = JSON.parse(partialEvt!.payload_json as string);
    expect(payload.partial_failures).toEqual(failures);
  });
});
