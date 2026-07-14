import type { Env } from "../lib/env";
import type { PlexusPrincipal } from "../lib/plexus-session";
import { execute, executeChanges, now, queryAll, queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";
import {
  GithubAppClient,
  GithubControlPlaneError,
  buildInstallationUrl,
  buildOauthAuthorizeUrl,
  sha256Hex,
  signConnectState,
  verifyConnectState,
  verifyWebhookSignature,
  type GithubInstallationAccountTarget,
  type GithubRepository,
} from "../lib/github-app";

interface ConnectionStateRow {
  nonce_hash: string;
  workspace_id: string;
  plexus_actor_id: string;
  expires_at: number;
  consumed_at: string | null;
  oauth_user_id: number | null;
  oauth_login: string | null;
  oauth_verified_at: string | null;
  untrusted_installation_id: number | null;
  target_account_id: number | null;
  target_account_login: string | null;
  target_account_type: "Organization" | "User" | null;
  status: "pending_oauth" | "oauth_verified" | "bound" | "expired" | "rejected";
}

interface ActorConnectionStateRow {
  nonce_hash: string;
  workspace_id: string;
  plexus_identity_id: string;
  expires_at: number;
  consumed_at: string | null;
  oauth_user_id: number | null;
  oauth_login: string | null;
  status: "pending_oauth" | "bound" | "expired" | "rejected";
}

interface WorkspaceActorRow {
  workspace_id: string;
  plexus_identity_id: string;
  github_user_id: number;
  github_login: string;
  verified_at: string;
  verification_source: "installation" | "oauth";
}

interface GithubActorPolicy {
  allowedActors: Array<{ id: number; login: string }>;
  allowedActorByLogin: Map<string, number>;
}

interface GithubInstallationPolicy {
  allowedTargets: GithubInstallationAccountTarget[];
  allowedTargetById: Map<number, GithubInstallationAccountTarget>;
}

interface InstallationBindingRow {
  workspace_id: string;
  installation_id: number;
  connected_by_identity_id: string;
  verified_github_user_id: number;
  verified_github_login: string;
  state: "active" | "suspended" | "revoked";
  account_id: number;
  account_login: string;
  account_type: "Organization" | "User";
  repository_selection: string;
}

interface RepositoryAuthorityRow {
  installation_id: number;
  repository_id: number;
  owner_login: string;
  name: string;
  full_name: string;
  is_private: number;
  default_branch: string | null;
  state: "active" | "removed";
}

interface VerificationRow extends RepositoryAuthorityRow {
  project_id: string;
  workspace_id: string;
  verified_at: string;
}

interface GithubActivity {
  id: string;
  projectId: string;
  repoFullName: string;
  repoUrl: string;
  kind: "commit" | "pull_request" | "issue";
  title: string;
  url: string;
  actor: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

interface GithubCiEvidence {
  id: string;
  externalId: number;
  projectId: string;
  repoFullName: string;
  evidenceClass: "ci";
  evidenceType: "workflow_run" | "check_run";
  name: string;
  status: string;
  conclusion: string | null;
  url: string;
  headSha: string;
  attempt: number | null;
  event: string | null;
  branch: string | null;
  actor: string | null;
  occurredAt: string;
  metadata: Record<string, unknown>;
}

function controlPlaneError(error: unknown): Response {
  if (error instanceof GithubControlPlaneError) {
    return jsonError({ code: error.code, message: error.message, retryable: error.retryable }, error.status);
  }
  return jsonError({ code: "github_control_plane_failed", message: "GitHub control-plane operation failed.", retryable: false }, 500);
}

function database(env: Env) {
  if (!env.TEAMFORGE_DB) throw new GithubControlPlaneError("database_unavailable", "GitHub connection storage is unavailable.", 503, true);
  return env.TEAMFORGE_DB;
}

function stateSecret(env: Env): string {
  const secret = env.TF_GITHUB_APP_STATE_SIGNING_SECRET?.trim();
  if (!secret || secret.length < 32) throw new GithubControlPlaneError("github_app_not_configured", "GitHub state signing is not configured.", 503);
  return secret;
}

function githubConfigurationPresent(env: Env): boolean {
  return [
    env.TF_GITHUB_APP_ID,
    env.TF_GITHUB_APP_SLUG,
    env.TF_GITHUB_APP_PRIVATE_KEY,
    env.TF_GITHUB_APP_CLIENT_ID,
    env.TF_GITHUB_APP_CLIENT_SECRET,
    env.TF_GITHUB_APP_CALLBACK_URL,
    env.TF_GITHUB_APP_WEBHOOK_SECRET,
    env.TF_GITHUB_APP_STATE_SIGNING_SECRET,
    env.TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS,
    env.TF_GITHUB_ALLOWED_ACTORS,
  ].every((value) => Boolean(value?.trim()));
}

const validGithubLogin = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;

function githubActorPolicy(env: Env): GithubActorPolicy {
  const configuredActors = (env.TF_GITHUB_ALLOWED_ACTORS ?? "")
    .split(",")
    .map((actor) => actor.trim())
    .filter(Boolean);
  const allowedActors = configuredActors.map((entry) => {
    const separator = entry.lastIndexOf(":");
    const login = separator > 0 ? entry.slice(0, separator).trim() : "";
    const id = Number(separator > 0 ? entry.slice(separator + 1).trim() : "");
    return { id, login };
  });
  const allowedActorByLogin = new Map(allowedActors.map((actor) => [actor.login.toLowerCase(), actor.id]));
  const actorIds = new Set(allowedActors.map((actor) => actor.id));
  if (allowedActors.length === 0 || allowedActors.some((actor) => !validGithubLogin.test(actor.login) || !Number.isSafeInteger(actor.id) || actor.id <= 0) ||
    allowedActorByLogin.size !== allowedActors.length || actorIds.size !== allowedActors.length) {
    throw new GithubControlPlaneError("github_actor_policy_invalid", "GitHub actor allowlist configuration is invalid.", 503);
  }
  return { allowedActors, allowedActorByLogin };
}

function githubInstallationPolicy(env: Env): GithubInstallationPolicy {
  const entries = (env.TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  const parsedTargets = entries.map((entry) => entry.split(":").map((part) => part.trim()));
  const allowedTargets = parsedTargets.map((parts): GithubInstallationAccountTarget => {
    const type = parts[0] as "Organization" | "User";
    return { type, login: parts[1] ?? "", id: Number(parts[2] ?? "") };
  });
  const allowedTargetById = new Map(allowedTargets.map((target) => [target.id, target]));
  const logins = new Set(allowedTargets.map((target) => target.login.toLowerCase()));
  if (allowedTargets.length === 0 || parsedTargets.some((parts) => parts.length !== 3) || allowedTargets.some((target) =>
    (target.type !== "Organization" && target.type !== "User") || !validGithubLogin.test(target.login) ||
    !Number.isSafeInteger(target.id) || target.id <= 0) || allowedTargetById.size !== allowedTargets.length || logins.size !== allowedTargets.length) {
    throw new GithubControlPlaneError("github_installation_policy_invalid", "GitHub installation-account allowlist configuration is invalid.", 503);
  }
  return { allowedTargets, allowedTargetById };
}

function isAllowedGithubActor(policy: GithubActorPolicy, user: { id: number; login: string }): boolean {
  return policy.allowedActorByLogin.get(user.login.toLowerCase()) === user.id;
}

function assertAllowedGithubActor(policy: GithubActorPolicy, user: { id: number; login: string }): void {
  if (!isAllowedGithubActor(policy, user)) {
    throw new GithubControlPlaneError("github_actor_forbidden", "GitHub OAuth identity is not allowed for this workspace.", 403);
  }
}

function installationTargetOf(value: Pick<InstallationBindingRow, "account_id" | "account_login" | "account_type">): GithubInstallationAccountTarget {
  return { id: value.account_id, login: value.account_login, type: value.account_type };
}

function isAllowedInstallationTarget(policy: GithubInstallationPolicy, value: Pick<InstallationBindingRow, "account_id" | "account_login" | "account_type">): boolean {
  const expected = policy.allowedTargetById.get(value.account_id);
  return Boolean(expected && expected.type === value.account_type && expected.login.toLowerCase() === value.account_login.toLowerCase());
}

function assertAllowedInstallationTarget(policy: GithubInstallationPolicy, value: Pick<InstallationBindingRow, "account_id" | "account_login" | "account_type">): void {
  if (!isAllowedInstallationTarget(policy, value)) {
    throw new GithubControlPlaneError("github_installation_account_forbidden", "GitHub App installation account is not allowlisted.", 403);
  }
}

function requireAdmin(principal: PlexusPrincipal | null): Response | null {
  if (!principal) return jsonError({ code: "access_identity_required", message: "A registered Plexus identity is required.", retryable: false }, 401);
  if (principal.role !== "admin") return jsonError({ code: "github_forbidden", message: "Workspace administrator access is required.", retryable: false }, 403);
  return null;
}

function requirePrincipal(principal: PlexusPrincipal | null): Response | null {
  if (!principal) return jsonError({ code: "access_identity_required", message: "A registered Plexus identity is required.", retryable: false }, 401);
  return null;
}

function randomNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function parseJsonObject(request: Request): Promise<Record<string, unknown>> {
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("not object");
    return value as Record<string, unknown>;
  } catch {
    throw new GithubControlPlaneError("invalid_json", "Request body must be a JSON object.", 400);
  }
}

async function getBindings(env: Env, workspaceId: string): Promise<InstallationBindingRow[]> {
  return queryAll<InstallationBindingRow>(
    database(env),
    `SELECT b.*, f.account_login, f.account_type, f.repository_selection
       FROM github_workspace_installations b
       JOIN github_installation_facts f ON f.installation_id = b.installation_id
      WHERE b.workspace_id = ?
      ORDER BY b.created_at ASC, b.installation_id ASC`,
    workspaceId,
  );
}

async function getBinding(env: Env, workspaceId: string, installationId: number): Promise<InstallationBindingRow | null> {
  return queryFirst<InstallationBindingRow>(
    database(env),
    `SELECT b.*, f.account_login, f.account_type, f.repository_selection
       FROM github_workspace_installations b
       JOIN github_installation_facts f ON f.installation_id = b.installation_id
      WHERE b.workspace_id = ? AND b.installation_id = ? LIMIT 1`,
    workspaceId,
    installationId,
  );
}

function assertBindingIsActive(env: Env, binding: InstallationBindingRow): InstallationBindingRow {
  if (!binding) throw new GithubControlPlaneError("github_unconfigured", "No GitHub App installation is connected to this workspace.", 409);
  if (binding.repository_selection !== "selected") throw new GithubControlPlaneError("github_repository_selection_forbidden", "GitHub App access to all repositories is forbidden.", 403);
  if (binding.state === "suspended") throw new GithubControlPlaneError("github_suspended", "The workspace GitHub App installation is suspended.", 409);
  if (binding.state !== "active") throw new GithubControlPlaneError("github_forbidden", "The workspace GitHub App installation is revoked.", 403);
  assertAllowedInstallationTarget(githubInstallationPolicy(env), binding);
  return binding;
}

async function assertActiveBinding(env: Env, workspaceId: string, installationId: number): Promise<InstallationBindingRow> {
  const binding = await getBinding(env, workspaceId, installationId);
  if (!binding) throw new GithubControlPlaneError("github_unconfigured", "No matching GitHub App installation is connected to this workspace.", 409);
  return assertBindingIsActive(env, binding);
}

async function assertActiveBindings(env: Env, workspaceId: string): Promise<InstallationBindingRow[]> {
  const bindings = (await getBindings(env, workspaceId)).filter((binding) => binding.state === "active");
  if (bindings.length === 0) throw new GithubControlPlaneError("github_unconfigured", "No active GitHub App installation is connected to this workspace.", 409);
  return bindings.map((binding) => assertBindingIsActive(env, binding));
}

async function ensureActiveAdmin(env: Env, principal: Pick<PlexusPrincipal, "identityId" | "workspaceId">): Promise<void> {
  const actor = await queryFirst<{ id: string }>(
    database(env),
    "SELECT id FROM plexus_identities WHERE id = ? AND workspace_id = ? AND role = 'admin' AND is_active = 1 LIMIT 1",
    principal.identityId,
    principal.workspaceId,
  );
  if (!actor) throw new GithubControlPlaneError("github_forbidden", "Current Plexus administrator access is required.", 403);
}

async function getWorkspaceActor(env: Env, workspaceId: string, identityId: string): Promise<WorkspaceActorRow | null> {
  return queryFirst<WorkspaceActorRow>(
    database(env),
    "SELECT * FROM github_workspace_actors WHERE workspace_id = ? AND plexus_identity_id = ? LIMIT 1",
    workspaceId,
    identityId,
  );
}

async function upsertWorkspaceActor(
  env: Env,
  input: {
    workspaceId: string;
    identityId: string;
    githubUserId: number;
    githubLogin: string;
    source: "installation" | "oauth";
    nonceHash: string | null;
  },
): Promise<void> {
  if (!Number.isSafeInteger(input.githubUserId) || input.githubUserId <= 0 || !input.githubLogin) {
    throw new GithubControlPlaneError("github_oauth_identity_failed", "GitHub OAuth identity is invalid.", 502);
  }
  const existingActor = await getWorkspaceActor(env, input.workspaceId, input.identityId);
  if (existingActor && existingActor.github_user_id !== input.githubUserId) {
    throw new GithubControlPlaneError("github_actor_rebind_forbidden", "Plexus identity is already bound to a different numeric GitHub identity.", 409);
  }
  const conflict = await queryFirst<{ plexus_identity_id: string }>(
    database(env),
    `SELECT plexus_identity_id FROM github_workspace_actors
      WHERE workspace_id = ? AND github_user_id = ? AND plexus_identity_id <> ? LIMIT 1`,
    input.workspaceId,
    input.githubUserId,
    input.identityId,
  );
  if (conflict) throw new GithubControlPlaneError("github_actor_already_bound", "GitHub identity is already bound to another Plexus identity in this workspace.", 409);
  const timestamp = now();
  const changes = await executeChanges(
    database(env),
    `INSERT INTO github_workspace_actors
       (workspace_id, plexus_identity_id, github_user_id, github_login, verified_at,
        verification_source, connection_nonce_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, plexus_identity_id) DO UPDATE SET
       github_user_id = excluded.github_user_id,
       github_login = excluded.github_login,
       verified_at = excluded.verified_at,
       verification_source = excluded.verification_source,
       connection_nonce_hash = excluded.connection_nonce_hash,
       updated_at = excluded.updated_at
     WHERE github_workspace_actors.github_user_id = excluded.github_user_id`,
    input.workspaceId,
    input.identityId,
    input.githubUserId,
    input.githubLogin,
    timestamp,
    input.source,
    input.nonceHash,
    timestamp,
    timestamp,
  );
  if (changes !== 1) {
    throw new GithubControlPlaneError("github_actor_rebind_forbidden", "Plexus identity is already bound to a different numeric GitHub identity.", 409);
  }
}

export async function reconcileBinding(env: Env, nonceHash: string): Promise<boolean> {
  const db = database(env);
  const state = await queryFirst<ConnectionStateRow>(db, "SELECT * FROM github_connection_states WHERE nonce_hash = ? LIMIT 1", nonceHash);
  if (!state?.oauth_user_id || !state.oauth_login || !state.untrusted_installation_id || !state.target_account_id ||
    !state.target_account_login || !state.target_account_type || state.status === "rejected" || state.status === "expired") return false;
  await ensureCallbackActorStillAdmin(env, { workspace: state.workspace_id, actor: state.plexus_actor_id });
  const fact = await queryFirst<{
    installation_id: number;
    installer_sender_id: number;
    account_id: number;
    account_login: string;
    account_type: string;
    repository_selection: string;
    state: string;
  }>(
    db,
    "SELECT installation_id, installer_sender_id, account_id, account_login, account_type, repository_selection, state FROM github_installation_facts WHERE installation_id = ? LIMIT 1",
    state.untrusted_installation_id,
  );
  if (!fact || fact.state === "deleted") return false;
  if (fact.repository_selection !== "selected") {
    await execute(db, "UPDATE github_connection_states SET status = 'rejected', updated_at = ? WHERE nonce_hash = ?", now(), nonceHash);
    throw new GithubControlPlaneError("github_repository_selection_forbidden", "GitHub App must be installed with only selected repositories.", 403);
  }
  if (fact.installer_sender_id !== state.oauth_user_id) {
    await execute(db, "UPDATE github_connection_states SET status = 'rejected', updated_at = ? WHERE nonce_hash = ?", now(), nonceHash);
    throw new GithubControlPlaneError("github_actor_mismatch", "OAuth actor does not match the signed installation webhook sender.", 403);
  }
  const installationPolicy = githubInstallationPolicy(env);
  const actorPolicy = githubActorPolicy(env);
  try {
    if (fact.account_type !== "Organization" && fact.account_type !== "User") {
      throw new GithubControlPlaneError("github_installation_account_forbidden", "GitHub App installation account type is invalid.", 403);
    }
    assertAllowedInstallationTarget(installationPolicy, {
      account_id: fact.account_id,
      account_login: fact.account_login,
      account_type: fact.account_type,
    });
    assertAllowedGithubActor(actorPolicy, { id: state.oauth_user_id, login: state.oauth_login });
    if (fact.account_id !== state.target_account_id || fact.account_type !== state.target_account_type ||
      fact.account_login.toLowerCase() !== state.target_account_login.toLowerCase()) {
      throw new GithubControlPlaneError("github_installation_target_mismatch", "Signed installation account does not match the selected connection target.", 409);
    }
  } catch (error) {
    await execute(db, "UPDATE github_connection_states SET status = 'rejected', updated_at = ? WHERE nonce_hash = ?", now(), nonceHash);
    throw error;
  }
  const otherWorkspace = await queryFirst<{ workspace_id: string }>(
    db,
    "SELECT workspace_id FROM github_workspace_installations WHERE installation_id = ? AND workspace_id <> ? LIMIT 1",
    fact.installation_id,
    state.workspace_id,
  );
  if (otherWorkspace) throw new GithubControlPlaneError("github_installation_already_bound", "This GitHub App installation is already bound to another workspace.", 409);
  await upsertWorkspaceActor(env, {
    workspaceId: state.workspace_id,
    identityId: state.plexus_actor_id,
    githubUserId: state.oauth_user_id,
    githubLogin: state.oauth_login,
    source: "installation",
    nonceHash: null,
  });
  const timestamp = now();
  await execute(
    db,
    `INSERT INTO github_workspace_installations
       (workspace_id, installation_id, account_id, connected_by_identity_id, verified_github_user_id, verified_github_login,
        connection_nonce_hash, state, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(workspace_id, account_id) DO UPDATE SET
       installation_id = excluded.installation_id,
       connected_by_identity_id = excluded.connected_by_identity_id,
       verified_github_user_id = excluded.verified_github_user_id,
       verified_github_login = excluded.verified_github_login,
       connection_nonce_hash = excluded.connection_nonce_hash,
       state = excluded.state,
       updated_at = excluded.updated_at`,
    state.workspace_id,
    fact.installation_id,
    fact.account_id,
    state.plexus_actor_id,
    state.oauth_user_id,
    state.oauth_login,
    nonceHash,
    fact.state === "suspended" ? "suspended" : "active",
    timestamp,
    timestamp,
  );
  await execute(db, "UPDATE github_connection_states SET status = 'bound', updated_at = ? WHERE nonce_hash = ?", timestamp, nonceHash);
  return true;
}

export async function handleGithubConnection(env: Env, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    if (!githubConfigurationPresent(env)) {
      return jsonOk({ status: "unconfigured" as const });
    }
    const installationPolicy = githubInstallationPolicy(env);
    const bindings = await getBindings(env, principal!.workspaceId);
    const installations = bindings.map((binding) => {
      const allowed = isAllowedInstallationTarget(installationPolicy, binding) && binding.repository_selection === "selected";
      const status = !allowed ? "forbidden" as const
        : binding.state === "active" ? "connected" as const
          : binding.state === "suspended" ? "suspended" as const : "forbidden" as const;
      return { installationId: binding.installation_id, status, account: installationTargetOf(binding) };
    });
    if (installations.length > 0) {
      const status = installations.some((installation) => installation.status === "connected") ? "connected" as const
        : installations.some((installation) => installation.status === "suspended") ? "suspended" as const : "forbidden" as const;
      return jsonOk({ status, installations, allowedTargets: installationPolicy.allowedTargets });
    }
    const pending = await queryFirst<{ expires_at: number }>(
      database(env),
      "SELECT expires_at FROM github_connection_states WHERE workspace_id = ? AND status IN ('pending_oauth', 'oauth_verified') AND expires_at > ? ORDER BY created_at DESC LIMIT 1",
      principal!.workspaceId,
      Math.floor(Date.now() / 1000),
    );
    return jsonOk({ status: pending ? "pending" as const : "unconfigured" as const, installations, allowedTargets: installationPolicy.allowedTargets });
  } catch (error) {
    return controlPlaneError(error);
  }
}

export async function handleGithubConnectStart(env: Env, request: Request, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    const db = database(env);
    const body = await parseJsonObject(request);
    const accountId = Number(body.accountId);
    const policy = githubInstallationPolicy(env);
    const target = Number.isSafeInteger(accountId) && accountId > 0 ? policy.allowedTargetById.get(accountId) : undefined;
    if (!target) throw new GithubControlPlaneError("github_installation_target_required", "An exact allowlisted numeric accountId is required.", 400);
    const nonce = randomNonce();
    const nonceHash = await sha256Hex(nonce);
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const state = await signConnectState({ workspace: principal!.workspaceId, actor: principal!.identityId, nonce, exp: expiresAt, target }, stateSecret(env));
    const authorizeUrl = buildOauthAuthorizeUrl(env, state);
    const timestamp = now();
    await execute(
      db,
      "UPDATE github_connection_states SET status = 'rejected', updated_at = ? WHERE workspace_id = ? AND plexus_actor_id = ? AND status IN ('pending_oauth', 'oauth_verified')",
      timestamp,
      principal!.workspaceId,
      principal!.identityId,
    );
    await execute(
      db,
      `INSERT INTO github_connection_states
       (nonce_hash, workspace_id, plexus_actor_id, expires_at, target_account_id, target_account_login,
        target_account_type, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'pending_oauth', ?, ?)`,
      nonceHash,
      principal!.workspaceId,
      principal!.identityId,
      expiresAt,
      target.id,
      target.login,
      target.type,
      timestamp,
      timestamp,
    );
    return jsonOk({ status: "pending" as const, authorizeUrl, target }, { status: 201 });
  } catch (error) {
    return controlPlaneError(error);
  }
}

