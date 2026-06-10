/**
 * Founder secrets layer — /v1/secrets/*
 *
 * Identity-bound secret storage for the two co-founders, backed by KV with
 * AES-256-GCM envelope encryption. This is the canonical place for API keys and
 * tokens that need to sync between founders and be readable by agents.
 *
 * AUTHZ MATRIX (enforced below; see lib/access-jwt.ts for principal resolution):
 *
 *   principal      | founder:{self} | founder:{other} | shared | agents
 *   ---------------|----------------|-----------------|--------|-------
 *   founder        | read+write     | (no access)     | r+w    | r+w
 *   service token  | -              | -               | -      | read
 *   internal secret| -              | -               | -      | read
 *   anonymous      | 401            | 401             | 401    | 401
 *
 * Scopes:
 *   founder/<email>/<name>  — private to one founder
 *   shared/<name>           — both founders, read+write
 *   agents/<name>           — both founders r+w; agents read-only
 *
 * Routes:
 *   GET    /v1/secrets/:scope                  list names+metadata (never values)
 *   GET    /v1/secrets/:scope/:name            read one (decrypted value)
 *   PUT    /v1/secrets/:scope/:name            create/update (body { value })
 *   DELETE /v1/secrets/:scope/:name            delete one
 *
 * For founder scope, the request path uses the literal segment "me" which is
 * resolved server-side to the caller's own founder email. A founder cannot name
 * another founder's email in the path — "me" is the only accepted form, so the
 * cross-founder namespace is unaddressable (RedTeam S4).
 */

import type { Env, KVNamespaceLike } from "../lib/env";
import { jsonError, jsonOk } from "../lib/response";
import { resolvePrincipal, type Principal } from "../lib/access-jwt";
import { maskValue, openSecret, sealSecret } from "../lib/secrets-crypto";

const VALID_SCOPES = new Set(["me", "shared", "agents"]);
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

interface SecretMetadata {
  name: string;
  scope: string; // resolved storage scope segment (founder/<email> | shared | agents)
  created_by: string;
  updated_by: string;
  updated_at: string;
  version: number;
  masked: string;
  [key: string]: unknown; // satisfy KV metadata Record<string, unknown> contract
}

function notFound(): Response {
  // Uniform 404 for "absent or not yours" — no existence oracle (RedTeam S8).
  return jsonError({ code: "not_found", message: "Secret not found.", retryable: false }, 404);
}

function unauthorized(): Response {
  return jsonError(
    { code: "unauthorized", message: "Valid founder identity required.", retryable: false },
    401,
  );
}

function forbidden(): Response {
  return jsonError(
    { code: "forbidden", message: "Principal not permitted for this scope.", retryable: false },
    403,
  );
}

function serverMisconfigured(what: string): Response {
  return jsonError(
    { code: "server_misconfigured", message: `Secrets layer not configured: ${what}.`, retryable: false },
    503,
  );
}

/**
 * Map a request scope segment ("me" | "shared" | "agents") + principal to the
 * physical KV scope prefix, applying the authz matrix. Returns null if the
 * principal may not use that scope for the given access mode.
 */
function resolveScope(
  requestScope: string,
  principal: Principal,
  mode: "read" | "write",
): string | null {
  if (requestScope === "me") {
    if (principal.kind !== "founder") return null;
    return `founder/${principal.email}`;
  }
  if (requestScope === "shared") {
    if (principal.kind !== "founder") return null; // agents have no shared access
    return "shared";
  }
  if (requestScope === "agents") {
    if (principal.kind === "founder") return "agents";
    if (principal.kind === "agent") return mode === "read" ? "agents" : null;
    return null;
  }
  return null;
}

function kvKey(scopePrefix: string, name: string): string {
  return `secret/${scopePrefix}/${name}`;
}

