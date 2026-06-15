import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { requestPaperclipStandup, parseAgentTokenMap } from "./paperclip-client";
import type { Env } from "./env";

describe("parseAgentTokenMap", () => {
  it("returns empty map when env var missing", () => {
    expect(parseAgentTokenMap(undefined)).toEqual({});
  });
  it("returns empty map when JSON malformed", () => {
    expect(parseAgentTokenMap("not json")).toEqual({});
  });
  it("returns parsed map when JSON is a flat string→string object", () => {
    expect(parseAgentTokenMap('{"a":"1","b":"2"}')).toEqual({ a: "1", b: "2" });
  });
  it("filters out non-string values", () => {
    expect(parseAgentTokenMap('{"a":"1","b":7,"c":null,"d":"x"}')).toEqual({ a: "1", d: "x" });
  });
});

describe("requestPaperclipStandup", () => {
  const env: Env = {
    TF_ENV: "test",
    PAPERCLIP_REMOTE_BASE_URL: "https://paperclip.test",
    PAPERCLIP_AGENT_TOKEN_MAP: '{"agent-a":"tok-a"}',
  } as unknown as Env;

  let fetchSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });
  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("returns ok response on 200", async () => {
    fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({
      agent_id: "agent-a",
      correlation_id: "c-1",
      state: "succeeded",
      data: { yesterday: [], today: [], blockers: [], confidence: 0 },
      sources: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const r = await requestPaperclipStandup(env, {
      agent_id: "agent-a",
      scope: { project_id: "p-1" },
      correlation_id: "c-1",
      requester: { kind: "teamforge_worker", identity: "worker" },
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.state).toBe("succeeded");
    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toBe("https://paperclip.test/api/agents/agent-a/standup");
    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect((init.headers as Record<string, string>)["authorization"]).toBe("Bearer tok-a");
  });

  it("retries once on 5xx then returns the second response", async () => {
    fetchSpy
      .mockResolvedValueOnce(new Response("upstream busy", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        agent_id: "agent-a",
        correlation_id: "c-1",
        state: "succeeded",
        sources: [],
      }), { status: 200, headers: { "content-type": "application/json" } }));

    const r = await requestPaperclipStandup(env, {
      agent_id: "agent-a",
      scope: {},
      correlation_id: "c-1",
      requester: { kind: "teamforge_worker", identity: "worker" },
    });
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(true);
  });

  it("returns failure when both retries 5xx", async () => {
    fetchSpy.mockResolvedValue(new Response("nope", { status: 503 }));
    const r = await requestPaperclipStandup(env, {
      agent_id: "agent-a",
      scope: {},
      correlation_id: "c-1",
      requester: { kind: "teamforge_worker", identity: "worker" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("paperclip_unavailable");
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("returns failure when agent has no token in env", async () => {
    const r = await requestPaperclipStandup(env, {
      agent_id: "agent-unknown",
      scope: {},
      correlation_id: "c-1",
      requester: { kind: "teamforge_worker", identity: "worker" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("agent_token_missing");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns failure when PAPERCLIP_REMOTE_BASE_URL is unset", async () => {
    const envBad = { ...env, PAPERCLIP_REMOTE_BASE_URL: undefined } as Env;
    const r = await requestPaperclipStandup(envBad, {
      agent_id: "agent-a",
      scope: {},
      correlation_id: "c-1",
      requester: { kind: "teamforge_worker", identity: "worker" },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.code).toBe("paperclip_base_url_missing");
  });
});
