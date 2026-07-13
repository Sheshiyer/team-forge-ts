-- Private GitHub App control plane. Tokens and key material are deliberately
-- absent: installation access tokens are minted just-in-time and discarded.

CREATE TABLE IF NOT EXISTS github_connection_states (
  nonce_hash TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  plexus_actor_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at TEXT,
  oauth_user_id INTEGER,
  oauth_login TEXT,
  oauth_verified_at TEXT,
  untrusted_installation_id INTEGER,
  installation_hint_at TEXT,
  status TEXT NOT NULL DEFAULT 'pending_oauth'
    CHECK (status IN ('pending_oauth', 'oauth_verified', 'bound', 'expired', 'rejected')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (plexus_actor_id) REFERENCES plexus_identities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_github_connection_states_actor
  ON github_connection_states(workspace_id, plexus_actor_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_github_connection_states_oauth_actor
  ON github_connection_states(oauth_user_id, status, expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_github_connection_states_one_active_actor
  ON github_connection_states(workspace_id, plexus_actor_id)
  WHERE status IN ('pending_oauth', 'oauth_verified');

CREATE TABLE IF NOT EXISTS github_installation_facts (
  installation_id INTEGER PRIMARY KEY,
  account_id INTEGER NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL,
  installer_sender_id INTEGER NOT NULL,
  installer_sender_login TEXT NOT NULL,
  last_actor_id INTEGER NOT NULL,
  last_actor_login TEXT NOT NULL,
  repository_selection TEXT NOT NULL,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'deleted')),
  last_delivery_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_github_installation_facts_sender
  ON github_installation_facts(installer_sender_id, state, observed_at);

CREATE TABLE IF NOT EXISTS github_installation_repositories (
  installation_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  owner_login TEXT NOT NULL,
  name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  is_private INTEGER NOT NULL DEFAULT 1,
  default_branch TEXT,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'removed')),
  observed_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (installation_id, repository_id),
  FOREIGN KEY (installation_id) REFERENCES github_installation_facts(installation_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_github_installation_repositories_id
  ON github_installation_repositories(repository_id, state);

CREATE TABLE IF NOT EXISTS github_workspace_installations (
  workspace_id TEXT PRIMARY KEY,
  installation_id INTEGER NOT NULL UNIQUE,
  connected_by_identity_id TEXT NOT NULL,
  verified_github_user_id INTEGER NOT NULL,
  verified_github_login TEXT NOT NULL,
  connection_nonce_hash TEXT NOT NULL UNIQUE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'revoked')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (installation_id) REFERENCES github_installation_facts(installation_id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (connection_nonce_hash) REFERENCES github_connection_states(nonce_hash) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS github_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  received_at TEXT NOT NULL,
  processing_started_at TEXT NOT NULL,
  attempt_count INTEGER NOT NULL DEFAULT 1,
  processed_at TEXT,
  result TEXT NOT NULL DEFAULT 'received'
);

CREATE TABLE IF NOT EXISTS project_github_verifications (
  project_id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  installation_id INTEGER NOT NULL,
  repository_id INTEGER NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  verified_by_identity_id TEXT NOT NULL,
  verified_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (installation_id) REFERENCES github_installation_facts(installation_id) ON DELETE CASCADE,
  FOREIGN KEY (verified_by_identity_id) REFERENCES plexus_identities(id) ON DELETE RESTRICT,
  UNIQUE (workspace_id, repository_id)
);

CREATE TABLE IF NOT EXISTS github_write_operations (
  operation_key TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  repository_id INTEGER NOT NULL,
  actor_identity_id TEXT NOT NULL,
  base_sha TEXT NOT NULL,
  branch_name TEXT NOT NULL,
  commit_sha TEXT,
  pull_request_number INTEGER,
  pull_request_url TEXT,
  status TEXT NOT NULL CHECK (status IN ('started', 'committed', 'completed', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_identity_id) REFERENCES plexus_identities(id) ON DELETE RESTRICT
);
