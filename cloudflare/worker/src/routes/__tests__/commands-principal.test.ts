import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../lib/env";
import { makeMockDb, type MockDbHandle } from "../../lib/test-utils/mock-d1";
import { handleV1Request } from "../v1";

function commandRequest(
  headers: HeadersInit,
  overrides: Partial<{
    id: string;
    actor_id: string;
    actor_kind: string;
    auth_mode: string;
  }> = {},
): Request {
  return new Request("https://x/v1/commands/intent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      id: "ts-trace-signal",
      actor_id: "claimed-founder",
      actor_kind: "founder",
      auth_mode: "cf_access",
      correlation_id: "principal-route-test",
      payload: {},
      ...overrides,
    }),
  });
}

describe("command principal derivation", () => {
  let mock: MockDbHandle;
  let env: Env;

  beforeEach(() => {
    mock = makeMockDb();
    env = {
      TF_ENV: "test",
      TEAMFORGE_DB: mock.db,
      TF_CREDENTIAL_ENVELOPE_KEY: "app-token",
      TF_INTERNAL_SHARED_SECRET: "internal-token",
    } as Env;
  });

  it("rejects an app bearer that claims founder authority", async () => {
    const request = commandRequest({ authorization: "Bearer app-token" });
    const response = await handleV1Request(request, env, new URL(request.url));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("command_identity_required");
    expect(body.error.message).toContain("registered Access identity");
    expect(mock.runs.size).toBe(0);
  });

  it("keeps an app bearer unauthorized even when its body claim is non-founder", async () => {
    const request = commandRequest(
      { authorization: "Bearer app-token" },
      { actor_kind: "employee", auth_mode: "app_bearer" },
    );
    const response = await handleV1Request(request, env, new URL(request.url));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("command_identity_required");
    expect(mock.runs.size).toBe(0);
  });

  it("preserves the internal Hermes operator path with server-owned attribution", async () => {
    const request = commandRequest({ "x-teamforge-internal-secret": "internal-token" });
    const response = await handleV1Request(request, env, new URL(request.url));

    expect(response.status).toBe(201);
    const [run] = [...mock.runs.values()];
    expect(run.actor_id).toBe("teamforge_internal_operator");
    expect(run.actor_kind).toBe("founder");
    expect(run.auth_mode).toBe("m2m");
    expect(run.actor_id).not.toBe("claimed-founder");
  });

  it("fails retired commands closed before creating a run", async () => {
    const request = commandRequest(
      { "x-teamforge-internal-secret": "internal-token" },
      { id: "ts-standup" },
    );
    const response = await handleV1Request(request, env, new URL(request.url));

    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("command_retired");
    expect(body.error.message).toContain("Hermes /ts-standup");
    expect(mock.runs.size).toBe(0);
  });

  it("returns the retired tombstone before any D1 access or identity provisioning", async () => {
    let prepareCalls = 0;
    const noAccessDb = {
      prepare() {
        prepareCalls += 1;
        throw new Error("retired command touched D1");
      },
    };
    const request = commandRequest(
      { "cf-access-jwt-assertion": "would-normally-resolve-an-access-principal" },
      { id: "ts-standup" },
    );
    const response = await handleV1Request(
      request,
      { ...env, TEAMFORGE_DB: noAccessDb } as unknown as Env,
      new URL(request.url),
    );

    expect(response.status).toBe(410);
    expect(prepareCalls).toBe(0);
  });

  it("returns a credential-free tombstone for the retired result callback", async () => {
    let prepareCalls = 0;
    const noAccessDb = {
      prepare() {
        prepareCalls += 1;
        throw new Error("retired callback touched D1");
      },
    };
    const request = new Request("https://x/v1/commands/runs/run_stale/result", {
      method: "POST",
      headers: { "cf-access-jwt-assertion": "would-normally-resolve-an-access-principal" },
      body: JSON.stringify({ state: "succeeded" }),
    });
    const response = await handleV1Request(
      request,
      { ...env, TEAMFORGE_DB: noAccessDb } as unknown as Env,
      new URL(request.url),
    );

    expect(response.status).toBe(410);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("callback_retired");
    expect(mock.runs.size).toBe(0);
    expect(prepareCalls).toBe(0);

    const secondRequest = new Request("https://x/v1/commands/runs/run_other/result", {
      method: "POST",
      headers: { "x-stale-callback-signature": "ignored" },
      body: JSON.stringify({ state: "failed", result: { arbitrary: true } }),
    });
    const secondResponse = await handleV1Request(secondRequest, env, new URL(secondRequest.url));
    expect(secondResponse.status).toBe(410);
    expect(await secondResponse.json()).toEqual(body);
    expect(mock.runs.size).toBe(0);
  });
});
