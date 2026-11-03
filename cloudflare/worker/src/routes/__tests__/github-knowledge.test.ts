import {afterEach, describe, expect, it, vi} from "vitest";
import type {Env} from "../../lib/env";
import {GithubAppClient, GithubControlPlaneError} from "../../lib/github-app";
import {handleV1Request} from "../v1";

const baseEnv = {TF_ENV: "test", TF_KNOWLEDGE_GATEWAY_TOKEN: "machine-token", TF_KNOWLEDGE_WORKSPACE_ID: "workspace", TF_KNOWLEDGE_PROJECT_ID: "project", TF_KNOWLEDGE_ROUTINE_ALLOWLIST_JSON: JSON.stringify({daily: [{path: "notes/daily.md", title: "Daily"}]})} as Env;
function request(token?: string, routine = "daily") {
  const url = new URL(`https://worker/v1/github/knowledge/routine-snapshot?routine=${routine}`);
  const req = new Request(url, {headers: token ? {authorization: `Bearer ${token}`} : {}});
  return {url, req};
}
function database(row: unknown) {
  const scopes: unknown[][] = [];
  return {scopes, db: {prepare: (sql: string) => ({bind: (...args: unknown[]) => {scopes.push([sql, ...args]); return {first: async () => row};}})} as unknown as Env["TEAMFORGE_DB"]};
}
afterEach(() => vi.restoreAllMocks());
describe("recovered deployed knowledge gateway", () => {
  it("uses only dedicated gateway auth before normal app identity resolution", async () => {
    for (const [token, status] of [[undefined, 401], ["wrong", 403], ["machine-token", 503]] as const) {
      const {req, url} = request(token);
      expect((await handleV1Request(req, baseEnv, url)).status).toBe(status);
    }
    const {req, url} = request("machine-token");
    expect((await handleV1Request(req, {...baseEnv, TF_KNOWLEDGE_GATEWAY_TOKEN: undefined}, url)).status).toBe(503);
  });
  it("denies unknown routines and unverified scoped repositories", async () => {
    const data = database(null);
    const env = {...baseEnv, TEAMFORGE_DB: data.db};
    let input = request("machine-token", "unapproved");
    expect((await handleV1Request(input.req, env, input.url)).status).toBe(403);
    input = request("machine-token");
    expect((await handleV1Request(input.req, env, input.url)).status).toBe(409);
    expect(data.scopes[0].slice(1)).toEqual(["project", "workspace", "workspace"]);
  });
  it("pins approved files to a verified commit using repository scoped read tokens", async () => {
    const data = database({installation_id: 7, repository_id: 12, owner_login: "owner", name: "repo", full_name: "owner/repo", default_branch: "main"});
    const token = vi.spyOn(GithubAppClient.prototype, "createInstallationToken").mockResolvedValue({token: "github-private", expiresAt: "later"} as any);
    const github = vi.spyOn(GithubAppClient.prototype, "request").mockResolvedValueOnce({sha: "a".repeat(40)}).mockResolvedValueOnce({type: "file", content: btoa("hello\n\n\nworld"), sha: "file-sha", path: "notes/daily.md"});
    const {req, url} = request("machine-token");
    const response = await handleV1Request(req, {...baseEnv, TEAMFORGE_DB: data.db}, url);
    expect(response.status).toBe(200);
    expect(token).toHaveBeenCalledWith(7, [12], "read");
    expect(github.mock.calls[1][1]).toBe(`/repos/owner/repo/contents/notes/daily.md?ref=${"a".repeat(40)}`);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json() as any;
    expect(body.data.documents[0].excerpt).toBe("hello\n\nworld");
    expect(JSON.stringify(body)).not.toContain("github-private");
  });
  it("preserves provider failure status and rejects invalid commits", async () => {
    const data = database({installation_id: 7, repository_id: 12, owner_login: "owner", name: "repo", full_name: "owner/repo", default_branch: "main"});
    const token = vi.spyOn(GithubAppClient.prototype, "createInstallationToken").mockRejectedValueOnce(new GithubControlPlaneError("upstream", "Unavailable", 502, true));
    const {req, url} = request("machine-token");
    expect((await handleV1Request(req, {...baseEnv, TEAMFORGE_DB: data.db}, url)).status).toBe(502);
    token.mockResolvedValue({token: "github-private"} as any);
    vi.spyOn(GithubAppClient.prototype, "request").mockResolvedValue({sha: "invalid"});
    expect((await handleV1Request(req, {...baseEnv, TEAMFORGE_DB: data.db}, url)).status).toBe(502);
  });
});
