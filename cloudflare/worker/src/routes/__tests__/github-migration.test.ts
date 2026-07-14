import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("GitHub multi-installation migration", () => {
  it("preserves prior bindings while enforcing workspace and account uniqueness", () => {
    const sql = readFileSync(new URL("../../../migrations/0014_github_multi_owner_installations.sql", import.meta.url), "utf8");
    expect(sql).toContain("INSERT INTO github_workspace_installations");
    expect(sql).toContain("SELECT");
    expect(sql).toMatch(/PRIMARY KEY\s*\(workspace_id,\s*installation_id\)/i);
    expect(sql).toMatch(/installation_id\s+INTEGER\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toMatch(/UNIQUE\s*\(workspace_id,\s*account_id\)/i);
    expect(sql).toMatch(/connection_nonce_hash\s+TEXT\s+NOT NULL\s+UNIQUE/i);
    expect(sql).toContain("target_account_id");
    expect(sql).toContain("target_account_login");
    expect(sql).toContain("target_account_type");
  });
});