function actorPolicyPayload(policy: GithubActorPolicy) {
  return {
    allowedLogins: policy.allowedActors.map((actor) => actor.login),
  };
}

export async function handleGithubActor(env: Env, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requirePrincipal(principal);
  if (denied) return denied;
  try {
    if (!githubConfigurationPresent(env)) return jsonOk({ status: "unconfigured" as const });
    const policy = githubActorPolicy(env);
    const policyPayload = actorPolicyPayload(policy);
    const bindings = await getBindings(env, principal!.workspaceId);
    if (bindings.length === 0) return jsonOk({ status: "unconfigured" as const, ...policyPayload });
    const activeBindings = bindings.filter((binding) => binding.state === "active" && binding.repository_selection === "selected" &&
      isAllowedInstallationTarget(githubInstallationPolicy(env), binding));
    if (activeBindings.length === 0) {
      return jsonOk({ status: "forbidden" as const, ...policyPayload });
    }
    const actor = await getWorkspaceActor(env, principal!.workspaceId, principal!.identityId);
    if (actor) {
      const actorPayload = { id: actor.github_user_id, login: actor.github_login, verifiedAt: actor.verified_at };
      return jsonOk({
        status: isAllowedGithubActor(policy, { id: actor.github_user_id, login: actor.github_login }) ? "verified" as const : "forbidden" as const,
        ...policyPayload,
        actor: actorPayload,
      });
    }
    const pending = await queryFirst<{ expires_at: number }>(
      database(env),
      `SELECT expires_at FROM github_actor_connection_states
        WHERE workspace_id = ? AND plexus_identity_id = ? AND status = 'pending_oauth' AND expires_at > ?
        ORDER BY created_at DESC LIMIT 1`,
      principal!.workspaceId,
      principal!.identityId,
      Math.floor(Date.now() / 1000),
    );
    return jsonOk({ status: pending ? "pending" as const : "not_enrolled" as const, ...policyPayload });
  } catch (error) {
    return controlPlaneError(error);
  }
}

