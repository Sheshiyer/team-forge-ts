import { describe, it, expect } from "vitest";
import { verifyMultiCaCallback } from "./auth-multica";
import type { Env } from "./env";

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

describe("verifyMultiCaCallback", () => {
  const envOk = { TF_ENV: "test", MULTICA_CALLBACK_SHARED_SECRET: "test-secret-1234" } as unknown as Env;

  it("returns 503 server_misconfigured when secret is missing", async () => {
    const envBad = { TF_ENV: "test" } as unknown as Env;
    const req = new Request("https://x/v1/commands/runs/run_1/result", {
      method: "POST",
      body: "{}",
    });
    const result = await verifyMultiCaCallback(req, envBad);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(503);
    }
  });

  it("returns 401 missing_signature when X-MultiCA-Signature absent", async () => {
    const req = new Request("https://x/v1/commands/runs/run_1/result", {
      method: "POST",
      body: "{}",
    });
    const result = await verifyMultiCaCallback(req, envOk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
    }
  });

  it("returns 403 invalid_signature when signature does not match body", async () => {
    const req = new Request("https://x/v1/commands/runs/run_1/result", {
      method: "POST",
      body: '{"hello":"world"}',
      headers: { "X-MultiCA-Signature": "deadbeef" },
    });
    const result = await verifyMultiCaCallback(req, envOk);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
    }
  });

  it("returns ok + body string when signature is valid", async () => {
    const body = '{"run_id":"run_1","correlation_id":"c-1","state":"succeeded"}';
    const sig = await signHex("test-secret-1234", body);
    const req = new Request("https://x/v1/commands/runs/run_1/result", {
      method: "POST",
      body,
      headers: { "X-MultiCA-Signature": sig },
    });
    const result = await verifyMultiCaCallback(req, envOk);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.body).toBe(body);
  });
});
