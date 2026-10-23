import type { Env } from "../lib/env";
import { GithubAppClient, GithubControlPlaneError } from "../lib/github-app";
import { queryFirst } from "../lib/db";
import { jsonError, jsonOk } from "../lib/response";

var MAX_FILES_PER_ROUTINE = 8;
var MAX_FILE_BYTES = 16 * 1024;
var MAX_TOTAL_EXCERPT_CHARS = 12e3;
function gatewayError(error: unknown) {
  if (error instanceof GithubControlPlaneError) {
    return jsonError({ code: error.code, message: error.message, retryable: error.retryable }, error.status, { headers: { "cache-control": "no-store" } });
  }
  console.error("github_knowledge_gateway_failed", { category: error instanceof Error ? error.name : typeof error });
  return jsonError({ code: "knowledge_gateway_failed", message: "Knowledge gateway request failed.", retryable: false }, 500, { headers: { "cache-control": "no-store" } });
}
function requireGatewayAuth(request: Request, env: Env) {
  const expected = env.TF_KNOWLEDGE_GATEWAY_TOKEN?.trim();
  if (!expected) return jsonError({ code: "server_misconfigured", message: "Knowledge gateway credential is not configured.", retryable: false }, 503, { headers: { "cache-control": "no-store" } });
  const value = request.headers.get("authorization");
  if (!value?.startsWith("Bearer ")) return jsonError({ code: "missing_authorization", message: "Knowledge gateway bearer is required.", retryable: false }, 401, { headers: { "cache-control": "no-store" } });
  if (value.slice(7).trim() !== expected) return jsonError({ code: "invalid_authorization", message: "Knowledge gateway bearer is invalid.", retryable: false }, 403, { headers: { "cache-control": "no-store" } });
  return null;
}
function routineAllowlist(env: Env) {
  const source = env.TF_KNOWLEDGE_ROUTINE_ALLOWLIST_JSON;
  if (!source) throw new GithubControlPlaneError("knowledge_gateway_not_configured", "Knowledge routine policy is not configured.", 503);
  let parsed;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new GithubControlPlaneError("knowledge_gateway_not_configured", "Knowledge routine policy is invalid.", 503);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new GithubControlPlaneError("knowledge_gateway_not_configured", "Knowledge routine policy is invalid.", 503);
  const result: Record<string, {path: string; title: string}[]> = {};
  for (const [routine, files] of Object.entries(parsed)) {
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(routine) || !Array.isArray(files) || files.length === 0 || files.length > MAX_FILES_PER_ROUTINE) continue;
    const normalized = files.filter((file) => Boolean(file) && typeof file === "object" && typeof file.path === "string" && typeof file.title === "string").map((file) => ({ path: file.path.trim(), title: file.title.trim() })).filter((file) => /^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$/.test(file.path) && !file.path.includes("..") && file.title.length > 0 && file.title.length <= 160);
    if (normalized.length === files.length) result[routine] = normalized;
  }
  return result;
}
async function verifiedRepository(env: Env) {
  const workspaceId = env.TF_KNOWLEDGE_WORKSPACE_ID?.trim();
  const projectId = env.TF_KNOWLEDGE_PROJECT_ID?.trim();
  if (!workspaceId || !projectId || !env.TEAMFORGE_DB) throw new GithubControlPlaneError("knowledge_gateway_not_configured", "Knowledge gateway scope is not configured.", 503);
  const row = await queryFirst<{installation_id: number; repository_id: number; owner_login: string; name: string; full_name: string; default_branch: string}>(env.TEAMFORGE_DB, `SELECT v.installation_id, v.repository_id, r.owner_login, r.name, r.full_name, v.default_branch
    FROM project_github_verifications v JOIN github_installation_repositories r ON r.installation_id = v.installation_id AND r.repository_id = v.repository_id
    JOIN github_workspace_installations b ON b.installation_id = v.installation_id
    WHERE v.project_id = ? AND v.workspace_id = ? AND b.workspace_id = ? AND b.state = 'active' AND r.state = 'active'
    AND v.repo_owner = r.owner_login AND v.repo_name = r.name AND v.default_branch = r.default_branch LIMIT 1`, projectId, workspaceId, workspaceId);
  if (!row) throw new GithubControlPlaneError("knowledge_repository_unverified", "Knowledge source repository is not verified.", 409);
  return row;
}
function decodeContent(encoded: string) {
  const compact = encoded.replace(/\s/g, "");
  const bytes = Uint8Array.from(atob(compact), (char) => char.charCodeAt(0));
  if (bytes.byteLength > MAX_FILE_BYTES) throw new GithubControlPlaneError("knowledge_source_too_large", "Knowledge source file exceeds the gateway limit.", 413);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
function excerpt(value: string, remaining: number) {
  return value.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, Math.max(0, remaining));
}
export async function handleGithubKnowledgeRoutineSnapshot(request: Request, env: Env, url: URL) {
  const denied = requireGatewayAuth(request, env);
  if (denied) return denied;
  try {
    const routine = url.searchParams.get("routine") ?? "";
    const files = routineAllowlist(env)[routine];
    if (!files) throw new GithubControlPlaneError("knowledge_routine_forbidden", "Knowledge routine is not approved.", 403);
    const repository = await verifiedRepository(env);
    const client = new GithubAppClient(env);
    const token = await client.createInstallationToken(repository.installation_id, [repository.repository_id], "read");
    const repoPath = `/repos/${encodeURIComponent(repository.owner_login)}/${encodeURIComponent(repository.name)}`;
    const branch = await client.request<{sha: string}>(token.token, `${repoPath}/commits/${encodeURIComponent(repository.default_branch)}`);
    if (!branch.sha || !/^[a-f0-9]{40}$/i.test(branch.sha)) throw new GithubControlPlaneError("knowledge_source_invalid", "Knowledge source commit is invalid.", 502, true);
    let remaining = MAX_TOTAL_EXCERPT_CHARS;
    const documents = [];
    for (const file of files) {
      const content = await client.request<{type: string; content: string; sha: string; path: string}>(token.token, `${repoPath}/contents/${file.path.split("/").map(encodeURIComponent).join("/")}?ref=${encodeURIComponent(branch.sha)}`);
      if (content.type !== "file" || !content.content || !content.sha || content.path !== file.path) throw new GithubControlPlaneError("knowledge_source_invalid", "Knowledge source file is invalid.", 502, true);
      const text = excerpt(decodeContent(content.content), remaining);
      remaining -= text.length;
      documents.push({ title: file.title, path: file.path, fileSha: content.sha, excerpt: text });
    }
    return jsonOk({ schemaVersion: "thoughtseed.github-knowledge-snapshot.v1", routine, repository: repository.full_name, commit: branch.sha, documents }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return gatewayError(error);
  }
}
