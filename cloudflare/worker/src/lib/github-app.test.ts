import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Env } from "./env";
import {
  GithubAppClient,
  GithubControlPlaneError,
  signConnectState,
  verifyConnectState,
  verifyWebhookSignature,
} from "./github-app";

let privateKeyPem = "";

function base64(bytes: Uint8Array): string {
  let raw = "";
  for (const byte of bytes) raw += String.fromCharCode(byte);
  return btoa(raw);
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  const body = base64(exported).match(/.{1,64}/g)?.join("\n") ?? "";
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${body}\n-----END PRIVATE KEY-----`;
});

function makeEnv(): Env {
  return {
    TF_ENV: "test",
    TF_GITHUB_APP_ID: "12345",
    TF_GITHUB_APP_SLUG: "thoughtseed-test",
    TF_GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    TF_GITHUB_APP_CLIENT_ID: "Iv1.test",
    TF_GITHUB_APP_CLIENT_SECRET: "client-secret",
    TF_GITHUB_APP_CALLBACK_URL: "https://worker.test/v1/github/callback",
  };
}

describe("GitHub App cryptographic boundary", () => {
  it("signs an RS256 app JWT with the configured app id", async () => {
    const token = await new GithubAppClient(makeEnv(), vi.fn() as unknown as typeof fetch).createAppJwt(2_000_000_000);
    const parts = token.split(".");
    expect(parts).toHaveLength(3);
    const decode = (value: string) => JSON.parse(atob(value.replace(/-/g, "+").replace(/_/g, "/")));
    expect(decode(parts[0])).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(parts[1])).toMatchObject({ iss: "12345", iat: 1_999_999_970, exp: 2_000_000_540 });
  });

  it("round-trips only the exact connect-state trust fields and rejects tampering", async () => {
    const secret = "s".repeat(32);
    const state = { workspace: "ws_test", actor: "pid_admin", nonce: "nonce", exp: 2_000_000_000 };
    const signed = await signConnectState(state, secret);
    await expect(verifyConnectState(signed, secret, 1_999_999_900)).resolves.toEqual(state);
    await expect(verifyConnectState(`${signed.slice(0, -1)}x`, secret, 1_999_999_900)).rejects.toMatchObject({ code: "github_state_invalid" });
  });

  it("verifies X-Hub-Signature-256 without exposing the secret", async () => {
    const secret = "webhook-secret";
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode('{"ok":true}')));
    const signature = `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
    await expect(verifyWebhookSignature('{"ok":true}', signature, secret)).resolves.toBe(true);
    await expect(verifyWebhookSignature('{"ok":false}', signature, secret)).resolves.toBe(false);
  });

  it("narrows write tokens to numeric repositories and least permissions", async () => {
    let requestBody: Record<string, unknown> | null = null;
    let apiVersion = "";
    const mockedFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      apiVersion = new Headers(init?.headers).get("x-github-api-version") ?? "";
      return new Response(JSON.stringify({ token: "installation-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
    }) as unknown as typeof fetch;
    const token = await new GithubAppClient(makeEnv(), mockedFetch).createInstallationToken(42, [101, 101], "write");
    expect(token.token).toBe("installation-token");
    expect(requestBody).toEqual({
      repository_ids: [101],
      permissions: { metadata: "read", contents: "write", pull_requests: "write" },
    });
    expect(apiVersion).toBe("2026-03-10");
  });

  it("uses all-selected repositories only for discovery and rejects bad expiry", async () => {
    const bodies: Record<string, unknown>[] = [];
    const mockedFetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ token: "installation-token", expires_at: new Date(Date.now() + 3_700_000).toISOString() }), { status: 201 });
    }) as unknown as typeof fetch;
    const client = new GithubAppClient(makeEnv(), mockedFetch);
    await expect(client.createInstallationToken(42, null, "discovery")).rejects.toBeInstanceOf(GithubControlPlaneError);
    expect(bodies[0]).toEqual({ permissions: { metadata: "read" } });
    await expect(client.createInstallationToken(42, null, "write")).rejects.toMatchObject({ code: "github_scope_invalid" });
  });

  it.each([
    ["read", 77, false],
    ["triage", 77, false],
    ["write", 77, true],
    ["maintain", 77, true],
    ["admin", 77, true],
    ["admin", 88, false],
  ])("requires effective write permission and the immutable GitHub user id: %s/%s", async (permission, userId, expected) => {
    const mockedFetch = vi.fn(async () => new Response(JSON.stringify({ permission, user: { id: userId, login: "installer" } }))) as unknown as typeof fetch;
    const allowed = await new GithubAppClient(makeEnv(), mockedFetch).hasWritePermission("scoped", "thoughtseed", "private-repo", "installer", 77);
    expect(allowed).toBe(expected);
  });
});
