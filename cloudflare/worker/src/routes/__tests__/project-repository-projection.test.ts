import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { D1DatabaseLike, Env } from "../../lib/env";
import type { ProjectGraph } from "../../lib/project-registry";
import type { PlexusPrincipal } from "../../lib/plexus-session";
import { projectRepositoryVerificationGraphs } from "../github";
import { handleGetProjectMappings, handleGetProjectControlPlane } from "../projects";

const registry = vi.hoisted(() => ({ list: vi.fn(), detail: vi.fn() }));
vi.mock("../../lib/project-registry", async (original) => ({
  ...await original<typeof import("../../lib/project-registry")>(), listProjectGraphs: registry.list,
}));
vi.mock("../../lib/sync-control-plane", async (original) => ({
  ...await original<typeof import("../../lib/sync-control-plane")>(), getProjectControlPlaneDetail: registry.detail,
}));

const actor: PlexusPrincipal = {
  identityId: "member", workspaceId: "ws", role: "employee", projectVisibility: "active",
  email: "member@example.test", displayName: "Member", employeeId: "employee", capabilities: {},
};
const graph = (id = "project", workspaceId = "ws"): ProjectGraph => ({
  project: { id, workspaceId, name: id, status: "active" },
  githubLinks: [], hulyLinks: [], artifacts: [], policy: null, externalIds: [], clientProfile: null,
} as ProjectGraph);

let sqlite: DatabaseSync;
let env: Env;
let reads: number;
const permissions = JSON.stringify({ metadata: "read", contents: "write", pull_requests: "write", issues: "read", actions: "read", checks: "read" });