export async function handleGithubActorEnrollStart(env: Env, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    await ensureActiveAdmin(env, principal!);
    await assertActiveBindings(env, principal!.workspaceId);
    const policy = githubActorPolicy(env);
    const nonce = randomNonce();
    const nonceHash = await sha256Hex(nonce);
    const expiresAt = Math.floor(Date.now() / 1000) + 600;
    const state = await signConnectState({ workspace: principal!.workspaceId, actor: principal!.identityId, nonce, exp: expiresAt }, stateSecret(env));
    const timestamp = now();
    await execute(
      database(env),
      `UPDATE github_actor_connection_states SET status = 'rejected', updated_at = ?
        WHERE workspace_id = ? AND plexus_identity_id = ? AND status = 'pending_oauth'`,
      timestamp,
      principal!.workspaceId,
      principal!.identityId,
    );
    await execute(
      database(env),
      `INSERT INTO github_actor_connection_states
       (nonce_hash, workspace_id, plexus_identity_id, expires_at, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'pending_oauth', ?, ?)`,
      nonceHash,
      principal!.workspaceId,
      principal!.identityId,
      expiresAt,
      timestamp,
      timestamp,
    );
    return jsonOk({ status: "pending" as const, authorizeUrl: buildOauthAuthorizeUrl(env, state), ...actorPolicyPayload(policy) }, { status: 201 });
  } catch (error) {
    return controlPlaneError(error);
  }
}

async function ensureCallbackActorStillAdmin(env: Env, state: { workspace: string; actor: string }): Promise<void> {
  const actor = await queryFirst<{ id: string }>(
    database(env),
    "SELECT id FROM plexus_identities WHERE id = ? AND workspace_id = ? AND role = 'admin' AND is_active = 1 LIMIT 1",
    state.actor,
    state.workspace,
  );
  if (!actor) throw new GithubControlPlaneError("github_forbidden", "The initiating Plexus administrator is no longer active in this workspace.", 403);
}

