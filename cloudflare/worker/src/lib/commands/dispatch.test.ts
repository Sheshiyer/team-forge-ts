import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { dispatchRun } from "./dispatch";
import { createRun } from "./runs";
import { makeMockDb, type MockDbHandle } from "../test-utils/mock-d1";
import type { Env } from "../env";
import type { CommandIntent } from "./types";

const baseEnv: Env = {
  TF_ENV: "test",
  PAPERCLIP_REMOTE_BASE_URL: "https://paperclip.test",
  PAPERCLIP_AGENT_TOKEN_MAP: '{"agent-eng":"tok-eng"}',
} as unknown as Env;

const intent = (id: string, correlationId: string, target?: string): CommandIntent => ({
  id,
  actor_id: "f",
  actor_kind: "founder",
  auth_mode: "cf_access",
  target_kind: target ? "agent" : undefined,
  target_id: target,
  correlation_id: correlationId,
  payload: target ? { agent_id: target } : {},
});

describe("dispatchRun", () => {
  let mock: MockDbHandle;
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    mock = makeMockDb();
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("is a no-op for downstream_multica runs (waits for callback)", async () => {
    const env = { ...baseEnv, TEAMFORGE_DB: mock.db } as Env;
    const run = await createRun(mock.db, intent("ts-standup", "c-1"), 1000);
    await dispatchRun(env, run);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(mock.runs.get(run.id)!.state).toBe("created");
  });

  it("is a no-op for local_worker runs", async () => {
    const env = { ...baseEnv, TEAMFORGE_DB: mock.db } as Env;
    const run = await createRun(mock.db, intent("ts-trace-signal", "c-2"), 1000);
    await dispatchRun(env, run);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("downstream_paperclip + valid agent_id payload → calls client + writes succeeded", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      agent_id: "agent-eng",
      correlation_id: "c-3",
      state: "succeeded",
      data: { yesterday: ["x"], today: ["y"], blockers: [], confidence: 0.8 },
      sources: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const env = { ...baseEnv, TEAMFORGE_DB: mock.db } as Env;
    const run = await createRun(mock.db, intent("ts-summon-agent", "c-3", "agent-eng"), 1000);
    await dispatchRun(env, run);

    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("succeeded");
    expect(JSON.parse(stored.result_json as string).data.confidence).toBe(0.8);
    const kinds = mock.events.map((e) => e.kind);
    expect(kinds).toContain("downstream_agent_contacted");
    expect(kinds).toContain("result_received");
    expect(kinds).toContain("result_delivered");
  });

  it("downstream_paperclip + missing agent_id payload → writes failed", async () => {
    const env = { ...baseEnv, TEAMFORGE_DB: mock.db } as Env;
    const run = await createRun(mock.db, intent("ts-summon-agent", "c-4"), 1000);  // no agent_id in payload
    await dispatchRun(env, run);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("failed");
    expect(stored.error_code).toBe("missing_agent_id");
    expect(mock.events.map((e) => e.kind)).toContain("failure");
  });

  it("downstream_paperclip + Paperclip 5xx → writes failed with retryable error", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 503 }));
    const env = { ...baseEnv, TEAMFORGE_DB: mock.db } as Env;
    const run = await createRun(mock.db, intent("ts-summon-agent", "c-5", "agent-eng"), 1000);
    await dispatchRun(env, run);
    const stored = mock.runs.get(run.id)!;
    expect(stored.state).toBe("failed");
    expect(stored.error_code).toBe("paperclip_unavailable");
  });
});
