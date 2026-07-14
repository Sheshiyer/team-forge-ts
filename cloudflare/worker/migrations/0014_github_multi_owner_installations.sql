-- Allow one Plexus workspace to bind one exact GitHub App installation per
-- allowlisted account. Existing 0012/0013 bindings are preserved by deriving
-- their immutable account ID from the signed installation fact.

ALTER TABLE github_connection_states ADD COLUMN target_account_id INTEGER;
ALTER TABLE github_connection_states ADD COLUMN target_account_login TEXT;
ALTER TABLE github_connection_states ADD COLUMN target_account_type TEXT;

ALTER TABLE github_workspace_installations RENAME TO github_workspace_installations_0013;

CREATE TABLE github_workspace_installations (
  workspace_id TEXT NOT NULL,
  installation_id INTEGER NOT NULL UNIQUE,
  account_id INTEGER NOT NULL,
  connected_by_identity_id TEXT NOT NULL,
  verified_github_user_id INTEGER NOT NULL,
  verified_github_login TEXT NOT NULL,
  connection_nonce_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, installation_id),
  UNIQUE (workspace_id, account_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (installation_id) REFERENCES github_installation_facts(installation_id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_nonce_hash) REFERENCES github_connection_states(nonce_hash) ON DELETE RESTRICT
);

INSERT INTO github_workspace_installations (
  workspace_id, installation_id, account_id, connected_by_identity_id,
  verified_github_user_id, verified_github_login, connection_nonce_hash,
  state, created_at, updated_at
)
SELECT
  prior.workspace_id,
  prior.installation_id,
  facts.account_id,
  prior.connected_by_identity_id,
  prior.verified_github_user_id,
  prior.verified_github_login,
  prior.connection_nonce_hash,
  prior.state,
  prior.created_at,
  prior.updated_at
FROM github_workspace_installations_0013 AS prior
JOIN github_installation_facts AS facts
  ON facts.installation_id = prior.installation_id;

DROP TABLE github_workspace_installations_0013;

CREATE INDEX idx_github_workspace_installations_workspace_state
  ON github_workspace_installations(workspace_id, state, account_id);