async function handleGithubActorCallback(
  env: Env,
  url: URL,
  state: { workspace: string; actor: string },
  nonceHash: string,
): Promise<Response> {
  if (url.searchParams.has("installation_id")) {
    throw new GithubControlPlaneError("github_actor_callback_invalid", "Actor enrollment cannot bind or replace a GitHub App installation.", 400);
  }
  const code = url.searchParams.get("code");
  if (!code) throw new GithubControlPlaneError("github_callback_invalid", "OAuth code is required for GitHub actor enrollment.", 400);
  const claimedAt = now();
  const changes = await executeChanges(
    database(env),
    `UPDATE github_actor_connection_states SET consumed_at = ?, updated_at = ?
      WHERE nonce_hash = ? AND workspace_id = ? AND plexus_identity_id = ?
        AND consumed_at IS NULL AND expires_at > ? AND status = 'pending_oauth'`,
    claimedAt,
    claimedAt,
    nonceHash,
    state.workspace,
    state.actor,
    Math.floor(Date.now() / 1000),
  );
  if (changes !== 1) throw new GithubControlPlaneError("github_state_consumed", "GitHub actor enrollment state was already consumed.", 409);
  try {
    const policy = githubActorPolicy(env);
    const bindings = await assertActiveBindings(env, state.workspace);
    const user = await new GithubAppClient(env).exchangeOauthCode(code, bindings.map((binding) => binding.installation_id));
    assertAllowedGithubActor(policy, user);
    await upsertWorkspaceActor(env, {
      workspaceId: state.workspace,
      identityId: state.actor,
      githubUserId: user.id,
      githubLogin: user.login,
      source: "oauth",
      nonceHash,
    });
    const timestamp = now();
    await execute(
      database(env),
      `UPDATE github_actor_connection_states
          SET oauth_user_id = ?, oauth_login = ?, status = 'bound', updated_at = ?
        WHERE nonce_hash = ?`,
      user.id,
      user.login,
      timestamp,
      nonceHash,
    );
    return jsonOk({ status: "verified" as const, actor: { id: user.id, login: user.login, verifiedAt: timestamp } });
  } catch (error) {
    await execute(database(env), "UPDATE github_actor_connection_states SET status = 'rejected', updated_at = ? WHERE nonce_hash = ?", now(), nonceHash);
    throw error;
  }
}

export async function handleGithubCallback(env: Env, _request: Request, url: URL): Promise<Response> {
  try {
    const stateValue = url.searchParams.get("state") ?? "";
    const state = await verifyConnectState(stateValue, stateSecret(env));
    await ensureCallbackActorStillAdmin(env, state);
    const nonceHash = await sha256Hex(state.nonce);
    const db = database(env);
    const actorState = await queryFirst<ActorConnectionStateRow>(
      db,
      "SELECT * FROM github_actor_connection_states WHERE nonce_hash = ? LIMIT 1",
      nonceHash,
    );
    if (actorState) return await handleGithubActorCallback(env, url, state, nonceHash);
    const connectionState = await queryFirst<ConnectionStateRow>(db, "SELECT * FROM github_connection_states WHERE nonce_hash = ? LIMIT 1", nonceHash);
    if (!state.target || !connectionState || connectionState.workspace_id !== state.workspace || connectionState.plexus_actor_id !== state.actor ||
      connectionState.target_account_id !== state.target.id || connectionState.target_account_type !== state.target.type ||
      connectionState.target_account_login?.toLowerCase() !== state.target.login.toLowerCase()) {
      throw new GithubControlPlaneError("github_installation_target_mismatch", "GitHub connection state is not bound to the selected installation account.", 409);
    }
    const installationParam = url.searchParams.get("installation_id");
    const installationId = installationParam && /^\d+$/.test(installationParam) ? Number(installationParam) : null;
    if (installationParam && (!installationId || !Number.isSafeInteger(installationId))) {
      throw new GithubControlPlaneError("github_installation_hint_invalid", "Installation ID hint must be numeric.", 400);
    }
    if (installationId) {
      const changes = await executeChanges(
        db,
        `UPDATE github_connection_states
            SET untrusted_installation_id = ?, installation_hint_at = COALESCE(installation_hint_at, ?), updated_at = ?
          WHERE nonce_hash = ? AND workspace_id = ? AND plexus_actor_id = ? AND expires_at > ?
            AND (untrusted_installation_id IS NULL OR untrusted_installation_id = ?)
            AND status IN ('pending_oauth', 'oauth_verified', 'bound')`,
        installationId,
        now(),
        now(),
        nonceHash,
        state.workspace,
        state.actor,
        Math.floor(Date.now() / 1000),
        installationId,
      );
      if (changes !== 1) throw new GithubControlPlaneError("github_installation_hint_rejected", "Installation hint could not be correlated to this connection state.", 409);
    }
    const code = url.searchParams.get("code");
    if (code) {
      const claimedAt = now();
      const changes = await executeChanges(
        db,
        `UPDATE github_connection_states SET consumed_at = ?, updated_at = ?
          WHERE nonce_hash = ? AND workspace_id = ? AND plexus_actor_id = ?
            AND consumed_at IS NULL AND expires_at > ? AND status = 'pending_oauth'`,
        claimedAt,
        claimedAt,
        nonceHash,
        state.workspace,
        state.actor,
        Math.floor(Date.now() / 1000),
      );
      if (changes === 1) {
        try {
          const policy = githubActorPolicy(env);
          const user = await new GithubAppClient(env).exchangeOauthCode(code);
          assertAllowedGithubActor(policy, user);
          await execute(
            db,
            `UPDATE github_connection_states
                SET oauth_user_id = ?, oauth_login = ?, oauth_verified_at = ?, status = 'oauth_verified', updated_at = ?
              WHERE nonce_hash = ?`,
            user.id,
            user.login,
            now(),
            now(),
            nonceHash,
          );
        } catch (error) {
          await execute(db, "UPDATE github_connection_states SET status = 'rejected', updated_at = ? WHERE nonce_hash = ?", now(), nonceHash);
          throw error;
        }
      } else throw new GithubControlPlaneError("github_state_consumed", "GitHub connection state was already consumed.", 409);
    } else if (!installationId) {
      throw new GithubControlPlaneError("github_callback_invalid", "OAuth code or installation hint is required.", 400);
    }
    const bound = await reconcileBinding(env, nonceHash);
    if (bound) return jsonOk({ status: "connected" as const });
    const row = await queryFirst<ConnectionStateRow>(db, "SELECT * FROM github_connection_states WHERE nonce_hash = ? LIMIT 1", nonceHash);
    if (row?.oauth_user_id && !row.untrusted_installation_id) {
      const installationUrl = new URL(buildInstallationUrl(env));
      installationUrl.searchParams.set("state", stateValue);
      installationUrl.searchParams.set("target_id", String(state.target.id));
      return Response.redirect(installationUrl.toString(), 302);
    }
    return jsonOk({ status: "pending" as const });
  } catch (error) {
    return controlPlaneError(error);
  }
}

function webhookRepository(value: unknown): GithubRepository | null {
  const repo = value as Partial<GithubRepository>;
  if (!repo || !Number.isSafeInteger(repo.id) || (repo.id ?? 0) <= 0 || !repo.name || !repo.full_name ||
    !repo.owner?.login || !Number.isSafeInteger(repo.owner.id) || repo.owner.id <= 0) return null;
  return repo as GithubRepository;
}

export function nextInstallationState(
  current: "active" | "suspended" | "deleted",
  eventName: string,
  action: string,
): "active" | "suspended" | "deleted" {
  if (current === "deleted") return "deleted";
  if (eventName !== "installation") return current;
  if (action === "deleted") return "deleted";
  if (action === "suspend") return "suspended";
  if (action === "unsuspend" && current === "suspended") return "active";
  return current;
}

