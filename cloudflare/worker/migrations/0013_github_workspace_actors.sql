-- Per-Plexus-member GitHub actor enrollment. OAuth access tokens are exchanged
-- only long enough to resolve /user plus bound installation access and are
-- never stored in D1.

CREATE TABLE IF NOT EXISTS github_actor_connection_states (
  nonce_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plexus_identity_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT,
  oauth_user_id INTEGER,
  oauth_login TEXT,
  status TEXT NOT NULL DEFAULT 'pending_oauth'
    CHECK (status IN ('pending_oauth', 'bound', 'expired', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plexus_identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_github_actor_states_identity
  ON github_actor_connection_states(workspace_id, plexus_identity_id, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_actor_states_one_active_identity
  ON github_actor_connection_states(workspace_id, plexus_identity_id)
  WHERE status = 'pending_oauth';

CREATE TABLE IF NOT EXISTS github_workspace_actors (
  workspace_id TEXT NOT NULL,
  plexus_identity_id TEXT NOT NULL,
  github_user_id INTEGER NOT NULL,
  github_login TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  verification_source TEXT NOT NULL CHECK (verification_source IN ('installation', 'oauth')),
  connection_nonce_hash TEXT UNIQUE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, plexus_identity_id),
  UNIQUE (workspace_id, github_user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plexus_identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_nonce_hash) REFERENCES github_actor_connection_states(nonce_hash) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_github_workspace_actors_user
  ON github_workspace_actors(workspace_id, github_user_id);

-- Preserve the verified installation owner as the first enrolled actor. The
-- configured login-and-numeric-ID policy is still enforced before any write.
INSERT OR IGNORE INTO github_workspace_actors (
  workspace_id, plexus_identity_id, github_user_id, github_login, verified_at,
  verification_source, connection_nonce_hash, created_at, updated_at
)
SELECT
  workspace_id,
  connected_by_identity_id,
  verified_github_user_id,
  verified_github_login,
  updated_at,
  'installation',
  NULL,
  created_at,
  updated_at
FROM github_workspace_installations;
