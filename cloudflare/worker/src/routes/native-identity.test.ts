import { describe, expect, it } from "vitest";
import type { D1DatabaseLike, Env } from "../lib/env";
import { handleNativeIdentityLookup } from "./native-identity";

function database(row: Record<string, unknown> | null): D1DatabaseLike {
  return {
    prepare() {
      const statement = {
        bind() {
          return statement;
        },
        async first<T>() {
          return row as T | null;
        },
        async run() {
          return { success: true, meta: { changes: 0 } };
        },
        async all<T>() {
          return { results: [] as T[] };
        },
      };
      return statement;
    },
  };
}

function env(overrides: Partial<Env> = {}): Env {
  return {
    TF_ENV: "test",
    QUESTS: undefined as never,
    TF_NATIVE_IDENTITY_LOOKUP_TOKEN: "native-token",
    TF_NATIVE_TENANT_WORKSPACE_MAP_JSON: JSON.stringify({ cambium: "ws_thoughtseed" }),
    TEAMFORGE_DB: database({
      id: "pid_admin_thoughtseed_labs",
      workspace_id: "ws_thoughtseed",
      role: "admin",
      is_active: 1,
    }),
    ...overrides,
  };
}

function request(path: string, token = "native-token"): Request {
  return new Request(`https://plexus.test${path}`, {
    method: "GET",
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("native Plexus identity lookup", () => {
  it("returns the narrow active identity contract for an enrolled tenant", async () => {
    const response = await handleNativeIdentityLookup(
      env(),
      request("/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      data: {
        contractVersion: "plexus.native-identity.v1",
        identityId: "pid_admin_thoughtseed_labs",
        tenantId: "cambium",
        workspaceId: "ws_thoughtseed",
        role: "admin",
        active: true,
        enrolled: true,
      },
    });
  });

  it("rejects missing or incorrect dedicated credentials", async () => {
    const missing = await handleNativeIdentityLookup(
      env(),
      new Request("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );
    expect(missing.status).toBe(401);

    const wrong = await handleNativeIdentityLookup(
      env(),
      request("/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium", "wrong"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );
    expect(wrong.status).toBe(403);
  });

  it("does not enroll an identity from a different workspace or inactive row", async () => {
    const foreign = await handleNativeIdentityLookup(
      env({
        TEAMFORGE_DB: database({
          id: "pid_admin_thoughtseed_labs",
          workspace_id: "ws_other",
          role: "admin",
          is_active: 1,
        }),
      }),
      request("/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );
    expect(foreign.status).toBe(404);

    const inactive = await handleNativeIdentityLookup(
      env({
        TEAMFORGE_DB: database({
          id: "pid_admin_thoughtseed_labs",
          workspace_id: "ws_thoughtseed",
          role: "admin",
          is_active: 0,
        }),
      }),
      request("/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );
    expect(inactive.status).toBe(404);
  });

  it("stays unavailable when explicit tenant enrollment is malformed or absent", async () => {
    const response = await handleNativeIdentityLookup(
      env({ TF_NATIVE_TENANT_WORKSPACE_MAP_JSON: "not-json" }),
      request("/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
      "pid_admin_thoughtseed_labs",
      new URL("https://plexus.test/v1/native/identity/pid_admin_thoughtseed_labs?tenant_id=cambium"),
    );
    expect(response.status).toBe(503);
  });
});
