import { beforeAll, describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env } from "../../lib/env";
import type { PlexusPrincipal } from "../../lib/plexus-session";
import { handleGithubActivitySync, handleGithubActor, handleGithubActorEnrollStart, handleGithubCallback, handleGithubConnection, handleGithubConnectStart, handleGithubPullRequest, handleGithubRepositories, handleGithubRepoVerify, handleGithubWebhook, nextInstallationState, reconcileBinding, validateWriteFiles } from "../github";
import { sha256Hex, signConnectState, verifyConnectState } from "../../lib/github-app";

let privateKeyPem = "";

const requiredInstallationPermissions = {
  actions: "read",
  checks: "read",
  contents: "write",
  issues: "read",
  metadata: "read",
  pull_requests: "write",
} as const;
const requiredInstallationPermissionsJson = JSON.stringify(requiredInstallationPermissions);

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const exported = new Uint8Array(await crypto.subtle.exportKey("pkcs8", pair.privateKey));
  let raw = "";
  for (const byte of exported) raw += String.fromCharCode(byte);
  privateKeyPem = `-----BEGIN PRIVATE KEY-----\n${(btoa(raw).match(/.{1,64}/g) ?? []).join("\n")}\n-----END PRIVATE KEY-----`;
});

function principal(role: "employee" | "admin" = "employee"): PlexusPrincipal {
  return {
    identityId: role === "admin" ? "pid_admin" : "pid_member",
    email: `${role}@example.test`,
    displayName: role,
    workspaceId: "ws_test",
    role,
    projectVisibility: role === "admin" ? "all" : "active",
    employeeId: role === "admin" ? null : "emp_member",
    capabilities: {},
  };
}