export async function handleSecretsRequest(
  request: Request,
  env: Env,
  url: URL,
  method: string,
): Promise<Response> {
  if (!env.SECRETS_KV) return serverMisconfigured("KV binding missing");
  if (!env.TF_SECRETS_MASTER_KEY) return serverMisconfigured("master key missing");
  if (!env.TF_ACCESS_TEAM_DOMAIN) return serverMisconfigured("team domain missing");
  const kv = env.SECRETS_KV as KVNamespaceLike;
  const masterKey = env.TF_SECRETS_MASTER_KEY;

  const principal = await resolvePrincipal(request, env);
  if (principal.kind === "anonymous") return unauthorized();

  // Parse /v1/secrets/<scope>[/<name>]
  const rest = url.pathname.replace(/^\/v1\/secrets\/?/, "");
  const segments = rest.split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  const requestScope = segments[0];
  const name = segments[1];

  if (!requestScope || !VALID_SCOPES.has(requestScope)) {
    return jsonError(
      { code: "invalid_scope", message: "Scope must be one of: me, shared, agents.", retryable: false },
      400,
    );
  }
  if (segments.length > 2) {
    return jsonError(
      { code: "invalid_path", message: "Secret path is /v1/secrets/<scope>/<name>.", retryable: false },
      400,
    );
  }
  if (name !== undefined && !NAME_RE.test(name)) {
    return jsonError(
      { code: "invalid_name", message: "Secret name has invalid characters.", retryable: false },
      400,
    );
  }

  // LIST
  if (method === "GET" && name === undefined) {
    const scopePrefix = resolveScope(requestScope, principal, "read");
    if (!scopePrefix) return forbidden();
    const listed = await kv.list({ prefix: `secret/${scopePrefix}/` });
    const secrets = listed.keys.map((k) => (k.metadata ?? {}) as Partial<SecretMetadata>);
    return jsonOk({ scope: requestScope, secrets });
  }

  // READ ONE
  if (method === "GET") {
    const scopePrefix = resolveScope(requestScope, principal, "read");
    if (!scopePrefix) return forbidden();
    const key = kvKey(scopePrefix, name!);
    const { value, metadata } = await kv.getWithMetadata<SecretMetadata>(key);
    if (!value || !metadata) return notFound();
    const plaintext = await openSecret(value, key, metadata.version, masterKey);
    if (plaintext === null) {
      return jsonError(
        { code: "decrypt_failed", message: "Stored secret could not be opened.", retryable: false },
        500,
      );
    }
    return jsonOk({ name: name!, scope: requestScope, value: plaintext, metadata });
  }

  // WRITE
  if (method === "PUT") {
    const scopePrefix = resolveScope(requestScope, principal, "write");
    if (!scopePrefix) return forbidden();

    let body: { value?: unknown };
    try {
      body = (await request.json()) as { value?: unknown };
    } catch {
      return jsonError({ code: "invalid_json", message: "Body must be JSON.", retryable: false }, 400);
    }
    if (typeof body.value !== "string" || body.value.length === 0) {
      return jsonError(
        { code: "invalid_value", message: "Body.value must be a non-empty string.", retryable: false },
        400,
      );
    }
    if (body.value.length > 24 * 1024) {
      return jsonError(
        { code: "value_too_large", message: "Secret value exceeds 24KB.", retryable: false },
        413,
      );
    }

    const key = kvKey(scopePrefix, name!);
    const existing = await kv.getWithMetadata<SecretMetadata>(key);
    const prior = existing.metadata;
    const version = (prior?.version ?? 0) + 1;
    const writer = principal.kind === "founder" ? principal.email : `agent:${principal.commonName}`;

    const sealed = await sealSecret(body.value, key, version, masterKey);
    const metadata: SecretMetadata = {
      name: name!,
      scope: scopePrefix,
      created_by: prior?.created_by ?? writer,
      updated_by: writer,
      updated_at: new Date().toISOString(),
      version,
      masked: maskValue(body.value),
    };
    await kv.put(key, sealed, { metadata });
    return jsonOk({ name: name!, scope: requestScope, version, masked: metadata.masked });
  }

  // DELETE
  if (method === "DELETE") {
    const scopePrefix = resolveScope(requestScope, principal, "write");
    if (!scopePrefix) return forbidden();
    const key = kvKey(scopePrefix, name!);
    const existing = await kv.getWithMetadata<SecretMetadata>(key);
    if (!existing.value) return notFound();
    await kv.delete(key);
    return jsonOk({ name: name!, scope: requestScope, deleted: true });
  }

  return jsonError(
    { code: "method_not_allowed", message: `${method} not allowed on secrets.`, retryable: false },
    405,
  );
}