beforeEach(() => {
  reads = 0;
  sqlite = new DatabaseSync(":memory:");
  sqlite.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, workspace_id TEXT, status TEXT);
    CREATE TABLE plexus_identities (id TEXT PRIMARY KEY, workspace_id TEXT, is_active INTEGER, project_visibility TEXT);
    CREATE TABLE project_github_verifications (project_id TEXT PRIMARY KEY, workspace_id TEXT, installation_id INTEGER,
      repository_id INTEGER, repo_owner TEXT, repo_name TEXT, default_branch TEXT, verified_at TEXT);
    CREATE TABLE github_workspace_installations (workspace_id TEXT, installation_id INTEGER, state TEXT, account_id INTEGER);
    CREATE TABLE github_installation_facts (installation_id INTEGER PRIMARY KEY, account_id INTEGER, account_login TEXT,
      account_type TEXT, repository_selection TEXT, permissions_json TEXT, state TEXT);
    CREATE TABLE github_installation_repositories (installation_id INTEGER, repository_id INTEGER, owner_login TEXT,
      name TEXT, full_name TEXT, default_branch TEXT, state TEXT);
    INSERT INTO projects VALUES ('project', 'ws', 'active');
    INSERT INTO plexus_identities VALUES ('member', 'ws', 1, 'active');
    INSERT INTO project_github_verifications VALUES ('project', 'ws', 42, 101, 'thoughtseed', 'private-repo', 'main', '2026-07-13T00:00:00.000Z');
    INSERT INTO github_workspace_installations VALUES ('ws', 42, 'active', 8);
    INSERT INTO github_installation_repositories VALUES (42, 101, 'thoughtseed', 'private-repo', 'thoughtseed/private-repo', 'main', 'active');
  `);
  sqlite.prepare("INSERT INTO github_installation_facts VALUES (42, 8, 'thoughtseed', 'Organization', 'selected', ?, 'active')").run(permissions);
  const db: D1DatabaseLike = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let params: Array<string | number | null> = [];
      const bound = {
        bind(...values: unknown[]) { params = values as typeof params; return bound; },
        async first<T>() { reads++; return (statement.get(...params) ?? null) as T | null; },
        async all<T>() { reads++; return { results: statement.all(...params) as T[] }; },
        async run() { throw new Error("Projection attempted a database mutation"); },
      };
      return bound;
    },
  };
  env = { TF_ENV: "test", TEAMFORGE_DB: db, TF_GITHUB_ALLOWED_INSTALLATION_ACCOUNTS: "Organization:thoughtseed:8" };
  registry.list.mockResolvedValue([graph()]);
  registry.detail.mockResolvedValue({ project: graph(), summary: { openConflicts: 0 } });
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Projection attempted a GitHub request"); }));
});

afterEach(() => {
  sqlite.close();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("current project repository verification projection", () => {
  it("restores a complete verified tuple to a fresh graph with no local or descriptive GitHub data", async () => {
    const before = sqlite.prepare("SELECT * FROM project_github_verifications").all();
    const response = await handleGetProjectMappings(env, new URL("https://worker.test/v1/project-mappings?workspace_id=ws"), actor);
    const body = await response.json() as any;
    expect(body.data.projects[0]).toMatchObject({
      repositoryVerification: { version: 1, status: "verified", checkedAt: expect.any(String) },
      project: { githubRepoId: "101", githubInstallationId: 42, githubRepoOwnerId: 8,
        githubRepoOwnerLogin: "thoughtseed", githubRepoOwnerType: "Organization",
        githubRepoFullName: "thoughtseed/private-repo", githubRepoUrl: "https://github.com/thoughtseed/private-repo",
        repoEvidenceStatus: "verified", repoVerifiedAt: "2026-07-13T00:00:00.000Z", repoAuthoritySource: "worker" },
      githubLinks: [],
    });
    expect(registry.list).toHaveBeenCalledWith(env.TEAMFORGE_DB, "ws", "active");
    expect(reads).toBe(1);
    expect(sqlite.prepare("SELECT * FROM project_github_verifications").all()).toEqual(before);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("uses the same projection for the single-project control-plane response", async () => {
    const response = await handleGetProjectControlPlane(env, "project", actor);
    const body = await response.json() as any;
    expect(body.data.detail.project.repositoryVerification.status).toBe("verified");
    expect(body.data.detail.summary).toEqual({ openConflicts: 0 });
  });

  it("retains live-verified proof when a signed repository fact omits its optional branch", async () => {
    sqlite.exec("UPDATE github_installation_repositories SET default_branch=NULL");
    const [result] = await projectRepositoryVerificationGraphs(env, [graph()], actor);
    expect(result.repositoryVerification.status).toBe("verified");
    expect(result.project.repoEvidenceStatus).toBe("verified");
    expect(result.project.githubRepoId).not.toBeNull();
  });

  it.each([
    ["suspended installation", "UPDATE github_workspace_installations SET state='suspended'"],
    ["revoked installation", "UPDATE github_workspace_installations SET state='revoked'"],
    ["deleted signed fact", "UPDATE github_installation_facts SET state='deleted'"],
    ["removed repository", "UPDATE github_installation_repositories SET state='removed'"],
    ["missing repository", "DELETE FROM github_installation_repositories"],
    ["missing installation", "DELETE FROM github_workspace_installations"],
    ["incomplete permissions", "UPDATE github_installation_facts SET permissions_json='{}'"],
    ["invalid selection", "UPDATE github_installation_facts SET repository_selection='unknown'"],
    ["different installation owner", "UPDATE github_installation_facts SET account_id=9"],
    ["renamed repository", "UPDATE github_installation_repositories SET name='renamed', full_name='thoughtseed/renamed'"],
    ["transferred repository", "UPDATE github_installation_repositories SET owner_login='other', full_name='other/private-repo'"],
    ["changed default branch", "UPDATE github_installation_repositories SET default_branch='other'"],
    ["invalid timestamp", "UPDATE project_github_verifications SET verified_at='invalid'"],
  ])("clears the tuple for %s instead of trusting the stored verification", async (_label, sql) => {
    sqlite.exec(sql);
    const [result] = await projectRepositoryVerificationGraphs(env, [graph()], actor);
    expect(result.repositoryVerification).toMatchObject({ version: 1, status: "revoked" });
    for (const field of ["githubRepoId", "githubInstallationId", "githubRepoOwnerId", "githubRepoOwnerLogin", "githubRepoOwnerType", "githubRepoUrl", "githubRepoFullName", "repoVerifiedAt"] as const) {
      expect(result.project[field], field).toBeNull();
    }
    expect(result.project.repoEvidenceStatus).toBe("inaccessible");
  });

  it.each([
    ["inactive actor", "UPDATE plexus_identities SET is_active=0"],
    ["different actor workspace", "UPDATE plexus_identities SET workspace_id='other'"],
    ["project moved workspace", "UPDATE projects SET workspace_id='other'"],
    ["inactive project", "UPDATE projects SET status='archived'"],
    ["inactive project visible to all-project actor", "UPDATE plexus_identities SET project_visibility='all'; UPDATE projects SET status='archived'"],
    ["unresolved assigned scope", "UPDATE plexus_identities SET project_visibility='assigned'"],
    ["removed verification", "DELETE FROM project_github_verifications"],
  ])("does not expose a grant for %s", async (_label, sql) => {
    sqlite.exec(sql);
    const [result] = await projectRepositoryVerificationGraphs(env, [graph()], actor);
    expect(result.repositoryVerification.status).toBe("unverified");
    expect(result.project.githubRepoId).toBeNull();
  });

  it("does not let internal auth or a request workspace select another actor's grant", async () => {
    for (const principal of [null, { ...actor, workspaceId: "other" }, { ...actor, identityId: "unknown" }]) {
      const [result] = await projectRepositoryVerificationGraphs(env, [graph()], principal);
      expect(result.repositoryVerification.status).toBe("unverified");
      expect(result.project.githubRepoId).toBeNull();
    }
  });

  it("batches current authority reads without per-project GitHub requests", async () => {
    const graphs = Array.from({ length: 81 }, (_, index) => graph(`project-${index}`));
    const results = await projectRepositoryVerificationGraphs(env, graphs, actor);
    expect(reads).toBe(2);
    expect(results).toHaveLength(81);
    expect(results.every((result) => result.repositoryVerification.status === "unverified")).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });
});