function activityDb(installationId = 42): D1DatabaseLike {
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM projects WHERE id")) return ({ id: args[0] } as T);
          if (sql.includes("FROM github_workspace_installations b")) {
            return ({ workspace_id: "ws_test", installation_id: installationId, connected_by_identity_id: "pid_admin", verified_github_user_id: 7, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" } as T);
          }
          if (sql.includes("FROM project_github_verifications v")) {
            return ({ project_id: "proj_test", workspace_id: "ws_test", installation_id: installationId, repository_id: 101, repo_owner: "thoughtseed", repo_name: "private-repo", default_branch: "main", verified_at: "2026-07-13T00:00:00.000Z", owner_login: "thoughtseed", name: "private-repo", full_name: "thoughtseed/private-repo", is_private: 1, state: "active" } as T);
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_workspace_installations b")) {
            return { results: [{ workspace_id: "ws_test", installation_id: installationId, account_id: 8, account_login: "thoughtseed", account_type: "Organization", connected_by_identity_id: "pid_admin", verified_github_user_id: 7, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

async function webhookSignature(payload: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)));
  return `sha256=${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function deliveryDb(initial?: { event: string; hash: string; result: string; processingStartedAt: string }): D1DatabaseLike {
  const deliveries = new Map<string, { event_name: string; payload_sha256: string; result: string; processing_started_at: string }>();
  if (initial) deliveries.set("delivery-stale", { event_name: initial.event, payload_sha256: initial.hash, result: initial.result, processing_started_at: initial.processingStartedAt });
  return {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM github_webhook_deliveries")) return ((deliveries.get(String(args[0])) ?? null) as T | null);
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_workspace_installations b")) {
            return { results: [{ workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected" }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO github_webhook_deliveries")) {
            const id = String(args[0]);
            if (deliveries.has(id)) return { success: true, meta: { changes: 0 } };
            deliveries.set(id, { event_name: String(args[1]), payload_sha256: String(args[2]), result: "processing", processing_started_at: String(args[4]) });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("result = 'processing'") && sql.includes("attempt_count")) {
            const id = String(args[1]);
            const delivery = deliveries.get(id);
            const cutoff = Date.parse(String(args[2]));
            if (!delivery || (delivery.result === "processing" && Date.parse(delivery.processing_started_at) >= cutoff)) return { success: true, meta: { changes: 0 } };
            delivery.result = "processing";
            delivery.processing_started_at = String(args[0]);
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("result = 'ping'")) {
            const delivery = deliveries.get(String(args[1]));
            if (delivery) delivery.result = "ping";
          }
          if (sql.includes("result = 'failed'")) {
            const delivery = deliveries.get(String(args[1] ?? args[0]));
            if (delivery) delivery.result = "failed";
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
}

function recordingDeliveryDb(): { db: D1DatabaseLike; runs: Array<{ sql: string; args: unknown[] }> } {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const deliveries = new Map<string, { event_name: string; payload_sha256: string; result: string; processing_started_at: string }>();
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM github_webhook_deliveries")) return ((deliveries.get(String(args[0])) ?? null) as T | null);
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_workspace_installations b")) {
            return { results: [{ workspace_id: "ws_test", installation_id: 42, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", account_id: 8, account_login: "thoughtseed", account_type: "Organization" }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          runs.push({ sql, args: [...args] });
          if (sql.includes("INSERT OR IGNORE INTO github_webhook_deliveries")) {
            deliveries.set(String(args[0]), { event_name: String(args[1]), payload_sha256: String(args[2]), result: "processing", processing_started_at: String(args[4]) });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, runs };
}

function writeDb(existing: Record<string, unknown> | null = null, installationId = 42): { db: D1DatabaseLike; runs: Array<{ sql: string; args: unknown[] }> } {
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM projects WHERE id")) return ({ id: args[0] } as T);
          if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
          if (sql.includes("FROM github_workspace_actors")) return ({ workspace_id: "ws_test", plexus_identity_id: "pid_admin", github_user_id: 77, github_login: "installer", verified_at: "2026-07-13T00:00:00.000Z", verification_source: "oauth" } as T);
          if (sql.includes("FROM github_workspace_installations b")) return ({ workspace_id: "ws_test", installation_id: installationId, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" } as T);
          if (sql.includes("FROM project_github_verifications v")) return ({ project_id: "proj_test", workspace_id: "ws_test", installation_id: installationId, repository_id: 101, repo_owner: "thoughtseed", repo_name: "private-repo", default_branch: "main", verified_at: "2026-07-13T00:00:00.000Z", owner_login: "thoughtseed", name: "private-repo", full_name: "thoughtseed/private-repo", is_private: 1, state: "active" } as T);
          if (sql.includes("FROM github_write_operations")) return (existing as T | null);
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_workspace_installations b")) {
            return { results: [{ workspace_id: "ws_test", installation_id: installationId, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" }] as T[] };
          }
          return { results: [] as T[] };
        },
        async run() { runs.push({ sql, args: [...args] }); return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  return { db, runs };
}

function writeRequest(files: Array<{ path: string; content: string }> = [{ path: "src/proof.ts", content: "export const proof = true;" }]): Request {
  return new Request("https://worker.test/v1/projects/proj_test/github-pull-requests", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ repositoryId: 101, baseSha: "b".repeat(40), title: "Add private proof", body: "Bounded PR body", commitMessage: "feat: add private proof", files }),
  });
}

function guardedWriteFetch(permission: unknown, options: { staleBase?: boolean; finalRace?: boolean } = {}) {
  const mutations: Array<{ url: string; body: Record<string, unknown> }> = [];
  let tokenRequest: Record<string, unknown> | null = null;
  let tokenUrl: string | null = null;
  let defaultRefReads = 0;
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    if (url.includes("/access_tokens")) {
      tokenUrl = url;
      tokenRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ token: "write-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
    }
    if (url.includes("/collaborators/installer/permission")) return new Response(JSON.stringify(permission));
    if (url === "https://api.github.com/repos/thoughtseed/private-repo") return new Response(JSON.stringify({ id: 101, name: "private-repo", full_name: "thoughtseed/private-repo", private: true, default_branch: "main", owner: { id: 8, login: "thoughtseed" } }));
    if (url.includes("/git/ref/heads/plexus%2F")) return new Response(JSON.stringify({ message: "Not Found" }), { status: 404 });
    if (url.endsWith("/git/ref/heads/main")) {
      defaultRefReads += 1;
      const sha = options.staleBase || (options.finalRace && defaultRefReads > 1) ? "d".repeat(40) : "b".repeat(40);
      return new Response(JSON.stringify({ object: { sha } }));
    }
    if (url.endsWith(`/git/commits/${"b".repeat(40)}`) && method === "GET") return new Response(JSON.stringify({ tree: { sha: "t".repeat(40) } }));
    if (url.endsWith("/git/blobs") && method === "POST") {
      mutations.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ sha: "e".repeat(40) }), { status: 201 });
    }
    if (url.endsWith("/git/trees") && method === "POST") {
      mutations.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ sha: "f".repeat(40) }), { status: 201 });
    }
    if (url.endsWith("/git/commits") && method === "POST") {
      mutations.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ sha: "c".repeat(40) }), { status: 201 });
    }
    if (url.endsWith("/git/refs") && method === "POST") {
      mutations.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ ref: "refs/heads/plexus/proof" }), { status: 201 });
    }
    if (url.endsWith("/pulls") && method === "POST") {
      mutations.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify({ number: 9, html_url: "https://github.test/pulls/9" }), { status: 201 });
    }
    throw new Error(`unexpected fetch ${method} ${url}`);
  });
  return { fetcher, mutations, tokenRequest: () => tokenRequest, tokenUrl: () => tokenUrl };
}

function reconciliationDb(
  repositorySelection: string,
  actorActive: boolean,
  organization: { id: number; login: string; type: string } = { id: 8, login: "thoughtseed", type: "Organization" },
) {
  let bound = false;
  const state = { nonce_hash: "nonce-hash", workspace_id: "ws_test", plexus_actor_id: "pid_admin", expires_at: Math.floor(Date.now() / 1000) + 600, consumed_at: "now", oauth_user_id: 77, oauth_login: "installer", oauth_verified_at: "now", untrusted_installation_id: 42, target_account_id: 8, target_account_login: "thoughtseed", target_account_type: "Organization", status: "oauth_verified" };
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM github_connection_states")) return ({ ...state } as T);
          if (sql.includes("FROM plexus_identities")) return (actorActive ? ({ id: "pid_admin" } as T) : null);
          if (sql.includes("FROM github_installation_facts")) return ({ installation_id: Number(args[0]), installer_sender_id: 77, account_id: organization.id, account_login: organization.login, account_type: organization.type, repository_selection: repositorySelection, permissions_json: requiredInstallationPermissionsJson, state: "active" } as T);
          if (sql.includes("FROM github_workspace_actors")) return null;
          if (sql.includes("FROM github_workspace_installations")) return null;
          return null;
        },
        async all<T>() { return { results: [] as T[] }; },
        async run() {
          if (sql.includes("INSERT INTO github_workspace_installations")) bound = true;
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, wasBound: () => bound };
}

function recoveryReconciliationDb(
  facts: Array<{
    installation_id: number;
    installer_sender_id: number;
    account_id: number;
    account_login: string;
    account_type: string;
    repository_selection: string;
    permissions_json: string;
    state: string;
  }>,
  installationHint = 999,
  hintRepairChanges = 1,
) {
  let boundInstallationId: number | null = null;
  const state = {
    nonce_hash: "nonce-recovery",
    workspace_id: "ws_test",
    plexus_actor_id: "pid_admin",
    expires_at: Math.floor(Date.now() / 1000) + 600,
    consumed_at: "now",
    oauth_user_id: 77,
    oauth_login: "installer",
    oauth_verified_at: "now",
    untrusted_installation_id: installationHint,
    target_account_id: 8,
    target_account_login: "thoughtseed",
    target_account_type: "Organization",
    status: "oauth_verified",
  };
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM github_connection_states")) return ({ ...state } as T);
          if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
          if (sql.includes("FROM github_installation_facts") && sql.includes("installation_id = ?")) {
            return ((facts.find((fact) => fact.installation_id === Number(args[0])) ?? null) as T | null);
          }
          if (sql.includes("FROM github_workspace_actors")) return null;
          if (sql.includes("FROM github_workspace_installations")) return null;
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_installation_facts") && sql.includes("account_id = ?")) {
            return {
              results: facts.filter((fact) => fact.account_id === Number(args[0]) &&
                fact.account_login.toLowerCase() === String(args[1]).toLowerCase() &&
                fact.account_type === args[2] && fact.installer_sender_id === Number(args[3]) &&
                (fact.repository_selection === "selected" || fact.repository_selection === "all") && fact.state !== "deleted") as T[],
            };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("SET untrusted_installation_id") && sql.includes("status = 'oauth_verified'")) {
            return { success: true, meta: { changes: hintRepairChanges } };
          }
          if (sql.includes("INSERT INTO github_workspace_installations")) boundInstallationId = Number(args[1]);
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, boundInstallationId: () => boundInstallationId };
}

function connectionFlowDb(nonceHash: string) {
  const state: Record<string, unknown> = {
    nonce_hash: nonceHash,
    workspace_id: "ws_test",
    plexus_actor_id: "pid_admin",
    expires_at: Math.floor(Date.now() / 1000) + 600,
    consumed_at: null,
    oauth_user_id: null,
    oauth_login: null,
    oauth_verified_at: null,
    untrusted_installation_id: null,
    target_account_id: 8,
    target_account_login: "thoughtseed",
    target_account_type: "Organization",
    status: "pending_oauth",
  };
  let fact: Record<string, unknown> | null = null;
  let binding: Record<string, unknown> | null = null;
  const deliveries = new Map<string, Record<string, unknown>>();
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
          if (sql.includes("FROM github_connection_states")) return ({ ...state } as T);
          if (sql.includes("FROM github_installation_facts")) return (fact ? ({ ...fact } as T) : null);
          if (sql.includes("FROM github_workspace_installations") && sql.includes("workspace_id <>")) return null;
          if (sql.includes("FROM github_webhook_deliveries")) return ((deliveries.get(String(args[0])) ?? null) as T | null);
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_connection_states") && sql.includes("target_account_id")) {
            const matches = state.oauth_user_id === args[0] && state.target_account_id === args[1] &&
              String(state.target_account_login).toLowerCase() === String(args[2]).toLowerCase() &&
              state.target_account_type === args[3] && state.status === "oauth_verified";
            return { results: (matches ? [{ nonce_hash: state.nonce_hash }] : []) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          if (sql.includes("INSERT OR IGNORE INTO github_webhook_deliveries")) {
            const id = String(args[0]);
            if (deliveries.has(id)) return { success: true, meta: { changes: 0 } };
            deliveries.set(id, { event_name: args[1], payload_sha256: args[2], result: "processing", processing_started_at: args[4] });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET action = ?") && sql.includes("github_webhook_deliveries")) {
            const delivery = deliveries.get(String(args[5]));
            if (delivery) Object.assign(delivery, {
              action: args[0], installation_id: args[1], account_id: args[2], account_login: args[3], account_type: args[4],
            });
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET untrusted_installation_id")) {
            if (state.untrusted_installation_id && state.untrusted_installation_id !== args[0]) return { success: true, meta: { changes: 0 } };
            state.untrusted_installation_id = args[0];
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET consumed_at")) {
            if (state.consumed_at) return { success: true, meta: { changes: 0 } };
            state.consumed_at = args[0];
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET oauth_user_id")) {
            state.oauth_user_id = args[0]; state.oauth_login = args[1]; state.oauth_verified_at = args[2]; state.status = "oauth_verified";
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("SET status = 'rejected'")) {
            state.status = "rejected";
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO github_installation_facts")) {
            fact = {
              installation_id: args[0], account_id: args[1], account_login: args[2], account_type: args[3],
              installer_sender_id: args[4], installer_sender_login: args[5], last_actor_id: args[6], last_actor_login: args[7],
              repository_selection: args[8], permissions_json: args[9], state: sql.includes("'active'") ? "active" : args[10],
              last_delivery_id: sql.includes("'active'") ? args[10] : args[11],
            };
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE github_installation_facts SET")) {
            fact = {
              ...fact, account_id: args[0], account_login: args[1], account_type: args[2], repository_selection: args[5],
              permissions_json: args[6] ?? fact?.permissions_json, state: args[7], last_delivery_id: args[8],
            };
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("INSERT INTO github_workspace_installations")) {
            binding = { workspace_id: args[0], installation_id: args[1], account_id: args[2], connected_by_identity_id: args[3], verified_github_user_id: args[4], verified_github_login: args[5], state: args[7] };
            return { success: true, meta: { changes: 1 } };
          }
          if (sql.includes("UPDATE github_connection_states SET status = 'bound'")) state.status = "bound";
          if (sql.includes("result = 'processed'")) {
            const delivery = deliveries.get(String(args[2]));
            if (delivery) { delivery.result = "processed"; delivery.result_reason = args[1]; }
          }
          if (sql.includes("result = 'failed'")) {
            const delivery = deliveries.get(String(args[1]));
            if (delivery) { delivery.result = "failed"; delivery.result_reason = args[0]; }
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, state, binding: () => binding, fact: () => fact, delivery: (id: string) => deliveries.get(id) };
}

function actorEnrollmentDb(
  initialActor: Record<string, unknown> | null = null,
  concurrentActor: Record<string, unknown> | null = null,
  installationIds: number[] = [42],
) {
  let actorState: Record<string, unknown> | null = null;
  let actor: Record<string, unknown> | null = initialActor;
  const runs: Array<{ sql: string; args: unknown[] }> = [];
  const db: D1DatabaseLike = {
    prepare(sql: string) {
      let args: unknown[] = [];
      const statement = {
        bind(...values: unknown[]) { args = values; return statement; },
        async first<T>() {
          if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
          if (sql.includes("FROM github_workspace_installations b")) {
            return ({ workspace_id: "ws_test", installation_id: installationIds[0], connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" } as T);
          }
          if (sql.includes("FROM github_actor_connection_states")) {
            if (!actorState) return null;
            if (sql.includes("nonce_hash = ?")) return (actorState.nonce_hash === args[0] ? ({ ...actorState } as T) : null);
            return ({ ...actorState } as T);
          }
          if (sql.includes("FROM github_workspace_actors")) {
            if (sql.includes("github_user_id = ?") && actor && actor.github_user_id === args[1] && actor.plexus_identity_id !== args[2]) {
              return ({ plexus_identity_id: actor.plexus_identity_id } as T);
            }
            return (actor ? ({ ...actor } as T) : null);
          }
          return null;
        },
        async all<T>() {
          if (sql.includes("FROM github_workspace_installations b")) {
            return { results: installationIds.map((installationId) => ({ workspace_id: "ws_test", installation_id: installationId, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" })) as T[] };
          }
          return { results: [] as T[] };
        },
        async run() {
          runs.push({ sql, args: [...args] });
          if (sql.includes("INSERT INTO github_actor_connection_states")) {
            actorState = {
              nonce_hash: args[0], workspace_id: args[1], plexus_identity_id: args[2], expires_at: args[3],
              consumed_at: null, oauth_user_id: null, oauth_login: null, status: "pending_oauth",
            };
          } else if (sql.includes("SET consumed_at") && sql.includes("github_actor_connection_states")) {
            if (!actorState || actorState.consumed_at) return { success: true, meta: { changes: 0 } };
            actorState.consumed_at = args[0];
          } else if (sql.includes("INSERT INTO github_workspace_actors")) {
            if (!actor && concurrentActor) actor = { ...concurrentActor };
            if (actor && actor.github_user_id !== args[2]) return { success: true, meta: { changes: 0 } };
            actor = {
              workspace_id: args[0], plexus_identity_id: args[1], github_user_id: args[2], github_login: args[3],
              verified_at: args[4], verification_source: args[5], connection_nonce_hash: args[6],
            };
          } else if (sql.includes("SET oauth_user_id") && sql.includes("github_actor_connection_states") && actorState) {
            actorState.oauth_user_id = args[0];
            actorState.oauth_login = args[1];
            actorState.status = "bound";
          } else if (sql.includes("status = 'rejected'") && sql.includes("github_actor_connection_states") && actorState) {
            actorState.status = "rejected";
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  return { db, actor: () => actor, state: () => actorState, runs };
}

function env(db: D1DatabaseLike): Env {
  return {
    TF_ENV: "test",
    TEAMFORGE_DB: db,
    TF_GITHUB_APP_ID: "12345",
    TF_GITHUB_APP_SLUG: "thoughtseed-test",
    TF_GITHUB_APP_PRIVATE_KEY: privateKeyPem,
    TF_GITHUB_APP_CLIENT_ID: "Iv1.test",
    TF_GITHUB_APP_CLIENT_SECRET: "secret",
    TF_GITHUB_APP_CALLBACK_URL: "https://worker.test/v1/github/callback",
    TF_GITHUB_APP_WEBHOOK_SECRET: "webhook-test-secret",
    TF_GITHUB_APP_STATE_SIGNING_SECRET: "s".repeat(32),
    TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS: "Organization:thoughtseed:8,User:Sheshiyer:7611727,User:psychon7:47470954",
    TF_GITHUB_ALLOWED_ACTORS: "installer:77,Sheshiyer:7611727,psychon7:47470954",
  };
}

async function expectHardenedPlexusCompletion(
  response: Response,
  expectedUrl: string,
  forbiddenValues: string[],
): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("vary")).toBe("Accept");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("x-frame-options")).toBe("DENY");
  expect(response.headers.get("permissions-policy")).toBe("camera=(), geolocation=(), microphone=()");
  expect(response.headers.get("content-security-policy")).toBe("default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
  const body = await response.text();
  expect(body).toContain(`<meta http-equiv="refresh" content="0;url=${expectedUrl}">`);
  expect(body).toContain(`<a href="${expectedUrl}">Return to Plexus</a>`);
  expect(body.split(expectedUrl)).toHaveLength(3);
  expect(body.toLowerCase()).not.toMatch(/state=|code=|access_token|installation_id/);
  for (const forbidden of forbiddenValues) expect(body).not.toContain(forbidden);
}

async function runInstallationConnectionFlow(
  order: "callback-first" | "webhook-first",
  accept?: string,
) {
  const nonce = `nonce-${order}-${accept === "text/html" ? "html" : "json"}`;
  const nonceHash = await sha256Hex(nonce);
  const fixture = connectionFlowDb(nonceHash);
  const secret = "webhook-test-secret";
  const flowEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
  const stateValue = await signConnectState(
    { workspace: "ws_test", actor: "pid_admin", nonce, exp: Math.floor(Date.now() / 1000) + 600, target: { id: 8, login: "thoughtseed", type: "Organization" } },
    "s".repeat(32),
  );
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "oauth-token" }));
    if (String(input).endsWith("/user")) return new Response(JSON.stringify({ id: 77, login: "installer" }));
    throw new Error(`unexpected fetch ${String(input)}`);
  }));
  try {
    const callbackUrl = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue)}&code=one-time-code&installation_id=42`);
    const invokeCallback = () => handleGithubCallback(
      flowEnv,
      new Request(callbackUrl, accept ? { headers: { accept } } : undefined),
      callbackUrl,
    );
    const payload = JSON.stringify({
      action: "created",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected", permissions: requiredInstallationPermissions },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const signedWebhook = async () => handleGithubWebhook(flowEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": `delivery-${order}-${accept === "text/html" ? "html" : "json"}`, "x-github-event": "installation" },
      body: payload,
    }));
    let response: Response;
    if (order === "callback-first") {
      response = await invokeCallback();
      expect(fixture.binding()).toBeNull();
      expect((await signedWebhook()).status).toBe(200);
    } else {
      expect((await signedWebhook()).status).toBe(200);
      expect(fixture.binding()).toBeNull();
      response = await invokeCallback();
    }
    return { callbackUrl, fixture, response, stateValue };
  } finally {
    vi.unstubAllGlobals();
  }
}