export async function handleGithubWebhook(env: Env, request: Request): Promise<Response> {
  let ownedDelivery: { db: ReturnType<typeof database>; id: string } | null = null;
  try {
    const secret = env.TF_GITHUB_APP_WEBHOOK_SECRET?.trim();
    if (!secret) throw new GithubControlPlaneError("github_webhook_unconfigured", "GitHub webhook verification is not configured.", 503);
    const payloadText = await request.text();
    if (!(await verifyWebhookSignature(payloadText, request.headers.get("x-hub-signature-256"), secret))) {
      throw new GithubControlPlaneError("github_webhook_signature_invalid", "GitHub webhook signature is invalid.", 401);
    }
    const deliveryId = request.headers.get("x-github-delivery")?.trim();
    const eventName = request.headers.get("x-github-event")?.trim();
    if (!deliveryId || !/^[A-Za-z0-9-]{8,100}$/.test(deliveryId) || !eventName) {
      throw new GithubControlPlaneError("github_webhook_headers_invalid", "GitHub webhook delivery headers are invalid.", 400);
    }
    const db = database(env);
    const receivedAt = now();
    const payloadHash = await sha256Hex(payloadText);
    const claimed = await executeChanges(
      db,
      `INSERT OR IGNORE INTO github_webhook_deliveries
       (delivery_id, event_name, payload_sha256, received_at, processing_started_at, attempt_count, result)
       VALUES (?, ?, ?, ?, ?, 1, 'processing')`,
      deliveryId,
      eventName,
      payloadHash,
      receivedAt,
      receivedAt,
    );
    if (claimed === 1) {
      ownedDelivery = { db, id: deliveryId };
    } else {
      const existing = await queryFirst<{ event_name: string; payload_sha256: string; result: string; processing_started_at: string }>(
        db,
        "SELECT event_name, payload_sha256, result, processing_started_at FROM github_webhook_deliveries WHERE delivery_id = ? LIMIT 1",
        deliveryId,
      );
      if (!existing || existing.event_name !== eventName || existing.payload_sha256 !== payloadHash) {
        throw new GithubControlPlaneError("github_delivery_mismatch", "Webhook delivery ID was reused with different signed content.", 409);
      }
      if (["processed", "ping", "ignored"].includes(existing.result)) return jsonOk({ status: "duplicate" as const });
      const leaseExpired = existing.result === "processing" && Date.parse(existing.processing_started_at) < Date.now() - 5 * 60_000;
      const reclaimed = await executeChanges(
        db,
        `UPDATE github_webhook_deliveries
            SET result = 'processing', processing_started_at = ?, processed_at = NULL, attempt_count = attempt_count + 1
          WHERE delivery_id = ? AND (result IN ('failed', 'received') OR (result = 'processing' AND processing_started_at < ?))`,
        now(),
        deliveryId,
        new Date(Date.now() - 5 * 60_000).toISOString(),
      );
      if (reclaimed !== 1 || (existing.result === "processing" && !leaseExpired)) throw new GithubControlPlaneError("github_delivery_in_progress", "Webhook delivery is already processing.", 409, true);
      ownedDelivery = { db, id: deliveryId };
    }
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(payloadText) as Record<string, unknown>;
    } catch {
      throw new GithubControlPlaneError("github_webhook_payload_invalid", "GitHub webhook payload is invalid JSON.", 400);
    }
    if (eventName === "ping") {
      await execute(db, "UPDATE github_webhook_deliveries SET processed_at = ?, result = 'ping' WHERE delivery_id = ?", now(), deliveryId);
      return jsonOk({ status: "accepted" as const });
    }
    if (eventName !== "installation" && eventName !== "installation_repositories") {
      await execute(db, "UPDATE github_webhook_deliveries SET processed_at = ?, result = 'ignored' WHERE delivery_id = ?", now(), deliveryId);
      return jsonOk({ status: "ignored" as const });
    }
    const installation = payload.installation as Record<string, unknown> | undefined;
    const sender = payload.sender as Record<string, unknown> | undefined;
    const account = installation?.account as Record<string, unknown> | undefined;
    const installationId = Number(installation?.id);
    const senderId = Number(sender?.id);
    const accountId = Number(account?.id);
    const accountType = account?.type;
    const repositorySelection = installation?.repository_selection;
    if (!Number.isSafeInteger(installationId) || installationId <= 0 || !Number.isSafeInteger(senderId) || senderId <= 0 ||
      !Number.isSafeInteger(accountId) || accountId <= 0 || !account?.login || !sender?.login ||
      (accountType !== "Organization" && accountType !== "User") ||
      (repositorySelection !== "selected" && repositorySelection !== "all")) {
      throw new GithubControlPlaneError("github_webhook_payload_invalid", "Signed installation facts are incomplete.", 400);
    }
    const accountTarget: GithubInstallationAccountTarget = { id: accountId, login: String(account.login), type: accountType };
    if (!isAllowedInstallationTarget(githubInstallationPolicy(env), {
      account_id: accountTarget.id,
      account_login: accountTarget.login,
      account_type: accountTarget.type,
    })) {
      await execute(db, "UPDATE github_webhook_deliveries SET processed_at = ?, result = 'ignored' WHERE delivery_id = ?", now(), deliveryId);
      return jsonOk({ status: "ignored" as const });
    }
    const action = String(payload.action ?? "");
    const allowedActions = eventName === "installation"
      ? new Set(["created", "deleted", "suspend", "unsuspend", "new_permissions_accepted"])
      : new Set(["added", "removed"]);
    if (!allowedActions.has(action)) {
      await execute(db, "UPDATE github_webhook_deliveries SET processed_at = ?, result = 'ignored' WHERE delivery_id = ?", now(), deliveryId);
      return jsonOk({ status: "ignored" as const });
    }
    const observedAt = now();
    if (eventName === "installation" && action === "created") {
      await execute(
        db,
        `INSERT INTO github_installation_facts
         (installation_id, account_id, account_login, account_type, installer_sender_id, installer_sender_login,
          last_actor_id, last_actor_login, repository_selection, state, last_delivery_id, observed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?)
         ON CONFLICT(installation_id) DO UPDATE SET
           account_id = excluded.account_id, account_login = excluded.account_login, account_type = excluded.account_type,
           last_actor_id = excluded.last_actor_id, last_actor_login = excluded.last_actor_login,
           repository_selection = excluded.repository_selection, last_delivery_id = excluded.last_delivery_id,
           observed_at = excluded.observed_at, updated_at = excluded.updated_at`,
        installationId, accountId, String(account.login), accountType,
        senderId, String(sender.login), senderId, String(sender.login),
        repositorySelection, deliveryId, observedAt, observedAt,
      );
    } else {
      const existingFact = await queryFirst<{ installation_id: number; state: "active" | "suspended" | "deleted" }>(db, "SELECT installation_id, state FROM github_installation_facts WHERE installation_id = ? LIMIT 1", installationId);
      if (!existingFact) throw new GithubControlPlaneError("github_installation_untrusted", "Installation lifecycle event arrived before a signed installation.created trust anchor.", 409, true);
      const factState = nextInstallationState(existingFact.state, eventName, action);
      await execute(
        db,
        `UPDATE github_installation_facts SET
           account_id = ?, account_login = ?, account_type = ?, last_actor_id = ?, last_actor_login = ?,
           repository_selection = ?, state = ?, last_delivery_id = ?, observed_at = ?, updated_at = ?
         WHERE installation_id = ?`,
        accountId, String(account.login), accountType, senderId, String(sender.login),
        repositorySelection, factState, deliveryId, observedAt, observedAt, installationId,
      );
    }
    const repositoryFactState = await queryFirst<{ state: string }>(db, "SELECT state FROM github_installation_facts WHERE installation_id = ? LIMIT 1", installationId);
    const repositoryState = repositoryFactState?.state === "active" ? "active" : "removed";
    const addedValues = eventName === "installation_repositories" ? payload.repositories_added : payload.repositories;
    for (const value of Array.isArray(addedValues) ? addedValues : []) {
      const repo = webhookRepository(value);
      if (!repo) throw new GithubControlPlaneError("github_webhook_repository_invalid", "Signed webhook contains an invalid repository fact.", 400);
      await execute(
        db,
        `INSERT INTO github_installation_repositories
         (installation_id, repository_id, owner_login, name, full_name, is_private, default_branch, state, observed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(installation_id, repository_id) DO UPDATE SET
           owner_login = excluded.owner_login, name = excluded.name, full_name = excluded.full_name,
           is_private = excluded.is_private, default_branch = excluded.default_branch, state = excluded.state,
           observed_at = excluded.observed_at, updated_at = excluded.updated_at`,
        installationId,
        repo.id,
        repo.owner.login,
        repo.name,
        repo.full_name,
        repo.private ? 1 : 0,
        repo.default_branch ?? null,
        repositoryState,
        observedAt,
        observedAt,
      );
    }
    for (const value of Array.isArray(payload.repositories_removed) ? payload.repositories_removed : []) {
      const repo = webhookRepository(value);
      if (!repo) throw new GithubControlPlaneError("github_webhook_repository_invalid", "Signed webhook contains an invalid removed repository fact.", 400);
      await execute(db, "UPDATE github_installation_repositories SET state = 'removed', updated_at = ? WHERE installation_id = ? AND repository_id = ?", observedAt, installationId, repo.id);
    }
    const storedFact = await queryFirst<{ installer_sender_id: number; state: string }>(db, "SELECT installer_sender_id, state FROM github_installation_facts WHERE installation_id = ? LIMIT 1", installationId);
    if (!storedFact) throw new GithubControlPlaneError("github_installation_untrusted", "Installation trust anchor is missing.", 409, true);
    const bindingState = storedFact.state === "active" ? "active" : storedFact.state === "suspended" ? "suspended" : "revoked";
    await execute(db, "UPDATE github_workspace_installations SET state = ?, updated_at = ? WHERE installation_id = ?", bindingState, observedAt, installationId);
    const candidates = await queryAll<{ nonce_hash: string }>(
      db,
      `SELECT nonce_hash FROM github_connection_states
        WHERE untrusted_installation_id = ? AND oauth_user_id = ? AND status = 'oauth_verified' AND expires_at > ?`,
      installationId,
      storedFact.installer_sender_id,
      Math.floor(Date.now() / 1000),
    );
    if (candidates.length > 1) throw new GithubControlPlaneError("github_connection_ambiguous", "Multiple connection states match this installation.", 409);
    if (candidates[0]) await reconcileBinding(env, candidates[0].nonce_hash);
    await execute(db, "UPDATE github_webhook_deliveries SET processed_at = ?, result = 'processed' WHERE delivery_id = ?", now(), deliveryId);
    return jsonOk({ status: "accepted" as const });
  } catch (error) {
    if (ownedDelivery) {
      await execute(ownedDelivery.db, "UPDATE github_webhook_deliveries SET result = 'failed' WHERE delivery_id = ? AND result = 'processing'", ownedDelivery.id);
    }
    return controlPlaneError(error);
  }
}

