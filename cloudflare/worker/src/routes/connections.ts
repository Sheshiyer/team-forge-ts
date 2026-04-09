import type { Env } from "../lib/env";
import { execute, nanoid, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

type Source = "clockify" | "huly" | "slack";

interface Connection {
  id: string;
  workspace_id: string;
  source: string;
  connection_mode: string;
  status: string;
  masked_identity: string | null;
  last_tested_at: string | null;
  last_synced_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

async function testClockify(token: string): Promise<{ ok: boolean; identity?: string; error?: string }> {
  try {
    const res = await fetch("https://api.clockify.me/api/v1/user", {
      headers: { "X-Api-Key": token },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const data = await res.json() as { email?: string };
    return { ok: true, identity: data.email };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testHuly(token: string): Promise<{ ok: boolean; identity?: string; error?: string }> {
  try {
    const configRes = await fetch("https://huly.app/config.json");
    if (!configRes.ok) return { ok: false, error: "Could not reach Huly config" };
    const config = await configRes.json() as { ACCOUNTS_URL?: string };
    const accountsUrl = config.ACCOUNTS_URL ?? "https://accounts.huly.app";
    const res = await fetch(`${accountsUrl}/api/v1/profile`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, identity: "huly-user" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

async function testSlack(token: string): Promise<{ ok: boolean; identity?: string; error?: string }> {
  try {
    const res = await fetch("https://slack.com/api/auth.test", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    });
    const data = await res.json() as { ok: boolean; user?: string; error?: string };
    if (!data.ok) return { ok: false, error: data.error };
    return { ok: true, identity: data.user };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function handleGetConnections(env: Env, url: URL): Promise<Response> {
  if (!env.TEAMFORGE_DB) return jsonError({ code: "db_unavailable", message: "Database not available.", retryable: true }, 503);

  const workspaceId = url.searchParams.get("workspace_id");
  const connections = workspaceId
    ? await queryAll<Connection>(env.TEAMFORGE_DB, "SELECT * FROM integration_connections WHERE workspace_id = ? ORDER BY source", workspaceId)
    : await queryAll<Connection>(env.TEAMFORGE_DB, "SELECT * FROM integration_connections ORDER BY source");

  return jsonOk({ connections });
}

export async function handleTestConnection(env: Env, source: string, request: Request): Promise<Response> {
  if (!["clockify", "huly", "slack"].includes(source)) {
    return jsonError({ code: "unknown_source", message: `Unknown source: ${source}`, retryable: false }, 400);
  }

  let body: { workspace_id?: string; token?: string } = {};
  try {
    body = await request.json();
  } catch {
    // token may come from global secrets
  }

  const src = source as Source;
  const token =
    body.token ??
    (src === "clockify" ? env.TF_CLOCKIFY_API_TOKEN_GLOBAL : src === "huly" ? env.TF_HULY_USER_TOKEN_GLOBAL : env.TF_SLACK_BOT_TOKEN_GLOBAL);

  if (!token) {
    return jsonError({ code: "no_token", message: `No token available for ${source}. Provide one in the request body or configure a global secret.`, retryable: false }, 400);
  }

  const result =
    src === "clockify" ? await testClockify(token) : src === "huly" ? await testHuly(token) : await testSlack(token);

  if (env.TEAMFORGE_DB && body.workspace_id) {
    const existing = await queryFirst<Connection>(
      env.TEAMFORGE_DB,
      "SELECT id FROM integration_connections WHERE workspace_id = ? AND source = ?",
      body.workspace_id,
      source,
    );
    const ts = now();
    if (existing) {
      await execute(
        env.TEAMFORGE_DB,
        "UPDATE integration_connections SET status = ?, masked_identity = ?, last_tested_at = ?, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE id = ?",
        result.ok ? "connected" : "error",
        result.identity ?? null,
        ts,
        result.ok ? null : "test_failed",
        result.ok ? null : (result.error ?? null),
        ts,
        existing.id,
      );
    } else {
      await execute(
        env.TEAMFORGE_DB,
        "INSERT INTO integration_connections (id, workspace_id, source, connection_mode, status, masked_identity, last_tested_at, last_error_code, last_error_message, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        nanoid(),
        body.workspace_id,
        source,
        "global_secret",
        result.ok ? "connected" : "error",
        result.identity ?? null,
        ts,
        result.ok ? null : "test_failed",
        result.ok ? null : (result.error ?? null),
        ts,
        ts,
      );
    }
  }

  return jsonOk({ source, ok: result.ok, identity: result.identity ?? null, error: result.error ?? null });
}
