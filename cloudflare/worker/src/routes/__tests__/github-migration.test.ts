import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

describe("GitHub multi-installation migration", () => {
  it("preserves a 0012 binding through 0013 and 0014 while enforcing multi-account authority", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE workspaces (id TEXT PRIMARY KEY);
        CREATE TABLE plexus_identities (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        CREATE TABLE projects (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL,
          FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
        );
        INSERT INTO workspaces (id) VALUES ('ws_test');
        INSERT INTO plexus_identities (id, workspace_id) VALUES ('pid_admin', 'ws_test');
      `);
      db.exec(readFileSync(new URL("../../../migrations/0012_github_app_control_plane.sql", import.meta.url), "utf8"));
      db.exec(`
        INSERT INTO github_connection_states (
          nonce_hash, workspace_id, plexus_actor_id, expires_at, consumed_at,
          oauth_user_id, oauth_login, oauth_verified_at, untrusted_installation_id,
          status, created_at, updated_at
        ) VALUES (
          'nonce-legacy', 'ws_test', 'pid_admin', 1999999999, '2026-07-13T00:00:00Z',
          7611727, 'Sheshiyer', '2026-07-13T00:00:00Z', 42,
          'bound', '2026-07-13T00:00:00Z', '2026-07-13T00:00:00Z'
        );
        INSERT INTO github_installation_facts (
          installation_id, account_id, account_login, account_type,
          installer_sender_id, installer_sender_login, last_actor_id, last_actor_login,
          repository_selection, state, last_delivery_id, observed_at, updated_at
        ) VALUES (
          42, 65741640, 'thoughtseed-labs', 'Organization',
          7611727, 'Sheshiyer', 7611727, 'Sheshiyer',
          'selected', 'active', 'delivery-legacy', '2026-07-13T00:00:00Z', '2026-07-13T00:00:00Z'
        );
        INSERT INTO github_workspace_installations (
          workspace_id, installation_id, connected_by_identity_id,
          verified_github_user_id, verified_github_login, connection_nonce_hash,
          state, created_at, updated_at
        ) VALUES (
          'ws_test', 42, 'pid_admin', 7611727, 'Sheshiyer', 'nonce-legacy',
          'active', '2026-07-13T00:00:00Z', '2026-07-13T00:00:00Z'
        );
      `);

      db.exec(readFileSync(new URL("../../../migrations/0013_github_workspace_actors.sql", import.meta.url), "utf8"));
      db.exec(readFileSync(new URL("../../../migrations/0014_github_multi_owner_installations.sql", import.meta.url), "utf8"));

      expect(db.prepare(`
        SELECT workspace_id, installation_id, account_id
        FROM github_workspace_installations
        WHERE workspace_id = 'ws_test' AND installation_id = 42
      `).get()).toMatchObject({ workspace_id: "ws_test", installation_id: 42, account_id: 65741640 });
      expect(db.prepare(`
        SELECT github_user_id, github_login, verification_source
        FROM github_workspace_actors
        WHERE workspace_id = 'ws_test' AND plexus_identity_id = 'pid_admin'
      `).get()).toMatchObject({ github_user_id: 7611727, github_login: "Sheshiyer", verification_source: "installation" });

      const targetColumns = db.prepare("PRAGMA table_info(github_connection_states)").all()
        .map((column) => String(column.name))
        .filter((name) => name.startsWith("target_account_"));
      expect(targetColumns).toEqual(["target_account_id", "target_account_login", "target_account_type"]);

      db.exec(`
        INSERT INTO github_connection_states (
          nonce_hash, workspace_id, plexus_actor_id, expires_at, consumed_at,
          oauth_user_id, oauth_login, oauth_verified_at, untrusted_installation_id,
          target_account_id, target_account_login, target_account_type,
          status, created_at, updated_at
        ) VALUES (
          'nonce-founder', 'ws_test', 'pid_admin', 1999999999, '2026-07-14T00:00:00Z',
          7611727, 'Sheshiyer', '2026-07-14T00:00:00Z', 84,
          7611727, 'Sheshiyer', 'User',
          'bound', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        );
        INSERT INTO github_installation_facts (
          installation_id, account_id, account_login, account_type,
          installer_sender_id, installer_sender_login, last_actor_id, last_actor_login,
          repository_selection, state, last_delivery_id, observed_at, updated_at
        ) VALUES (
          84, 7611727, 'Sheshiyer', 'User',
          7611727, 'Sheshiyer', 7611727, 'Sheshiyer',
          'selected', 'active', 'delivery-founder', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        );
        INSERT INTO github_workspace_installations (
          workspace_id, installation_id, account_id, connected_by_identity_id,
          verified_github_user_id, verified_github_login, connection_nonce_hash,
          state, created_at, updated_at
        ) VALUES (
          'ws_test', 84, 7611727, 'pid_admin',
          7611727, 'Sheshiyer', 'nonce-founder',
          'active', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        );
      `);
      expect(db.prepare(`
        SELECT installation_id, account_id
        FROM github_workspace_installations
        WHERE workspace_id = 'ws_test'
        ORDER BY installation_id
      `).all()).toEqual([
        { installation_id: 42, account_id: 65741640 },
        { installation_id: 84, account_id: 7611727 },
      ]);

      db.exec(`
        INSERT INTO github_connection_states (
          nonce_hash, workspace_id, plexus_actor_id, expires_at,
          target_account_id, target_account_login, target_account_type,
          status, created_at, updated_at
        ) VALUES (
          'nonce-duplicate', 'ws_test', 'pid_admin', 1999999999,
          7611727, 'Sheshiyer', 'User',
          'pending_oauth', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        );
        INSERT INTO github_installation_facts (
          installation_id, account_id, account_login, account_type,
          installer_sender_id, installer_sender_login, last_actor_id, last_actor_login,
          repository_selection, state, last_delivery_id, observed_at, updated_at
        ) VALUES (
          126, 7611727, 'Sheshiyer', 'User',
          7611727, 'Sheshiyer', 7611727, 'Sheshiyer',
          'selected', 'active', 'delivery-duplicate', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        );
      `);
      expect(() => db.exec(`
        INSERT INTO github_workspace_installations (
          workspace_id, installation_id, account_id, connected_by_identity_id,
          verified_github_user_id, verified_github_login, connection_nonce_hash,
          state, created_at, updated_at
        ) VALUES (
          'ws_test', 126, 7611727, 'pid_admin',
          7611727, 'Sheshiyer', 'nonce-duplicate',
          'active', '2026-07-14T00:00:00Z', '2026-07-14T00:00:00Z'
        )
      `)).toThrow(/UNIQUE constraint failed/);
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