async function discoverRepositories(env: Env, binding: InstallationBindingRow): Promise<GithubRepository[]> {
  const client = new GithubAppClient(env);
  const token = await client.createInstallationToken(binding.installation_id, null, "discovery");
  const repositories: GithubRepository[] = [];
  let complete = false;
  for (let page = 1; page <= 100; page += 1) {
    const response = await client.request<{ repositories: GithubRepository[] }>(token.token, `/installation/repositories?per_page=100&page=${page}`);
    repositories.push(...response.repositories);
    if (response.repositories.length < 100) {
      complete = true;
      break;
    }
  }
  const timestamp = now();
  for (const repo of repositories) {
    if (!Number.isSafeInteger(repo.id) || repo.id <= 0 || !Number.isSafeInteger(repo.owner?.id) || repo.owner.id <= 0 ||
      !repo.owner.login || !repo.name || !repo.full_name || !repo.default_branch) {
      throw new GithubControlPlaneError("github_repository_identity_invalid", "GitHub returned an invalid numeric repository identity.", 502, true);
    }
  }
  const liveIds = new Set(repositories.filter((repo) => Number.isSafeInteger(repo.id) && repo.id > 0).map((repo) => repo.id));
  const known = await queryAll<{ repository_id: number }>(
    database(env),
    "SELECT repository_id FROM github_installation_repositories WHERE installation_id = ? AND state = 'active'",
    binding.installation_id,
  );
  for (const row of complete ? known : []) {
    if (!liveIds.has(row.repository_id)) {
      await execute(database(env), "UPDATE github_installation_repositories SET state = 'removed', updated_at = ? WHERE installation_id = ? AND repository_id = ?", timestamp, binding.installation_id, row.repository_id);
    }
  }
  for (const repo of repositories) {
    if (!Number.isSafeInteger(repo.id) || !repo.owner?.login || !repo.name) continue;
    await execute(
      database(env),
      `INSERT INTO github_installation_repositories
       (installation_id, repository_id, owner_login, name, full_name, is_private, default_branch, state, observed_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON CONFLICT(installation_id, repository_id) DO UPDATE SET
         owner_login = excluded.owner_login, name = excluded.name, full_name = excluded.full_name,
         is_private = excluded.is_private, default_branch = excluded.default_branch, state = 'active',
         observed_at = excluded.observed_at, updated_at = excluded.updated_at`,
      binding.installation_id,
      repo.id,
      repo.owner.login,
      repo.name,
      repo.full_name,
      repo.private ? 1 : 0,
      repo.default_branch,
      timestamp,
      timestamp,
    );
  }
  return repositories;
}

export async function handleGithubRepositories(env: Env, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    const bindings = await assertActiveBindings(env, principal!.workspaceId);
    const repositories = (await Promise.all(bindings.map(async (binding) => ({ binding, repositories: await discoverRepositories(env, binding) }))))
      .flatMap(({ binding, repositories: installationRepositories }) => installationRepositories.map((repo) => ({ binding, repo })));
    return jsonOk({
      status: "connected" as const,
      repositories: repositories.map(({ binding, repo }) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        owner: repo.owner.login,
        installationId: binding.installation_id,
        account: installationTargetOf(binding),
      })),
    });
  } catch (error) {
    return controlPlaneError(error);
  }
}

async function getRepositoryAuthority(env: Env, workspaceId: string, installationId: number, repositoryId: number): Promise<RepositoryAuthorityRow> {
  const row = await queryFirst<RepositoryAuthorityRow>(
    database(env),
    `SELECT r.* FROM github_installation_repositories r
       JOIN github_workspace_installations b ON b.installation_id = r.installation_id
      WHERE b.workspace_id = ? AND b.state = 'active' AND r.installation_id = ? AND r.repository_id = ? AND r.state = 'active' LIMIT 1`,
    workspaceId,
    installationId,
    repositoryId,
  );
  if (!row) throw new GithubControlPlaneError("github_repository_forbidden", "Repository is not authorized for this workspace installation.", 403);
  return row;
}

async function assertProjectWorkspace(env: Env, projectId: string, workspaceId: string): Promise<void> {
  const project = await queryFirst<{ id: string }>(database(env), "SELECT id FROM projects WHERE id = ? AND workspace_id = ? LIMIT 1", projectId, workspaceId);
  if (!project) throw new GithubControlPlaneError("project_not_found", "Project was not found in this workspace.", 404);
}

export async function handleGithubRepoVerify(env: Env, request: Request, projectId: string, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    const body = await parseJsonObject(request);
    const installationId = Number(body.installationId);
    const repositoryId = Number(body.repositoryId);
    if (!Number.isSafeInteger(installationId) || installationId <= 0 || !Number.isSafeInteger(repositoryId) || repositoryId <= 0) {
      throw new GithubControlPlaneError("github_repository_id_required", "numeric installationId and repositoryId are required.", 400);
    }
    await assertProjectWorkspace(env, projectId, principal!.workspaceId);
    const binding = await assertActiveBinding(env, principal!.workspaceId, installationId);
    const authority = await getRepositoryAuthority(env, principal!.workspaceId, installationId, repositoryId);
    const client = new GithubAppClient(env);
    const token = await client.createInstallationToken(binding.installation_id, [repositoryId], "metadata");
    const repo = await client.request<GithubRepository>(token.token, `/repos/${encodeURIComponent(authority.owner_login)}/${encodeURIComponent(authority.name)}`);
    if (repo.id !== repositoryId) throw new GithubControlPlaneError("github_repository_identity_mismatch", "GitHub repository identity did not match the requested numeric ID.", 409);
    const verifiedAt = now();
    await execute(
      database(env),
      `INSERT INTO project_github_verifications
       (project_id, workspace_id, installation_id, repository_id, repo_owner, repo_name, default_branch,
        verified_by_identity_id, verified_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(project_id) DO UPDATE SET
         installation_id = excluded.installation_id, repository_id = excluded.repository_id,
         repo_owner = excluded.repo_owner, repo_name = excluded.repo_name, default_branch = excluded.default_branch,
         verified_by_identity_id = excluded.verified_by_identity_id, verified_at = excluded.verified_at, updated_at = excluded.updated_at`,
      projectId,
      principal!.workspaceId,
      installationId,
      repo.id,
      repo.owner.login,
      repo.name,
      repo.default_branch,
      principal!.identityId,
      verifiedAt,
      verifiedAt,
    );
    return jsonOk({
      status: "verified" as const,
      repoVerifiedAt: verifiedAt,
      repository: {
        id: repo.id,
        owner: repo.owner.login,
        name: repo.name,
        fullName: repo.full_name,
        private: repo.private,
        defaultBranch: repo.default_branch,
        verifiedAt,
        installationId: binding.installation_id,
        account: installationTargetOf(binding),
      },
    });
  } catch (error) {
    return controlPlaneError(error);
  }
}

async function getVerifiedRepository(env: Env, projectId: string, workspaceId: string): Promise<VerificationRow> {
  const row = await queryFirst<VerificationRow>(
    database(env),
    `SELECT v.*, r.owner_login, r.name, r.full_name, r.is_private, r.state
       FROM project_github_verifications v
       JOIN github_installation_repositories r
         ON r.installation_id = v.installation_id AND r.repository_id = v.repository_id
      WHERE v.project_id = ? AND v.workspace_id = ? AND r.state = 'active' LIMIT 1`,
    projectId,
    workspaceId,
  );
  if (!row) throw new GithubControlPlaneError("github_repository_unverified", "Project does not have a verified numeric GitHub repository.", 409);
  return row;
}

function parseActivityRange(body: Record<string, unknown>): { from: string; to: string; fromMs: number; toMs: number } {
  if (typeof body.from !== "string" || typeof body.to !== "string") throw new GithubControlPlaneError("github_activity_range_invalid", "from and to ISO timestamps are required.", 400);
  const fromMs = Date.parse(body.from);
  const toMs = Date.parse(body.to);
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs || toMs - fromMs > 90 * 86_400_000) {
    throw new GithubControlPlaneError("github_activity_range_invalid", "Activity range must be valid, ascending, and no longer than 90 days.", 400);
  }
  return { from: new Date(fromMs).toISOString(), to: new Date(toMs).toISOString(), fromMs, toMs };
}

async function fetchGithubPages<T>(client: GithubAppClient, token: string, path: string): Promise<T[]> {
  const items: T[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const separator = path.includes("?") ? "&" : "?";
    const batch = await client.request<T[]>(token, `${path}${separator}per_page=100&page=${page}`);
    items.push(...batch);
    if (batch.length < 100) return items;
  }
  throw new GithubControlPlaneError("github_activity_too_large", "Activity range exceeds the safe 1,000-item pagination bound.", 413);
}

async function fetchWorkflowRuns(
  client: GithubAppClient,
  token: string,
  path: string,
): Promise<Array<{
  id: number;
  name?: string;
  display_title?: string;
  html_url: string;
  status: string;
  conclusion?: string | null;
  head_sha: string;
  event?: string;
  actor?: { login?: string };
  created_at: string;
  updated_at: string;
  run_started_at?: string | null;
  run_attempt?: number;
  head_branch?: string | null;
  repository?: { id?: number };
}>> {
  const runs: Awaited<ReturnType<typeof fetchWorkflowRuns>> = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await client.request<{ workflow_runs: typeof runs }>(token, `${path}&per_page=100&page=${page}`);
    runs.push(...response.workflow_runs);
    if (response.workflow_runs.length < 100) return runs;
  }
  throw new GithubControlPlaneError("github_ci_evidence_too_large", "Workflow evidence exceeds the safe 1,000-run pagination bound.", 413);
}

