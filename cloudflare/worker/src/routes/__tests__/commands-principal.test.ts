import { beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../../lib/env";
import { makeMockDb, type MockDbHandle } from "../../lib/test-utils/mock-d1";
import { handleV1Request } from "../v1";

function commandRequest(
  headers: HeadersInit,
  overrides: Partial<{
    actor_id: string;
    actor_kind: string;
    auth_mode: string;
  }> = {},
): Request {
  return new Request("https://x/v1/commands/intent", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({
      id: "ts-standup",
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
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain(
      "claimed actor_kind founder does not match authenticated actor_kind multica_service",
    );
    expect(mock.runs.size).toBe(0);
  });

  it("keeps an app bearer unauthorized even when its service claim matches", async () => {
    const request = commandRequest(
      { authorization: "Bearer app-token" },
      { actor_kind: "multica_service", auth_mode: "app_bearer" },
    );
    const response = await handleV1Request(request, env, new URL(request.url));

    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe("forbidden");
    expect(body.error.message).toContain(
      "authenticated actor_kind multica_service not allowed for ts-standup",
    );
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
});