describe("GitHub App routes", () => {
  it("binds a connection start to one exact allowlisted installation account", async () => {
    const runs: Array<{ sql: string; args: unknown[] }> = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() {
            if (sql.includes("FROM github_workspace_installations b")) {
              return { results: [{ workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected" }] as T[] };
            }
            return { results: [] as T[] };
          },
          async run() { runs.push({ sql, args: [...args] }); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const response = await handleGithubConnectStart(
      env(db),
      new Request("https://worker.test/v1/github/connect/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: 7611727 }),
      }),
      principal("admin"),
    );
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { authorizeUrl: string; target: { id: number; login: string; type: string } } };
    expect(payload.data.target).toEqual({ id: 7611727, login: "Sheshiyer", type: "User" });
    const signedState = new URL(payload.data.authorizeUrl).searchParams.get("state")!;
    await expect(verifyConnectState(signedState, "s".repeat(32))).resolves.toMatchObject({
      target: { id: 7611727, login: "Sheshiyer", type: "User" },
    });
    expect(runs.find((run) => run.sql.includes("INSERT INTO github_connection_states"))?.args).toContain(7611727);
  });

  it("returns all workspace installations and exact allowed targets", async () => {
    const bindings = [
      { workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson },
      { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "suspended", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? bindings : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const response = await handleGithubConnection(env(db), principal("admin"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "connected",
        installations: [
          { installationId: 42, repositorySelection: "all", status: "connected", account: { id: 8, login: "thoughtseed", type: "Organization" } },
          { installationId: 84, repositorySelection: "selected", status: "suspended", account: { id: 7611727, login: "Sheshiyer", type: "User" } },
        ],
        allowedTargets: [
          { id: 8, login: "thoughtseed", type: "Organization" },
          { id: 7611727, login: "Sheshiyer", type: "User" },
          { id: 47470954, login: "psychon7", type: "User" },
        ],
        targets: [
          { account: { id: 8, login: "thoughtseed", type: "Organization" }, installationId: 42, repositorySelection: "all", status: "connected", reason: "connected" },
          { account: { id: 7611727, login: "Sheshiyer", type: "User" }, installationId: 84, repositorySelection: "selected", status: "suspended", reason: "installation_suspended" },
          { account: { id: 47470954, login: "psychon7", type: "User" }, status: "unconfigured", reason: "not_connected" },
        ],
      },
    });
  });

  it("reports recovery reasons for every exact target without treating an OAuth hint as authority", async () => {
    const pendingStates = [
      { target_account_id: 8, target_account_login: "thoughtseed", target_account_type: "Organization", status: "oauth_verified", untrusted_installation_id: 999 },
      { target_account_id: 7611727, target_account_login: "Sheshiyer", target_account_type: "User", status: "pending_oauth", untrusted_installation_id: null },
      { target_account_id: 47470954, target_account_login: "psychon7", target_account_type: "User", status: "oauth_verified", untrusted_installation_id: 126 },
    ];
    const signedFacts = [
      { installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, state: "active" },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() {
            if (sql.includes("FROM github_workspace_installations b")) return { results: [] as T[] };
            if (sql.includes("FROM github_connection_states")) return { results: pendingStates as T[] };
            if (sql.includes("FROM github_installation_facts")) return { results: signedFacts as T[] };
            return { results: [] as T[] };
          },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };

    const response = await handleGithubConnection(env(db), principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "pending",
        targets: [
          { account: { id: 8 }, installationId: 42, status: "forbidden", reason: "installation_hint_mismatch" },
          { account: { id: 7611727 }, status: "pending", reason: "oauth_pending" },
          { account: { id: 47470954 }, status: "pending", reason: "trust_anchor_missing" },
        ],
      },
    });
  });

  it("keeps an exact selected installation closed until all required GitHub permissions are signed", async () => {
    const bindings = [
      { workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: "{}" },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? bindings : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };

    const response = await handleGithubConnection(env(db), principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "forbidden",
        installations: [{ installationId: 42, repositorySelection: "selected", status: "forbidden", reason: "permissions_incomplete" }],
        targets: expect.arrayContaining([{ account: { id: 8, login: "thoughtseed", type: "Organization" }, installationId: 42, repositorySelection: "selected", status: "forbidden", reason: "permissions_incomplete" }]),
      },
    });
  });

  it("rejects installation allowlist entries with extra authority segments", async () => {
    const invalidEnv = {
      ...env(activityDb()),
      TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS: "Organization:thoughtseed:8:extra",
    };
    const response = await handleGithubConnection(invalidEnv, principal("admin"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_installation_policy_invalid" } });
  });

  it("aggregates repositories across active installations with installation and account metadata", async () => {
    const bindings = [
      { workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson },
      { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? bindings : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const firstUserPage = Array.from({ length: 100 }, (_, index) => ({
      id: 200 + index,
      name: `private-${String(index).padStart(3, "0")}`,
      full_name: `Sheshiyer/private-${String(index).padStart(3, "0")}`,
      private: true,
      default_branch: "main",
      owner: { id: 7611727, login: "Sheshiyer" },
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/app/installations/42/access_tokens")) return new Response(JSON.stringify({ token: "org-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/app/installations/84/access_tokens")) return new Response(JSON.stringify({ token: "user-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/installation/repositories") && new Headers(init?.headers).get("authorization") === "Bearer org-token") {
        return new Response(JSON.stringify({ repositories: [{ id: 101, name: "plexus", full_name: "thoughtseed/plexus", private: true, default_branch: "main", owner: { id: 8, login: "thoughtseed" } }] }));
      }
      if (url.includes("/installation/repositories") && url.endsWith("&page=1")) {
        return new Response(JSON.stringify({ repositories: firstUserPage }));
      }
      if (url.includes("/installation/repositories") && url.endsWith("&page=2")) {
        return new Response(JSON.stringify({ repositories: [
          firstUserPage[0],
          { id: 400, name: "private-final", full_name: "Sheshiyer/private-final", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } },
        ] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const response = await handleGithubRepositories(env(db), principal("admin"));
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { repositories: Array<Record<string, unknown>> } };
    expect(payload.data.repositories).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 101, installationId: 42, account: { id: 8, login: "thoughtseed", type: "Organization" } }),
      expect.objectContaining({ id: 400, installationId: 84, repositorySelection: "all", account: { id: 7611727, login: "Sheshiyer", type: "User" } }),
    ]));
    expect(payload.data.repositories).toHaveLength(102);
    expect(payload.data.repositories[0]).toMatchObject({ fullName: "Sheshiyer/private-000" });
    expect(payload.data.repositories.at(-1)).toMatchObject({ fullName: "thoughtseed/plexus" });
    vi.unstubAllGlobals();
  });

  it("does not end pagination early when duplicate IDs fill a page", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson };
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? [binding] : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const pageOne = [
      { id: 500, name: "repo-500", full_name: "Sheshiyer/repo-500", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } },
      ...Array.from({ length: 98 }, (_, index) => ({ id: 501 + index, name: `repo-${501 + index}`, full_name: `Sheshiyer/repo-${501 + index}`, private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } })),
      { id: 500, name: "repo-500", full_name: "Sheshiyer/repo-500", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } },
    ];
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "all-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.endsWith("&page=1")) return new Response(JSON.stringify({ total_count: 100, repositories: pageOne }));
      if (url.endsWith("&page=2")) return new Response(JSON.stringify({ total_count: 100, repositories: [{ id: 599, name: "repo-599", full_name: "Sheshiyer/repo-599", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { repositories: expect.arrayContaining([expect.objectContaining({ id: 599 })]) } });
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.filter(([input]) => String(input).includes("/installation/repositories")).length).toBe(2);
    vi.unstubAllGlobals();
  });

  it("returns no options and retires stale facts when a selected installation grants zero repositories", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson };
    const runs: Array<{ sql: string; args: unknown[] }> = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() {
            if (sql.includes("FROM github_workspace_installations b")) return { results: [binding] as T[] };
            if (sql.includes("SELECT repository_id FROM github_installation_repositories")) return { results: [{ repository_id: 101 }] as T[] };
            return { results: [] as T[] };
          },
          async run() { runs.push({ sql, args: [...args] }); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "selected-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/installation/repositories")) return new Response(JSON.stringify({ repositories: [] }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { repositories: [] } });
    expect(runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ sql: expect.stringContaining("SET state = 'removed'"), args: expect.arrayContaining([42, 101]) }),
      expect.objectContaining({ sql: expect.stringContaining("DELETE FROM project_github_verifications"), args: [42, 101] }),
    ]));
    vi.unstubAllGlobals();
  });

  it("does not persist a partial repository snapshot when pagination fails", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson };
    const runs: Array<{ sql: string; args: unknown[] }> = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? [binding] : []) as T[] }; },
          async run() { runs.push({ sql, args: [...args] }); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const firstPage = Array.from({ length: 100 }, (_, index) => ({
      id: 500 + index,
      name: `partial-${index}`,
      full_name: `Sheshiyer/partial-${index}`,
      private: true,
      default_branch: "main",
      owner: { id: 7611727, login: "Sheshiyer" },
    }));
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "all-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.endsWith("&page=1")) return new Response(JSON.stringify({ repositories: firstPage }));
      if (url.endsWith("&page=2")) return new Response(JSON.stringify({ message: "temporary failure" }), { status: 503 });
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(503);
    expect(runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("fails closed when repository pagination reaches the safe limit", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson };
    const runs: Array<{ sql: string; args: unknown[] }> = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? [binding] : []) as T[] }; },
          async run() { runs.push({ sql, args: [...args] }); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "all-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/installation/repositories")) {
        const page = Number(new URL(url).searchParams.get("page"));
        return new Response(JSON.stringify({
          total_count: 10_001,
          repositories: Array.from({ length: 100 }, (_, index) => ({
            id: page * 100 + index + 1,
            name: `repo-${page}-${index}`,
            full_name: `Sheshiyer/repo-${page}-${index}`,
            private: true,
            default_branch: "main",
            owner: { id: 7611727, login: "Sheshiyer" },
          })),
        }));
      }
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_repository_discovery_incomplete" } });
    expect(runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("rejects contradictory duplicate repository identities before touching cache authority", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson };
    const runs: string[] = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? [binding] : []) as T[] }; },
          async run() { runs.push(sql); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "all-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/installation/repositories")) return new Response(JSON.stringify({ repositories: [
        { id: 101, name: "private-repo", full_name: "Sheshiyer/private-repo", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } },
        { id: 101, name: "renamed-repo", full_name: "Sheshiyer/renamed-repo", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } },
      ] }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_repository_identity_conflict" } });
    expect(runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("keeps the prior cache snapshot when the atomic repository batch fails", async () => {
    const binding = { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson };
    const batches: number[] = [];
    const db: D1DatabaseLike & { batch(statements: Array<{ run(): Promise<unknown> }>): Promise<unknown[]> } = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() {
            if (sql.includes("FROM github_workspace_installations b")) return { results: [binding] as T[] };
            if (sql.includes("SELECT repository_id FROM github_installation_repositories")) return { results: [{ repository_id: 999 }] as T[] };
            return { results: [] as T[] };
          },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
      async batch(statements) {
        batches.push(statements.length);
        throw new Error("D1 batch unavailable");
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "all-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/installation/repositories")) return new Response(JSON.stringify({ repositories: [{ id: 101, name: "private-repo", full_name: "Sheshiyer/private-repo", private: true, default_branch: "main", owner: { id: 7611727, login: "Sheshiyer" } }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_repository_snapshot_failed" } });
    expect(batches).toEqual([3]);
    vi.unstubAllGlobals();
  });

  it("skips active bindings with unsupported repository selection or removed allowlist authority when a valid binding remains", async () => {
    const bindings = [
      { workspace_id: "ws_test", installation_id: 42, account_id: 8, account_login: "thoughtseed", account_type: "Organization", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson },
      { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "unexpected" },
      { workspace_id: "ws_test", installation_id: 126, account_id: 999, account_login: "former-owner", account_type: "User", state: "active", repository_selection: "selected" },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? bindings : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/app/installations/42/access_tokens")) {
        return new Response(JSON.stringify({ token: "org-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      }
      if (url.includes("/installation/repositories")) {
        return new Response(JSON.stringify({ repositories: [{ id: 101, name: "plexus", full_name: "thoughtseed/plexus", private: true, default_branch: "main", owner: { id: 8, login: "thoughtseed" } }] }));
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    vi.stubGlobal("fetch", fetcher);

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        repositories: [expect.objectContaining({ id: 101, installationId: 42 })],
      },
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls.some(([input]) => /installations\/(84|126)\//.test(String(input)))).toBe(false);
    vi.unstubAllGlobals();
  });

  it("fails closed when no active binding has supported repository selection and current allowlist authority", async () => {
    const bindings = [
      { workspace_id: "ws_test", installation_id: 84, account_id: 7611727, account_login: "Sheshiyer", account_type: "User", state: "active", repository_selection: "unexpected" },
      { workspace_id: "ws_test", installation_id: 126, account_id: 999, account_login: "former-owner", account_type: "User", state: "active", repository_selection: "selected" },
    ];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: (sql.includes("FROM github_workspace_installations b") ? bindings : []) as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await handleGithubRepositories(env(db), principal("admin"));

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_unconfigured" } });
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("ignores signed public-App installation events for non-allowlisted accounts before persisting facts", async () => {
    const store = recordingDeliveryDb();
    const payload = JSON.stringify({
      action: "created",
      installation: { id: 999, account: { id: 999, login: "outsider", type: "User" }, repository_selection: "selected" },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const response = await handleGithubWebhook(env(store.db), new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, "webhook-test-secret"), "x-github-delivery": "delivery-outsider", "x-github-event": "installation" },
      body: payload,
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "ignored" } });
    expect(store.runs.some((run) => run.sql.includes("github_installation_facts") || run.sql.includes("github_installation_repositories"))).toBe(false);
  });

  it("keeps suspended and deleted installations closed across late events", () => {
    expect(nextInstallationState("suspended", "installation_repositories", "added")).toBe("suspended");
    expect(nextInstallationState("suspended", "installation", "new_permissions_accepted")).toBe("suspended");
    expect(nextInstallationState("suspended", "installation", "unsuspend")).toBe("active");
    expect(nextInstallationState("deleted", "installation_repositories", "added")).toBe("deleted");
    expect(nextInstallationState("deleted", "installation", "unsuspend")).toBe("deleted");
  });

  it("rejects workflows, traversal, control characters, and duplicate write paths", () => {
    expect(() => validateWriteFiles([{ path: ".github/workflows", content: "x" }])).toThrow(/unsafe/);
    expect(() => validateWriteFiles([{ path: ".GitHub/Workflows/release.yml", content: "x" }])).toThrow(/unsafe/);
    expect(() => validateWriteFiles([{ path: "src/../secret", content: "x" }])).toThrow(/unsafe/);
    expect(() => validateWriteFiles([{ path: "src/a\u0000.ts", content: "x" }])).toThrow(/unsafe/);
    expect(() => validateWriteFiles([{ path: "src/a.ts", content: "x" }, { path: "src/a.ts", content: "y" }])).toThrow(/unsafe/);
  });

  it.each([
    ["Sheshiyer", 7611727],
    ["psychon7", 47470954],
  ])("enrolls allowed founder %s through one-time OAuth and stores only the numeric actor", async (login, userId) => {
    const fixture = actorEnrollmentDb(null, null, [42, 84]);
    const actorEnv = { ...env(fixture.db), TF_GITHUB_ALLOWED_ACTORS: "Sheshiyer:7611727,psychon7:47470954" };
    const start = await handleGithubActorEnrollStart(actorEnv, principal("admin"));
    expect(start.status).toBe(201);
    const startPayload = await start.json() as { data: { authorizeUrl: string; allowedLogins: string[] } };
    expect(startPayload.data.allowedLogins).toEqual(["Sheshiyer", "psychon7"]);
    const stateValue = new URL(startPayload.data.authorizeUrl).searchParams.get("state");
    expect(stateValue).toBeTruthy();

    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://github.com/login/oauth/access_token") return new Response(JSON.stringify({ access_token: "ephemeral-oauth-token" }));
      if (url === "https://api.github.com/user") return new Response(JSON.stringify({ id: userId, login }));
      if (url === "https://api.github.com/user/installations?per_page=100&page=1") return new Response(JSON.stringify({ installations: [{ id: 84 }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));
    const callback = await handleGithubCallback(
      actorEnv,
      new Request("https://worker.test/v1/github/callback"),
      new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=one-time-code`),
    );
    expect(callback.status).toBe(200);
    expect(callback.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(callback.json()).resolves.toMatchObject({ data: { status: "verified", actor: { id: userId, login } } });
    expect(fixture.actor()).toMatchObject({ github_user_id: userId, github_login: login, plexus_identity_id: "pid_admin", verification_source: "oauth" });
    expect(JSON.stringify(fixture.runs)).not.toContain("ephemeral-oauth-token");

    const status = await handleGithubActor(actorEnv, principal("admin"));
    await expect(status.json()).resolves.toMatchObject({ data: { status: "verified", actor: { id: userId, login } } });
    const replay = await handleGithubCallback(
      actorEnv,
      new Request("https://worker.test/v1/github/callback"),
      new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=replayed-code`),
    );
    expect(replay.status).toBe(409);
    vi.unstubAllGlobals();
  });

  it("returns actor verification browsers to the fixed token-free Plexus setup route", async () => {
    const fixture = actorEnrollmentDb(null, null, [42, 84]);
    const actorEnv = { ...env(fixture.db), TF_GITHUB_ALLOWED_ACTORS: "Sheshiyer:7611727,psychon7:47470954" };
    const start = await handleGithubActorEnrollStart(actorEnv, principal("admin"));
    const startPayload = await start.json() as { data: { authorizeUrl: string } };
    const stateValue = new URL(startPayload.data.authorizeUrl).searchParams.get("state");
    expect(stateValue).toBeTruthy();
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://github.com/login/oauth/access_token") return new Response(JSON.stringify({ access_token: "ephemeral-oauth-token" }));
      if (url === "https://api.github.com/user") return new Response(JSON.stringify({ id: 7611727, login: "Sheshiyer" }));
      if (url === "https://api.github.com/user/installations?per_page=100&page=1") return new Response(JSON.stringify({ installations: [{ id: 84 }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));
    try {
      const callbackUrl = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=one-time-code`);
      const callback = await handleGithubCallback(
        actorEnv,
        new Request(callbackUrl, { headers: { accept: "text/html,application/xhtml+xml" } }),
        callbackUrl,
      );
      await expectHardenedPlexusCompletion(callback, "plexus://github/setup/v1", [
        stateValue!,
        "one-time-code",
        "ephemeral-oauth-token",
        "ws_test",
        "7611727",
        "42",
        "84",
      ]);
      expect(fixture.actor()).toMatchObject({ github_user_id: 7611727, github_login: "Sheshiyer", verification_source: "oauth" });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it.each([
    ["inaccessible bound installation", 7611727, [{ id: 99 }], "github_oauth_installation_forbidden", 403],
    ["recycled allowed login with wrong numeric ID", 999, [{ id: 42 }], "github_actor_forbidden", 403],
    ["malformed installation authority", 7611727, null, "github_oauth_installations_failed", 502],
  ])("rejects OAuth actor enrollment for %s", async (_label, userId, installations, expectedCode, expectedStatus) => {
    const fixture = actorEnrollmentDb();
    const actorEnv = { ...env(fixture.db), TF_GITHUB_ALLOWED_ACTORS: "Sheshiyer:7611727,psychon7:47470954" };
    const start = await handleGithubActorEnrollStart(actorEnv, principal("admin"));
    const startPayload = await start.json() as { data: { authorizeUrl: string } };
    const stateValue = new URL(startPayload.data.authorizeUrl).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "ephemeral-oauth-token" }));
      if (url.endsWith("/user")) return new Response(JSON.stringify({ id: userId, login: "Sheshiyer" }));
      if (url.includes("/user/installations?")) {
        return new Response(JSON.stringify(installations === null ? {} : { installations }));
      }
      throw new Error(`unexpected fetch ${url}`);
    }));
    const callback = await handleGithubCallback(
      actorEnv,
      new Request("https://worker.test/v1/github/callback"),
      new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=one-time-code`),
    );
    expect(callback.status).toBe(expectedStatus);
    await expect(callback.json()).resolves.toMatchObject({ error: { code: expectedCode } });
    expect(fixture.actor()).toBeNull();
    expect(fixture.state()).toMatchObject({ status: "rejected" });
    expect(JSON.stringify(fixture.runs)).not.toContain("ephemeral-oauth-token");
    vi.unstubAllGlobals();
  });

  it("rejects rebinding one Plexus identity across the two founder numeric IDs", async () => {
    const fixture = actorEnrollmentDb({
      workspace_id: "ws_test",
      plexus_identity_id: "pid_admin",
      github_user_id: 7611727,
      github_login: "Sheshiyer",
      verified_at: "2026-07-13T00:00:00.000Z",
      verification_source: "oauth",
    });
    const actorEnv = { ...env(fixture.db), TF_GITHUB_ALLOWED_ACTORS: "Sheshiyer:7611727,psychon7:47470954" };
    const start = await handleGithubActorEnrollStart(actorEnv, principal("admin"));
    const payload = await start.json() as { data: { authorizeUrl: string } };
    const stateValue = new URL(payload.data.authorizeUrl).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "ephemeral-oauth-token" }));
      if (url.endsWith("/user")) return new Response(JSON.stringify({ id: 47470954, login: "psychon7" }));
      if (url.includes("/user/installations?")) return new Response(JSON.stringify({ installations: [{ id: 42 }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));
    const callback = await handleGithubCallback(
      actorEnv,
      new Request("https://worker.test/v1/github/callback"),
      new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=one-time-code`),
    );
    expect(callback.status).toBe(409);
    await expect(callback.json()).resolves.toMatchObject({ error: { code: "github_actor_rebind_forbidden" } });
    expect(fixture.actor()).toMatchObject({ github_user_id: 7611727, github_login: "Sheshiyer" });
    expect(fixture.state()).toMatchObject({ status: "rejected" });
    vi.unstubAllGlobals();
  });

  it("keeps the first founder binding when a concurrent CAS update reports zero changes", async () => {
    const concurrentFounder = {
      workspace_id: "ws_test",
      plexus_identity_id: "pid_admin",
      github_user_id: 47470954,
      github_login: "psychon7",
      verified_at: "2026-07-13T00:00:00.000Z",
      verification_source: "oauth",
    };
    const fixture = actorEnrollmentDb(null, concurrentFounder);
    const actorEnv = { ...env(fixture.db), TF_GITHUB_ALLOWED_ACTORS: "Sheshiyer:7611727,psychon7:47470954" };
    const start = await handleGithubActorEnrollStart(actorEnv, principal("admin"));
    const payload = await start.json() as { data: { authorizeUrl: string } };
    const stateValue = new URL(payload.data.authorizeUrl).searchParams.get("state");
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "ephemeral-oauth-token" }));
      if (url.endsWith("/user")) return new Response(JSON.stringify({ id: 7611727, login: "Sheshiyer" }));
      if (url.includes("/user/installations?")) return new Response(JSON.stringify({ installations: [{ id: 42 }] }));
      throw new Error(`unexpected fetch ${url}`);
    }));
    const callback = await handleGithubCallback(
      actorEnv,
      new Request("https://worker.test/v1/github/callback"),
      new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue!)}&code=one-time-code`),
    );
    expect(callback.status).toBe(409);
    await expect(callback.json()).resolves.toMatchObject({ error: { code: "github_actor_rebind_forbidden" } });
    expect(fixture.actor()).toEqual(concurrentFounder);
    expect(fixture.state()).toMatchObject({ status: "rejected" });
    vi.unstubAllGlobals();
  });

  it("keeps actor enrollment admin-only and rechecks active admin state", async () => {
    const fixture = actorEnrollmentDb();
    expect((await handleGithubActorEnrollStart(env(fixture.db), principal("employee"))).status).toBe(403);
    const inactiveDb: D1DatabaseLike = {
      prepare(sql: string) {
        const statement = {
          bind() { return statement; },
          async first<T>() {
            if (sql.includes("FROM plexus_identities")) return null;
            return null;
          },
          async all<T>() { return { results: [] as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const response = await handleGithubActorEnrollStart(env(inactiveDb), principal("admin"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_forbidden" } });
  });

  it("revokes an enrolled actor when configured login and numeric ID no longer match", async () => {
    const store = writeDb();
    const revokedEnv = { ...env(store.db), TF_GITHUB_ALLOWED_ACTORS: "installer:88" };
    const status = await handleGithubActor(revokedEnv, principal("admin"));
    await expect(status.json()).resolves.toMatchObject({ data: { status: "forbidden", actor: { id: 77, login: "installer" } } });
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await handleGithubPullRequest(revokedEnv, writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_actor_forbidden" } });
    expect(fetcher).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("atomically consumes OAuth state and rejects a second code callback", async () => {
    const nonce = "nonce-atomic";
    const stateValue = await signConnectState(
      { workspace: "ws_test", actor: "pid_admin", nonce, exp: Math.floor(Date.now() / 1000) + 600, target: { id: 8, login: "thoughtseed", type: "Organization" } },
      "s".repeat(32),
    );
    const state: Record<string, unknown> = {
      nonce_hash: await sha256Hex(nonce),
      workspace_id: "ws_test",
      plexus_actor_id: "pid_admin",
      expires_at: Math.floor(Date.now() / 1000) + 600,
      consumed_at: null,
      oauth_user_id: null,
      oauth_login: null,
      oauth_verified_at: null,
      untrusted_installation_id: null,
      target_account_id: 8,
      target_account_login: "thoughtseed",
      target_account_type: "Organization",
      status: "pending_oauth",
    };
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() {
            if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
            if (sql.includes("FROM github_connection_states")) return ({ ...state } as T);
            return null;
          },
          async all<T>() { return { results: [] as T[] }; },
          async run() {
            if (sql.includes("SET consumed_at")) {
              if (state.consumed_at) return { success: true, meta: { changes: 0 } };
              state.consumed_at = args[0];
              return { success: true, meta: { changes: 1 } };
            }
            if (sql.includes("SET oauth_user_id")) {
              state.oauth_user_id = args[0];
              state.oauth_login = args[1];
              state.oauth_verified_at = args[2];
              state.status = "oauth_verified";
            }
            return { success: true, meta: { changes: 1 } };
          },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "oauth-token" }));
      if (String(input).endsWith("/user")) return new Response(JSON.stringify({ id: 77, login: "installer" }));
      throw new Error(`unexpected fetch ${String(input)}`);
    }));
    const callbackEnv = env(db);
    const callbackUrl = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue)}&code=one-time-code`);
    const first = await handleGithubCallback(callbackEnv, new Request(callbackUrl, { headers: { accept: "text/html" } }), callbackUrl);
    expect(first.status).toBe(302);
    const firstLocation = new URL(first.headers.get("location")!);
    expect(firstLocation.origin).toBe("https://github.com");
    expect(firstLocation.pathname).toBe("/apps/thoughtseed-test/installations/new");
    expect(firstLocation.searchParams.get("state")).toBe(stateValue);
    const replay = await handleGithubCallback(callbackEnv, new Request(callbackUrl), callbackUrl);
    expect(replay.status).toBe(409);
    await expect(replay.json()).resolves.toMatchObject({ error: { code: "github_state_consumed" } });
    vi.unstubAllGlobals();
  });

  it("uses a signed installation fact for a state-less GitHub settings return without mutating authority", async () => {
    const nonceHash = await sha256Hex("nonce-stateless-settings-return");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const callbackEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const payload = JSON.stringify({
      action: "created",
      installation: {
        id: 42,
        account: { id: 8, login: "thoughtseed", type: "Organization" },
        repository_selection: "all",
        permissions: requiredInstallationPermissions,
      },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const webhook = await handleGithubWebhook(callbackEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: {
        "x-hub-signature-256": await webhookSignature(payload, secret),
        "x-github-delivery": "delivery-stateless-settings-return",
        "x-github-event": "installation",
      },
      body: payload,
    }));
    expect(webhook.status).toBe(200);
    expect(fixture.fact()).toMatchObject({
      installation_id: 42,
      account_id: 8,
      repository_selection: "all",
      state: "active",
    });
    const stateBeforeCallback = { ...fixture.state };

    const callbackUrl = new URL("https://worker.test/v1/github/callback?installation_id=42&setup_action=update");
    const response = await handleGithubCallback(callbackEnv, new Request(callbackUrl), callbackUrl);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        status: "pending",
        target: { id: 8, login: "thoughtseed", type: "Organization" },
      },
    });
    expect(fixture.state).toEqual(stateBeforeCallback);
    expect(fixture.binding()).toBeNull();
  });

  it("keeps an unverified state-less GitHub installation return retryable and fail-closed", async () => {
    const nonceHash = await sha256Hex("nonce-stateless-installation-unverified");
    const fixture = connectionFlowDb(nonceHash);
    const callbackUrl = new URL("https://worker.test/v1/github/callback?installation_id=42&setup_action=install");

    const response = await handleGithubCallback(env(fixture.db), new Request(callbackUrl), callbackUrl);

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: {
        code: "github_installation_fact_pending",
        retryable: true,
      },
    });
    expect(fixture.binding()).toBeNull();
  });

  it("returns a typed retryable error when the GitHub OAuth transport fails", async () => {
    const nonce = "nonce-oauth-transport";
    const nonceHash = await sha256Hex(nonce);
    const fixture = connectionFlowDb(nonceHash);
    const stateValue = await signConnectState(
      { workspace: "ws_test", actor: "pid_admin", nonce, exp: Math.floor(Date.now() / 1000) + 600, target: { id: 8, login: "thoughtseed", type: "Organization" } },
      "s".repeat(32),
    );
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new TypeError("network unavailable");
    }));
    const callbackUrl = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue)}&code=one-time-code`);
    const response = await handleGithubCallback(env(fixture.db), new Request(callbackUrl), callbackUrl);
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "github_oauth_exchange_failed", retryable: true },
    });
    expect(fixture.state.status).toBe("rejected");
    vi.unstubAllGlobals();
  });

  it("accepts GitHub's post-install callback when it repeats code with an installation id", async () => {
    const nonce = "nonce-post-install-code";
    const nonceHash = await sha256Hex(nonce);
    const fixture = connectionFlowDb(nonceHash);
    const stateValue = await signConnectState(
      { workspace: "ws_test", actor: "pid_admin", nonce, exp: Math.floor(Date.now() / 1000) + 600, target: { id: 8, login: "thoughtseed", type: "Organization" } },
      "s".repeat(32),
    );
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("oauth/access_token")) return new Response(JSON.stringify({ access_token: "oauth-token" }));
      if (String(input).endsWith("/user")) return new Response(JSON.stringify({ id: 77, login: "installer" }));
      throw new Error(`unexpected fetch ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetcher);
    const oauthCallback = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue)}&code=one-time-code`);
    expect((await handleGithubCallback(env(fixture.db), new Request(oauthCallback), oauthCallback)).status).toBe(302);

    const installCallback = new URL(`https://worker.test/v1/github/callback?state=${encodeURIComponent(stateValue)}&code=second-code&installation_id=42&setup_action=install`);
    const response = await handleGithubCallback(env(fixture.db), new Request(installCallback), installCallback);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "pending" } });
    expect(fixture.state).toMatchObject({ status: "oauth_verified", untrusted_installation_id: 42, oauth_user_id: 77 });
    expect(fetcher).toHaveBeenCalledTimes(2);
    fixture.state.status = "bound";
    const boundReplay = await handleGithubCallback(env(fixture.db), new Request(installCallback), installCallback);
    expect(boundReplay.status).toBe(409);
    await expect(boundReplay.json()).resolves.toMatchObject({ error: { code: "github_state_consumed" } });
    vi.unstubAllGlobals();
  });

  it("processes installation deletion without trusting sparse repository objects", async () => {
    const nonceHash = await sha256Hex("nonce-deleted-installation");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const webhookEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const created = JSON.stringify({
      action: "created",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected", permissions: { ...requiredInstallationPermissions, members: "read" } },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const createdResponse = await handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(created, secret), "x-github-delivery": "delivery-created", "x-github-event": "installation" },
      body: created,
    }));
    expect(createdResponse.status).toBe(200);

    const deleted = JSON.stringify({
      action: "deleted",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected", permissions: { ...requiredInstallationPermissions, members: "read" } },
      sender: { id: 77, login: "installer" },
      repositories: [{ id: 101 }],
    });
    const deletedResponse = await handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(deleted, secret), "x-github-delivery": "delivery-deleted", "x-github-event": "installation" },
      body: deleted,
    }));
    expect(deletedResponse.status).toBe(200);
    await expect(deletedResponse.json()).resolves.toMatchObject({ data: { status: "accepted" } });
    expect(fixture.fact()).toMatchObject({ state: "deleted" });
    expect(fixture.delivery("delivery-deleted")).toMatchObject({ result: "processed" });
  });

  it("accepts GitHub's compact repository facts on installation creation", async () => {
    const nonceHash = await sha256Hex("nonce-compact-created");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const webhookEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const created = JSON.stringify({
      action: "created",
      installation: { id: 42, account: { id: 7611727, login: "Sheshiyer", type: "User" }, repository_selection: "selected" },
      sender: { id: 7611727, login: "Sheshiyer" },
      repositories: [{ id: 1211794578, name: "parkarea-aleph", full_name: "Sheshiyer/parkarea-aleph", private: true }],
    });
    const response = await handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(created, secret), "x-github-delivery": "delivery-compact-created", "x-github-event": "installation" },
      body: created,
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "accepted" } });
    expect(fixture.fact()).toMatchObject({ installation_id: 42, account_id: 7611727, repository_selection: "selected", state: "active" });
    expect(fixture.delivery("delivery-compact-created")).toMatchObject({ result: "processed" });
  });

  it.each(["selected", "all"])("bootstraps an exact %s trust fact from a signed non-deletion lifecycle event", async (repositorySelection) => {
    const nonceHash = await sha256Hex(`nonce-lifecycle-bootstrap-${repositorySelection}`);
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const webhookEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const payload = JSON.stringify({
      action: "new_permissions_accepted",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: repositorySelection, permissions: { ...requiredInstallationPermissions, members: "read" } },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const request = async () => handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": `delivery-lifecycle-bootstrap-${repositorySelection}`, "x-github-event": "installation" },
      body: payload,
    }));

    const first = await request();
    expect(first.status).toBe(200);
    expect(fixture.fact()).toMatchObject({
      installation_id: 42,
      account_id: 8,
      repository_selection: repositorySelection,
      permissions_json: '{"actions":"read","checks":"read","contents":"write","issues":"read","members":"read","metadata":"read","pull_requests":"write"}',
      state: "active",
    });
    expect(fixture.delivery(`delivery-lifecycle-bootstrap-${repositorySelection}`)).toMatchObject({
      action: "new_permissions_accepted",
      installation_id: 42,
      account_id: 8,
      account_login: "thoughtseed",
      account_type: "Organization",
      result: "processed",
      result_reason: "lifecycle_bootstrap",
    });

    const duplicate = await request();
    expect(duplicate.status).toBe(200);
    await expect(duplicate.json()).resolves.toMatchObject({ data: { status: "duplicate" } });
    expect(fixture.fact()).toMatchObject({ installation_id: 42, last_delivery_id: `delivery-lifecycle-bootstrap-${repositorySelection}` });
  });

  it("persists but never connects a selected lifecycle bootstrap with missing signed permissions", async () => {
    const nonceHash = await sha256Hex("nonce-permissions-missing");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const payload = JSON.stringify({
      action: "new_permissions_accepted",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected" },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const response = await handleGithubWebhook({ ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret }, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": "delivery-permissions-missing", "x-github-event": "installation" },
      body: payload,
    }));
    expect(response.status).toBe(200);
    expect(fixture.fact()).toMatchObject({ permissions_json: "{}", state: "active" });

    Object.assign(fixture.state, {
      consumed_at: "now",
      oauth_user_id: 77,
      oauth_login: "installer",
      oauth_verified_at: "now",
      untrusted_installation_id: 42,
      status: "oauth_verified",
    });
    await expect(reconcileBinding(env(fixture.db), nonceHash)).rejects.toMatchObject({ code: "github_installation_permissions_incomplete" });
    expect(fixture.binding()).toBeNull();
  });

  it("preserves the last signed permission snapshot when a repository lifecycle event omits permissions", async () => {
    const nonceHash = await sha256Hex("nonce-repository-permissions");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const webhookEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const send = async (deliveryId: string, eventName: string, body: Record<string, unknown>) => {
      const payload = JSON.stringify(body);
      return handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": deliveryId, "x-github-event": eventName },
        body: payload,
      }));
    };
    expect((await send("delivery-permissions-created", "installation", {
      action: "created",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected", permissions: requiredInstallationPermissions },
      sender: { id: 77, login: "installer" },
      repositories: [],
    })).status).toBe(200);
    expect((await send("delivery-permissions-repos", "installation_repositories", {
      action: "added",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: "selected" },
      sender: { id: 77, login: "installer" },
      repositories_added: [],
      repositories_removed: [],
    })).status).toBe(200);
    expect(fixture.fact()).toMatchObject({ permissions_json: requiredInstallationPermissionsJson, state: "active" });
  });

  it.each([
    ["deleted", "selected"],
  ])("does not bootstrap a missing trust fact for %s lifecycle with %s repository scope", async (action, repositorySelection) => {
    const nonceHash = await sha256Hex(`nonce-closed-bootstrap-${action}-${repositorySelection}`);
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const payload = JSON.stringify({
      action,
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, repository_selection: repositorySelection },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const response = await handleGithubWebhook({ ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret }, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": `delivery-closed-${action.replaceAll("_", "-")}-${repositorySelection}`, "x-github-event": "installation" },
      body: payload,
    }));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_installation_untrusted" } });
    expect(fixture.fact()).toBeNull();
  });

  it("rejects compact repository facts outside the signed installation account", async () => {
    const nonceHash = await sha256Hex("nonce-cross-account-created");
    const fixture = connectionFlowDb(nonceHash);
    const secret = "webhook-test-secret";
    const webhookEnv = { ...env(fixture.db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const created = JSON.stringify({
      action: "created",
      installation: { id: 42, account: { id: 7611727, login: "Sheshiyer", type: "User" }, repository_selection: "selected" },
      sender: { id: 7611727, login: "Sheshiyer" },
      repositories: [{ id: 101, name: "private-repo", full_name: "outsider/private-repo", private: true }],
    });
    const response = await handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(created, secret), "x-github-delivery": "delivery-cross-account-created", "x-github-event": "installation" },
      body: created,
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_webhook_repository_invalid" } });
    expect(fixture.binding()).toBeNull();
    expect(fixture.delivery("delivery-cross-account-created")).toMatchObject({ result: "failed" });
  });

  it.each(["callback-first", "webhook-first"])("preserves exact JSON while binding the installation when %s", async (order: "callback-first" | "webhook-first") => {
    const { fixture, response } = await runInstallationConnectionFlow(order, "application/json");
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: { status: order === "callback-first" ? "pending" : "connected" },
    });
    expect(fixture.binding()).toMatchObject({ installation_id: 42, verified_github_user_id: 77, workspace_id: "ws_test" });
    expect(fixture.state.status).toBe("bound");
  });

  it.each([
    ["callback-first", "pending"],
    ["webhook-first", "connected"],
  ])("returns a hardened owner completion page for %s %s callback", async (order: "callback-first" | "webhook-first", expectedStatus) => {
    expect(expectedStatus).toBe(order === "callback-first" ? "pending" : "connected");
    const { callbackUrl, fixture, response, stateValue } = await runInstallationConnectionFlow(order, "text/html");
    await expectHardenedPlexusCompletion(response, "plexus://github/connection/v1/8", [
      callbackUrl.search,
      stateValue,
      "one-time-code",
      "oauth-token",
      "ws_test",
      "thoughtseed",
      "installer",
      "42",
    ]);
    expect(fixture.binding()).toMatchObject({ installation_id: 42, verified_github_user_id: 77, workspace_id: "ws_test" });
    expect(fixture.state.status).toBe("bound");
  });

  it("fails closed on invalid webhook signatures and deduplicates signed delivery content", async () => {
    const secret = "webhook-test-secret";
    const payload = JSON.stringify({ zen: "keep it secure" });
    const db = deliveryDb();
    const webhookEnv = { ...env(db), TF_GITHUB_APP_WEBHOOK_SECRET: secret };
    const request = async (body: string, signature: string, delivery = "delivery-0001") => handleGithubWebhook(webhookEnv, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": signature, "x-github-delivery": delivery, "x-github-event": "ping" },
      body,
    }));
    expect((await request(payload, "sha256=" + "0".repeat(64))).status).toBe(401);
    const validSignature = await webhookSignature(payload, secret);
    expect((await request(payload, validSignature)).status).toBe(200);
    const duplicate = await request(payload, validSignature);
    await expect(duplicate.json()).resolves.toMatchObject({ data: { status: "duplicate" } });
    const changed = JSON.stringify({ zen: "changed" });
    const mismatch = await request(changed, await webhookSignature(changed, secret));
    expect(mismatch.status).toBe(409);
    await expect(mismatch.json()).resolves.toMatchObject({ error: { code: "github_delivery_mismatch" } });
  });

  it("reclaims an expired webhook processing lease", async () => {
    const secret = "webhook-test-secret";
    const payload = JSON.stringify({ zen: "retry" });
    const hash = await sha256Hex(payload);
    const db = deliveryDb({ event: "ping", hash, result: "processing", processingStartedAt: new Date(Date.now() - 10 * 60_000).toISOString() });
    const response = await handleGithubWebhook({ ...env(db), TF_GITHUB_APP_WEBHOOK_SECRET: secret }, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": "delivery-stale", "x-github-event": "ping" },
      body: payload,
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { status: "accepted" } });
  });

  it("denies activity when the project is outside the principal workspace", async () => {
    const db: D1DatabaseLike = {
      prepare() {
        const statement = {
          bind() { return statement; },
          async first<T>() { return null as T | null; },
          async all<T>() { return { results: [] as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    const request = new Request("https://worker.test/v1/projects/foreign/github-activity/sync", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "2026-07-13T00:00:00.000Z", to: "2026-07-14T00:00:00.000Z" }),
    });
    const response = await handleGithubActivitySync(env(db), request, "foreign", principal("employee"));
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "project_not_found" } });
  });

  it("binds only the exact hinted installation even for the same GitHub actor", async () => {
    const bound: number[] = [];
    const state = { nonce_hash: "nonce-hash", workspace_id: "ws_test", plexus_actor_id: "pid_admin", expires_at: Math.floor(Date.now() / 1000) + 600, consumed_at: "now", oauth_user_id: 77, oauth_login: "installer", oauth_verified_at: "now", untrusted_installation_id: 42, target_account_id: 8, target_account_login: "thoughtseed", target_account_type: "Organization", status: "oauth_verified" };
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() {
            if (sql.includes("FROM github_connection_states")) return ({ ...state } as T);
            if (sql.includes("FROM github_installation_facts")) return ({ installation_id: Number(args[0]), installer_sender_id: 77, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, state: "active" } as T);
            if (sql.includes("FROM github_workspace_actors")) return null;
            if (sql.includes("FROM plexus_identities")) return ({ id: "pid_admin" } as T);
            if (sql.includes("FROM github_workspace_installations")) return null;
            return null;
          },
          async all<T>() { return { results: [] as T[] }; },
          async run() {
            if (sql.includes("INSERT INTO github_workspace_installations")) bound.push(Number(args[1]));
            return { success: true, meta: { changes: 1 } };
          },
        };
        return statement;
      },
    };
    await expect(reconcileBinding(env(db), "nonce-hash")).resolves.toBe(true);
    expect(bound).toEqual([42]);
  });

  it.each(["selected", "all"])("recovers a stale installation hint from one exact %s signed fact", async (repositorySelection) => {
    const fixture = recoveryReconciliationDb([
      { installation_id: 42, installer_sender_id: 77, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: repositorySelection, permissions_json: requiredInstallationPermissionsJson, state: "active" },
    ]);

    await expect(reconcileBinding(env(fixture.db), "nonce-recovery")).resolves.toBe(true);
    expect(fixture.boundInstallationId()).toBe(42);
  });

  it("fails closed when stale-hint recovery has zero or multiple exact signed facts", async () => {
    const missing = recoveryReconciliationDb([]);
    await expect(reconcileBinding(env(missing.db), "nonce-recovery")).resolves.toBe(false);
    expect(missing.boundInstallationId()).toBeNull();

    const ambiguous = recoveryReconciliationDb([
      { installation_id: 42, installer_sender_id: 77, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, state: "active" },
      { installation_id: 84, installer_sender_id: 77, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, state: "active" },
    ]);
    await expect(reconcileBinding(env(ambiguous.db), "nonce-recovery")).rejects.toMatchObject({ code: "github_connection_ambiguous" });
    expect(ambiguous.boundInstallationId()).toBeNull();
  });

  it("does not bind after a concurrent connection-state transition wins the stale-hint repair", async () => {
    const raced = recoveryReconciliationDb([
      { installation_id: 42, installer_sender_id: 77, account_id: 8, account_login: "thoughtseed", account_type: "Organization", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, state: "active" },
    ], 999, 0);

    await expect(reconcileBinding(env(raced.db), "nonce-recovery")).resolves.toBe(false);
    expect(raced.boundInstallationId()).toBeNull();
  });

  it("binds all-repositories installations but rejects inactive initiating admins", async () => {
    const allRepositories = reconciliationDb("all", true);
    await expect(reconcileBinding(env(allRepositories.db), "nonce-hash")).resolves.toBe(true);
    expect(allRepositories.wasBound()).toBe(true);

    const inactiveAdmin = reconciliationDb("selected", false);
    await expect(reconcileBinding(env(inactiveAdmin.db), "nonce-hash")).rejects.toMatchObject({ code: "github_forbidden" });
    expect(inactiveAdmin.wasBound()).toBe(false);
  });

  it.each([
    ["wrong organization ID", { id: 999, login: "thoughtseed", type: "Organization" }],
    ["wrong organization login", { id: 8, login: "lookalike", type: "Organization" }],
    ["personal account", { id: 8, login: "thoughtseed", type: "User" }],
  ])("rejects installation binding for %s", async (_label, organization) => {
    const fixture = reconciliationDb("selected", true, organization);
    await expect(reconcileBinding(env(fixture.db), "nonce-hash")).rejects.toMatchObject({ code: "github_installation_account_forbidden" });
    expect(fixture.wasBound()).toBe(false);
  });

  it.each([undefined, null, "", "All", "unexpected"])("fails closed when signed repository_selection is %s", async (repositorySelection) => {
    const secret = "webhook-test-secret";
    const payload = JSON.stringify({
      action: "created",
      installation: { id: 42, account: { id: 8, login: "thoughtseed", type: "Organization" }, ...(repositorySelection !== undefined ? { repository_selection: repositorySelection } : {}) },
      sender: { id: 77, login: "installer" },
      repositories: [],
    });
    const db = deliveryDb();
    const response = await handleGithubWebhook({ ...env(db), TF_GITHUB_APP_WEBHOOK_SECRET: secret }, new Request("https://worker.test/v1/github/webhook", {
      method: "POST",
      headers: { "x-hub-signature-256": await webhookSignature(payload, secret), "x-github-delivery": `delivery-selection-${repositorySelection ?? "missing"}`, "x-github-event": "installation" },
      body: payload,
    }));
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_webhook_payload_invalid" } });
  });

  it("links an all-scope discovered repository to a project by numeric identity", async () => {
    const runs: string[] = [];
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() {
            if (sql.includes("FROM projects WHERE id")) return ({ id: args[0] } as T);
            if (sql.includes("FROM github_workspace_installations b")) return ({ workspace_id: "ws_test", installation_id: 84, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "all", permissions_json: requiredInstallationPermissionsJson, account_id: 7611727, account_login: "Sheshiyer", account_type: "User" } as T);
            if (sql.includes("FROM github_installation_repositories r")) return ({ installation_id: 84, repository_id: 101, owner_login: "Sheshiyer", name: "private-repo", full_name: "Sheshiyer/private-repo", is_private: 1, default_branch: "main", state: "active" } as T);
            return null;
          },
          async all<T>() { return { results: [] as T[] }; },
          async run() { runs.push(sql); return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "scoped", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/repos/Sheshiyer/private-repo")) return new Response(JSON.stringify({ id: 101, name: "private-repo", full_name: "Sheshiyer/private-repo", private: true, default_branch: "main", owner: { login: "Sheshiyer", id: 7611727 } }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const request = new Request("https://worker.test/v1/projects/proj_test/github-repo/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId: 84, repositoryId: 101 }),
    });
    const response = await handleGithubRepoVerify(env(db), request, "proj_test", principal("admin"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: {
      status: "verified",
      repository: { id: 101, repositorySelection: "all", installationId: 84 },
    } });
    expect(runs.some((sql) => sql.includes("INSERT INTO project_github_verifications"))).toBe(true);
    vi.unstubAllGlobals();
  });

  it("rejects numeric repository identity mismatches returned by GitHub", async () => {
    const db: D1DatabaseLike = {
      prepare(sql: string) {
        let args: unknown[] = [];
        const statement = {
          bind(...values: unknown[]) { args = values; return statement; },
          async first<T>() {
            if (sql.includes("FROM projects WHERE id")) return ({ id: args[0] } as T);
            if (sql.includes("FROM github_workspace_installations b")) return ({ workspace_id: "ws_test", installation_id: 42, connected_by_identity_id: "pid_admin", verified_github_user_id: 77, verified_github_login: "installer", state: "active", repository_selection: "selected", permissions_json: requiredInstallationPermissionsJson, account_id: 8, account_login: "thoughtseed", account_type: "Organization" } as T);
            if (sql.includes("FROM github_installation_repositories r")) return ({ installation_id: 42, repository_id: 101, owner_login: "thoughtseed", name: "private-repo", full_name: "thoughtseed/private-repo", is_private: 1, default_branch: "main", state: "active" } as T);
            return null;
          },
          async all<T>() { return { results: [] as T[] }; },
          async run() { return { success: true, meta: { changes: 1 } }; },
        };
        return statement;
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/access_tokens")) return new Response(JSON.stringify({ token: "scoped", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      if (url.includes("/repos/thoughtseed/private-repo")) return new Response(JSON.stringify({ id: 999, name: "private-repo", full_name: "thoughtseed/private-repo", private: true, default_branch: "main", owner: { login: "thoughtseed", id: 8 } }));
      throw new Error(`unexpected fetch ${url}`);
    }));
    const request = new Request("https://worker.test/v1/projects/proj_test/github-repo/verify", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ installationId: 42, repositoryId: 101 }),
    });
    const response = await handleGithubRepoVerify(env(db), request, "proj_test", principal("admin"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_repository_identity_mismatch" } });
    vi.unstubAllGlobals();
  });

  it.each([
    ["read", { permission: "read", user: { id: 77, login: "installer" } }],
    ["triage", { permission: "triage", user: { id: 77, login: "installer" } }],
    ["malformed", { user: { id: 77, login: "installer" } }],
    ["id mismatch", { permission: "admin", user: { id: 88, login: "installer" } }],
  ])("denies guarded writes before mutation for %s permission", async (_label, permission) => {
    const store = writeDb();
    const github = guardedWriteFetch(permission);
    vi.stubGlobal("fetch", github.fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_membership_forbidden" } });
    expect(github.mutations).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it.each(["write", "maintain", "admin"])("allows %s permission through the guarded Git-data PR primitive", async (permission) => {
    const store = writeDb();
    const github = guardedWriteFetch({ permission, user: { id: 77, login: "installer" } });
    vi.stubGlobal("fetch", github.fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(201);
    const payload = await response.json() as { data: { branch: string; commitSha: string; pullRequest: { number: number } } };
    expect(payload.data.branch).toMatch(/^plexus\/proj_test-[a-f0-9]{12}$/);
    expect(payload.data.commitSha).toBe("c".repeat(40));
    expect(payload.data.pullRequest.number).toBe(9);
    expect(github.tokenRequest()).toEqual({ repository_ids: [101], permissions: { metadata: "read", contents: "write", pull_requests: "write" } });
    const refMutation = github.mutations.find((item) => item.url.endsWith("/git/refs"));
    expect(refMutation?.body.ref).toMatch(/^refs\/heads\/plexus\//);
    expect(refMutation?.body).not.toHaveProperty("force");
    const commitMutation = github.mutations.find((item) => item.url.endsWith("/git/commits"));
    expect(commitMutation?.body.message).toContain("Plexus-Workspace: ws_test");
    expect(commitMutation?.body.message).toContain("Plexus-Actor: pid_admin");
    const pullMutation = github.mutations.find((item) => item.url.endsWith("/pulls"));
    expect(pullMutation?.body.body).toContain("workspace `ws_test` actor `pid_admin`");
    vi.unstubAllGlobals();
  });

  it("uses the project verification's persisted non-default installation for guarded writes", async () => {
    const store = writeDb(null, 84);
    const github = guardedWriteFetch({ permission: "write", user: { id: 77, login: "installer" } });
    vi.stubGlobal("fetch", github.fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(201);
    expect(github.tokenUrl()).toContain("/app/installations/84/access_tokens");
    vi.unstubAllGlobals();
  });

  it("rejects a stale default-branch SHA before tracking or repository mutation", async () => {
    const store = writeDb();
    const github = guardedWriteFetch({ permission: "write", user: { id: 77, login: "installer" } }, { staleBase: true });
    vi.stubGlobal("fetch", github.fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_base_sha_conflict" } });
    expect(github.mutations).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("creates no GitHub or D1 mutation for workflow paths", async () => {
    const store = writeDb();
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest([{ path: ".github/workflows/release.yml", content: "name: release" }]), "proj_test", principal("admin"));
    expect(response.status).toBe(403);
    expect(fetcher).not.toHaveBeenCalled();
    expect(store.runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("returns completed deterministic writes without duplicate GitHub mutation", async () => {
    const store = writeDb({ status: "completed", branch_name: "plexus/proj_test-existing", pull_request_number: 9, pull_request_url: "https://github.test/pulls/9", commit_sha: "c".repeat(40) });
    const github = guardedWriteFetch({ permission: "write", user: { id: 77, login: "installer" } });
    vi.stubGlobal("fetch", github.fetcher);
    const response = await handleGithubPullRequest(env(store.db), writeRequest(), "proj_test", principal("admin"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { idempotent: true, branch: "plexus/proj_test-existing", pullRequest: { number: 9 } } });
    expect(github.mutations).toHaveLength(0);
    expect(store.runs).toHaveLength(0);
    vi.unstubAllGlobals();
  });

  it("keeps connection status admin-only", async () => {
    const response = await handleGithubConnection(env(activityDb()), principal("employee"));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "github_forbidden" } });
  });

  it("syncs private repository activity for a registered same-workspace member", async () => {
    let tokenRequest: Record<string, unknown> | null = null;
    let tokenUrl: string | null = null;
    vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/access_tokens")) {
        tokenUrl = url;
        tokenRequest = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return new Response(JSON.stringify({ token: "scoped-token", expires_at: new Date(Date.now() + 30 * 60_000).toISOString() }), { status: 201 });
      }
      if (url.includes("/commits?")) return new Response(JSON.stringify([
        { sha: "a".repeat(40), html_url: "https://github.test/commit/a", author: { login: "alice" }, commit: { message: "feat: private proof", author: { date: "2026-07-13T12:00:00.000Z" } } },
        { sha: "b".repeat(40), html_url: "https://github.test/commit/b", author: { login: "alice" }, commit: { message: "outside", author: { date: "2026-07-10T12:00:00.000Z" } } },
      ]));
      if (url.includes("/pulls?")) return new Response(JSON.stringify([
        { id: 501, number: 5, title: "Private PR", html_url: "https://github.test/pull/5", updated_at: "2026-07-13T13:00:00.000Z", user: { login: "bob" }, state: "open" },
      ]));
      if (url.includes("/issues?")) return new Response(JSON.stringify([
        { id: 601, number: 6, title: "Private issue", html_url: "https://github.test/issues/6", updated_at: "2026-07-13T14:00:00.000Z", user: { login: "carol" }, state: "open" },
      ]));
      if (url.includes("/actions/runs?")) return new Response(JSON.stringify({ workflow_runs: [
        { id: 701, name: "CI", html_url: "https://github.test/actions/701", status: "completed", conclusion: "success", head_sha: "a".repeat(40), head_branch: "plexus/proof", run_attempt: 2, event: "pull_request", actor: { login: "alice" }, repository: { id: 101 }, created_at: "2026-07-13T12:00:00.000Z", updated_at: "2026-07-13T12:30:00.000Z" },
      ] }));
      if (url.includes("/check-runs?")) return new Response(JSON.stringify({ total_count: 1, check_runs: [
        { id: 801, name: "unit-tests", html_url: "https://github.test/checks/801", status: "completed", conclusion: "success", head_sha: "a".repeat(40), started_at: "2026-07-13T12:05:00.000Z", completed_at: "2026-07-13T12:20:00.000Z", app: { slug: "github-actions" } },
      ] }));
      throw new Error(`unexpected fetch ${url}`);
    }));

    const request = new Request("https://worker.test/v1/projects/proj_test/github-activity/sync", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: "2026-07-13T00:00:00.000Z", to: "2026-07-14T00:00:00.000Z" }),
    });
    const response = await handleGithubActivitySync(env(activityDb(84)), request, "proj_test", principal("employee"));
    expect(response.status).toBe(200);
    const payload = await response.json() as { data: { status: string; activity: Array<{ projectId: string; repoFullName: string; kind: string }>; ciEvidence: { items: Array<{ evidenceClass: string; evidenceType: string; externalId: number; headSha: string; conclusion: string; attempt: number | null; event: string | null; branch: string | null }>; truncated: boolean } } };
    expect(payload.data.status).toBe("synced");
    expect(payload.data.activity).toHaveLength(3);
    expect(payload.data.activity.every((item) => item.projectId === "proj_test" && item.repoFullName === "thoughtseed/private-repo")).toBe(true);
    expect(payload.data.ciEvidence.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ evidenceClass: "ci", evidenceType: "workflow_run", externalId: 701, headSha: "a".repeat(40), conclusion: "success", attempt: 2, event: "pull_request", branch: "plexus/proof" }),
      expect.objectContaining({ evidenceClass: "ci", evidenceType: "check_run", externalId: 801, headSha: "a".repeat(40), conclusion: "success", event: "pull_request", branch: "plexus/proof" }),
    ]));
    expect(payload.data.ciEvidence.truncated).toBe(false);
    expect(tokenRequest).toEqual({
      repository_ids: [101],
      permissions: { metadata: "read", contents: "read", pull_requests: "read", issues: "read", actions: "read", checks: "read" },
    });
    expect(tokenUrl).toContain("/app/installations/84/access_tokens");
    vi.unstubAllGlobals();
  });
});