export async function handleGithubActivitySync(env: Env, request: Request, projectId: string, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requirePrincipal(principal);
  if (denied) return denied;
  try {
    const range = parseActivityRange(await parseJsonObject(request));
    await assertProjectWorkspace(env, projectId, principal!.workspaceId);
    const verified = await getVerifiedRepository(env, projectId, principal!.workspaceId);
    const binding = await assertActiveBinding(env, principal!.workspaceId, verified.installation_id);
    const client = new GithubAppClient(env);
    const token = await client.createInstallationToken(binding.installation_id, [verified.repository_id], "activity");
    const repoPath = `/repos/${encodeURIComponent(verified.owner_login)}/${encodeURIComponent(verified.name)}`;
    const commits = await fetchGithubPages<{ sha: string; html_url: string; author?: { login?: string }; commit: { message: string; author?: { date?: string }; committer?: { date?: string } } }>(
      client, token.token, `${repoPath}/commits?since=${encodeURIComponent(range.from)}&until=${encodeURIComponent(range.to)}`,
    );
    const pulls = await fetchGithubPages<{ id: number; number: number; title: string; html_url: string; updated_at: string; user?: { login?: string }; state: string; merged_at?: string | null }>(
      client, token.token, `${repoPath}/pulls?state=all&sort=updated&direction=desc`,
    );
    const issues = await fetchGithubPages<{ id: number; number: number; title: string; html_url: string; updated_at: string; user?: { login?: string }; state: string; pull_request?: unknown }>(
      client, token.token, `${repoPath}/issues?state=all&since=${encodeURIComponent(range.from)}`,
    );
    const workflowRuns = await fetchWorkflowRuns(
      client,
      token.token,
      `${repoPath}/actions/runs?created=${encodeURIComponent(`${range.from}..${range.to}`)}`,
    );
    const repoUrl = `https://github.com/${verified.full_name}`;
    const within = (value: string | undefined) => {
      const timestamp = Date.parse(value ?? "");
      return Number.isFinite(timestamp) && timestamp >= range.fromMs && timestamp < range.toMs;
    };
    const activity: GithubActivity[] = [];
    for (const commit of commits) {
      const occurredAt = commit.commit.author?.date ?? commit.commit.committer?.date;
      if (!occurredAt || !within(occurredAt)) continue;
      activity.push({ id: `github:${verified.repository_id}:commit:${commit.sha}`, projectId, repoFullName: verified.full_name, repoUrl, kind: "commit", title: commit.commit.message.split("\n", 1)[0], url: commit.html_url, actor: commit.author?.login ?? null, occurredAt, metadata: { sha: commit.sha } });
    }
    for (const pull of pulls) {
      if (!within(pull.updated_at)) continue;
      activity.push({ id: `github:${verified.repository_id}:pull:${pull.id}`, projectId, repoFullName: verified.full_name, repoUrl, kind: "pull_request", title: pull.title, url: pull.html_url, actor: pull.user?.login ?? null, occurredAt: pull.updated_at, metadata: { number: pull.number, state: pull.state, mergedAt: pull.merged_at ?? null } });
    }
    for (const issue of issues) {
      if (issue.pull_request || !within(issue.updated_at)) continue;
      activity.push({ id: `github:${verified.repository_id}:issue:${issue.id}`, projectId, repoFullName: verified.full_name, repoUrl, kind: "issue", title: issue.title, url: issue.html_url, actor: issue.user?.login ?? null, occurredAt: issue.updated_at, metadata: { number: issue.number, state: issue.state } });
    }
    const ciEvidence: GithubCiEvidence[] = [];
    for (const run of workflowRuns) {
      if (!Number.isSafeInteger(run.id) || run.id <= 0 || run.repository?.id !== verified.repository_id || !/^[a-f0-9]{40}$/i.test(run.head_sha)) {
        throw new GithubControlPlaneError("github_ci_identity_mismatch", "Workflow evidence does not match the verified numeric repository.", 409);
      }
      const occurredAt = run.updated_at || run.run_started_at || run.created_at;
      if (!within(occurredAt)) continue;
      ciEvidence.push({
        id: `github:${verified.repository_id}:workflow:${run.id}`,
        externalId: run.id,
        projectId,
        repoFullName: verified.full_name,
        evidenceClass: "ci",
        evidenceType: "workflow_run",
        name: run.name ?? run.display_title ?? "GitHub Actions workflow",
        status: run.status,
        conclusion: run.conclusion ?? null,
        url: run.html_url,
        headSha: run.head_sha,
        attempt: Number.isSafeInteger(run.run_attempt) ? run.run_attempt! : null,
        event: run.event ?? null,
        branch: run.head_branch ?? null,
        actor: run.actor?.login ?? null,
        occurredAt,
        metadata: { event: run.event ?? null, createdAt: run.created_at, startedAt: run.run_started_at ?? null },
      });
    }
    const boundedCommitShas = commits
      .filter((commit) => within(commit.commit.author?.date ?? commit.commit.committer?.date))
      .map((commit) => commit.sha);
    const evidenceShas = [...new Set([...boundedCommitShas, ...workflowRuns.map((run) => run.head_sha)].filter((sha) => /^[a-f0-9]{40}$/i.test(sha)))];
    let ciTruncated = evidenceShas.length > 25;
    const checkedShas = evidenceShas.slice(0, 25);
    for (const sha of checkedShas) {
      const checks = await client.request<{
        total_count: number;
        check_runs: Array<{
          id: number;
          name: string;
          html_url?: string;
          details_url?: string;
          status: string;
          conclusion?: string | null;
          head_sha: string;
          started_at?: string | null;
          completed_at?: string | null;
          app?: { slug?: string };
        }>;
      }>(token.token, `${repoPath}/commits/${encodeURIComponent(sha)}/check-runs?per_page=100`);
      if (checks.total_count > checks.check_runs.length) ciTruncated = true;
      for (const check of checks.check_runs) {
        if (!Number.isSafeInteger(check.id) || check.id <= 0 || check.head_sha !== sha) {
          throw new GithubControlPlaneError("github_ci_identity_mismatch", "Check evidence does not match its verified commit SHA.", 409);
        }
        const occurredAt = check.completed_at ?? check.started_at;
        if (!occurredAt || !within(occurredAt)) continue;
        ciEvidence.push({
          id: `github:${verified.repository_id}:check:${check.id}`,
          externalId: check.id,
          projectId,
          repoFullName: verified.full_name,
          evidenceClass: "ci",
          evidenceType: "check_run",
          name: check.name,
          status: check.status,
          conclusion: check.conclusion ?? null,
          url: check.html_url ?? check.details_url ?? repoUrl,
          headSha: check.head_sha,
          attempt: null,
          event: workflowRuns.find((run) => run.head_sha === sha)?.event ?? null,
          branch: workflowRuns.find((run) => run.head_sha === sha)?.head_branch ?? null,
          actor: check.app?.slug ?? null,
          occurredAt,
          metadata: { app: check.app?.slug ?? null, startedAt: check.started_at ?? null, completedAt: check.completed_at ?? null },
        });
      }
    }
    activity.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    ciEvidence.sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
    return jsonOk({ status: "synced" as const, activity, ciEvidence: { items: ciEvidence, truncated: ciTruncated, checkedShas } });
  } catch (error) {
    return controlPlaneError(error);
  }
}

export function validateWriteFiles(value: unknown): Array<{ path: string; content: string }> {
  if (!Array.isArray(value) || value.length === 0 || value.length > 100) throw new GithubControlPlaneError("github_files_invalid", "files must contain between 1 and 100 entries.", 400);
  const files = value.map((item) => item as { path?: unknown; content?: unknown });
  let total = 0;
  const seen = new Set<string>();
  const normalized = files.map((file) => {
    if (typeof file.path !== "string" || typeof file.content !== "string") throw new GithubControlPlaneError("github_files_invalid", "Each file requires string path and content.", 400);
    const path = file.path.replace(/\\/g, "/");
    const lowerPath = path.toLowerCase();
    if (!path || path.length > 1024 || /[\u0000-\u001f\u007f]/.test(path) || path.startsWith("/") ||
      path.split("/").some((part) => !part || part === "." || part === "..") ||
      lowerPath === ".github/workflows" || lowerPath.startsWith(".github/workflows/") || seen.has(path)) {
      throw new GithubControlPlaneError("github_path_forbidden", "File path is unsafe or targets .github/workflows.", 403);
    }
    seen.add(path);
    total += new TextEncoder().encode(file.content).length;
    return { path, content: file.content };
  });
  if (total > 1_000_000) throw new GithubControlPlaneError("github_files_too_large", "Combined file content exceeds one megabyte.", 413);
  return normalized.sort((left, right) => left.path.localeCompare(right.path));
}

function safeBranchPart(projectId: string): string {
  return projectId.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "project";
}

export async function handleGithubPullRequest(env: Env, request: Request, projectId: string, principal: PlexusPrincipal | null): Promise<Response> {
  const denied = requireAdmin(principal);
  if (denied) return denied;
  try {
    const body = await parseJsonObject(request);
    const repositoryId = Number(body.repositoryId);
    const baseSha = typeof body.baseSha === "string" ? body.baseSha.trim() : "";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const pullBody = typeof body.body === "string" ? body.body : "";
    const requestedCommitMessage = typeof body.commitMessage === "string" ? body.commitMessage.trim() : "";
    if (!Number.isSafeInteger(repositoryId) || repositoryId <= 0 || !/^[a-f0-9]{40}$/i.test(baseSha) || !title || title.length > 256 ||
      pullBody.length > 65_536 || requestedCommitMessage.length > 512 || /[\u0000-\u001f\u007f]/.test(title) ||
      /[\u0000\u007f]/.test(pullBody + requestedCommitMessage)) {
      throw new GithubControlPlaneError("github_pull_request_invalid", "repositoryId, exact 40-character baseSha, and title are required.", 400);
    }
    const files = validateWriteFiles(body.files);
    await assertProjectWorkspace(env, projectId, principal!.workspaceId);
    await ensureActiveAdmin(env, principal!);
    const actor = await getWorkspaceActor(env, principal!.workspaceId, principal!.identityId);
    if (!actor) throw new GithubControlPlaneError("github_actor_not_verified", "Current Plexus administrator has not verified a GitHub identity.", 403);
    assertAllowedGithubActor(githubActorPolicy(env), { id: actor.github_user_id, login: actor.github_login });
    const verified = await getVerifiedRepository(env, projectId, principal!.workspaceId);
    if (verified.repository_id !== repositoryId) throw new GithubControlPlaneError("github_repository_forbidden", "Repository is not the verified project repository.", 403);
    const binding = await assertActiveBinding(env, principal!.workspaceId, verified.installation_id);
    const operationKey = await sha256Hex(JSON.stringify({ workspace: principal!.workspaceId, actor: principal!.identityId, projectId, repositoryId, baseSha, title, pullBody, commitMessage: requestedCommitMessage, files }));
    const branch = `plexus/${safeBranchPart(projectId)}-${operationKey.slice(0, 12)}`;
    if (branch === verified.default_branch) throw new GithubControlPlaneError("github_default_branch_forbidden", "Default branch writes are forbidden.", 403);
    const client = new GithubAppClient(env);
    const token = await client.createInstallationToken(binding.installation_id, [repositoryId], "write");
    if (!(await client.hasWritePermission(token.token, verified.owner_login, verified.name, actor.github_login, actor.github_user_id))) {
      throw new GithubControlPlaneError("github_membership_forbidden", "Verified GitHub actor no longer has write, maintain, or admin permission.", 403);
    }
    const existing = await queryFirst<{ status: string; branch_name: string; pull_request_number: number | null; pull_request_url: string | null; commit_sha: string | null }>(database(env), "SELECT status, branch_name, pull_request_number, pull_request_url, commit_sha FROM github_write_operations WHERE operation_key = ? LIMIT 1", operationKey);
    if (existing?.status === "completed") return jsonOk({ status: "created" as const, idempotent: true, branch: existing.branch_name, commitSha: existing.commit_sha, pullRequest: { number: existing.pull_request_number, url: existing.pull_request_url } });
    if (existing && existing.status !== "failed") throw new GithubControlPlaneError("github_write_in_progress", "An identical guarded write is already in progress.", 409, true);
    let operationTracked = Boolean(existing);
    try {
      const repoPath = `/repos/${encodeURIComponent(verified.owner_login)}/${encodeURIComponent(verified.name)}`;
      const repo = await client.request<GithubRepository>(token.token, repoPath);
      if (repo.id !== repositoryId || repo.default_branch !== verified.default_branch) throw new GithubControlPlaneError("github_repository_changed", "Repository identity or default branch changed; verify it again.", 409);
      if (existing?.status === "failed" && existing.commit_sha) {
        const branchRef = await client.request<{ object: { sha: string } }>(token.token, `${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`);
        const committed = await client.request<{ parents: Array<{ sha: string }> }>(token.token, `${repoPath}/git/commits/${existing.commit_sha}`);
        if (branchRef.object.sha !== existing.commit_sha || committed.parents[0]?.sha !== baseSha) {
          throw new GithubControlPlaneError("github_write_recovery_conflict", "Existing deterministic branch does not match the recorded guarded write.", 409);
        }
        const priorPulls = await client.request<Array<{ number: number; html_url: string }>>(
          token.token,
          `${repoPath}/pulls?state=all&head=${encodeURIComponent(`${verified.owner_login}:${branch}`)}&per_page=1`,
        );
        const pull = priorPulls[0] ?? await client.request<{ number: number; html_url: string }>(token.token, `${repoPath}/pulls`, {
          method: "POST",
          body: JSON.stringify({ title, body: `${pullBody}\n\n---\nCreated by Plexus workspace \`${principal!.workspaceId}\` actor \`${principal!.identityId}\`.`, head: branch, base: repo.default_branch }),
        });
        await execute(database(env), "UPDATE github_write_operations SET pull_request_number = ?, pull_request_url = ?, status = 'completed', updated_at = ? WHERE operation_key = ?", pull.number, pull.html_url, now(), operationKey);
        return jsonOk({ status: "created" as const, idempotent: true, branch, commitSha: existing.commit_sha, pullRequest: { number: pull.number, url: pull.html_url } });
      }
      const unexpectedBranch = await client.requestOptional<{ object: { sha: string } }>(token.token, `${repoPath}/git/ref/heads/${encodeURIComponent(branch)}`);
      if (unexpectedBranch) throw new GithubControlPlaneError("github_branch_conflict", "Deterministic Plexus branch already exists without a matching completed operation.", 409);
      const ref = await client.request<{ object: { sha: string } }>(token.token, `${repoPath}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
      if (ref.object.sha !== baseSha) throw new GithubControlPlaneError("github_base_sha_conflict", "Default branch advanced; refresh and retry with the exact current base SHA.", 409);
      const timestamp = now();
      if (!existing) {
        await execute(database(env), `INSERT INTO github_write_operations
          (operation_key, workspace_id, project_id, repository_id, actor_identity_id, base_sha, branch_name, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'started', ?, ?)`, operationKey, principal!.workspaceId, projectId, repositoryId, principal!.identityId, baseSha, branch, timestamp, timestamp);
        operationTracked = true;
      } else {
        await execute(database(env), "UPDATE github_write_operations SET status = 'started', updated_at = ? WHERE operation_key = ?", timestamp, operationKey);
      }
      const baseCommit = await client.request<{ tree: { sha: string } }>(token.token, `${repoPath}/git/commits/${baseSha}`);
      const treeEntries: Array<{ path: string; mode: "100644"; type: "blob"; sha: string }> = [];
      for (const file of files) {
        const blob = await client.request<{ sha: string }>(token.token, `${repoPath}/git/blobs`, { method: "POST", body: JSON.stringify({ content: file.content, encoding: "utf-8" }) });
        treeEntries.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
      }
      const tree = await client.request<{ sha: string }>(token.token, `${repoPath}/git/trees`, { method: "POST", body: JSON.stringify({ base_tree: baseCommit.tree.sha, tree: treeEntries }) });
      const message = `${requestedCommitMessage || title}\n\nPlexus-Workspace: ${principal!.workspaceId}\nPlexus-Actor: ${principal!.identityId}`;
      const commit = await client.request<{ sha: string }>(token.token, `${repoPath}/git/commits`, { method: "POST", body: JSON.stringify({ message, tree: tree.sha, parents: [baseSha] }) });
      const finalRef = await client.request<{ object: { sha: string } }>(token.token, `${repoPath}/git/ref/heads/${encodeURIComponent(repo.default_branch)}`);
      if (finalRef.object.sha !== baseSha) throw new GithubControlPlaneError("github_base_sha_conflict", "Default branch advanced while preparing the commit; no branch was created.", 409);
      await client.request<{ ref: string }>(token.token, `${repoPath}/git/refs`, { method: "POST", body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: commit.sha }) });
      await execute(database(env), "UPDATE github_write_operations SET commit_sha = ?, status = 'committed', updated_at = ? WHERE operation_key = ?", commit.sha, now(), operationKey);
      const attribution = `\n\n---\nCreated by Plexus workspace \`${principal!.workspaceId}\` actor \`${principal!.identityId}\`.`;
      const pull = await client.request<{ number: number; html_url: string }>(token.token, `${repoPath}/pulls`, { method: "POST", body: JSON.stringify({ title, body: `${pullBody}${attribution}`, head: branch, base: repo.default_branch }) });
      await execute(database(env), "UPDATE github_write_operations SET pull_request_number = ?, pull_request_url = ?, status = 'completed', updated_at = ? WHERE operation_key = ?", pull.number, pull.html_url, now(), operationKey);
      return jsonOk({ status: "created" as const, idempotent: false, branch, commitSha: commit.sha, pullRequest: { number: pull.number, url: pull.html_url } }, { status: 201 });
    } catch (error) {
      if (operationTracked) await execute(database(env), "UPDATE github_write_operations SET status = 'failed', updated_at = ? WHERE operation_key = ?", now(), operationKey);
      throw error;
    }
  } catch (error) {
    return controlPlaneError(error);
  }
}
