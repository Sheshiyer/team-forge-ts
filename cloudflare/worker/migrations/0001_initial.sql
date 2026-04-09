PRAGMA foreign_keys = ON;

CREATE TABLE organizations (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  organization_id TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  clockify_workspace_id TEXT,
  huly_workspace_id TEXT,
  slack_team_id TEXT,
  mode TEXT NOT NULL DEFAULT 'shadow',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  device_fingerprint TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL,
  channel TEXT NOT NULL DEFAULT 'stable',
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE employees (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  email TEXT,
  avatar_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  monthly_quota_hours REAL NOT NULL DEFAULT 160,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE employee_external_ids (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_secondary_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE (source, external_id)
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  project_type TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE project_external_ids (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT NOT NULL,
  external_secondary_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  UNIQUE (source, external_id)
);

CREATE TABLE integration_connections (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  connection_mode TEXT NOT NULL DEFAULT 'global_secret',
  status TEXT NOT NULL DEFAULT 'unknown',
  masked_identity TEXT,
  last_tested_at TEXT,
  last_synced_at TEXT,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source)
);

CREATE TABLE integration_credentials (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  credential_scope TEXT NOT NULL DEFAULT 'workspace',
  encrypted_blob TEXT NOT NULL,
  key_version TEXT NOT NULL DEFAULT 'v1',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source, credential_scope)
);

CREATE TABLE sync_cursors (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  cursor_key TEXT NOT NULL,
  cursor_value TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, source, cursor_key)
);

CREATE TABLE sync_jobs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  payload_json TEXT,
  requested_by TEXT,
  queue_message_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE sync_runs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL,
  job_id TEXT,
  status TEXT NOT NULL,
  stats_json TEXT,
  error_code TEXT,
  error_message TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (job_id) REFERENCES sync_jobs(id) ON DELETE SET NULL
);

CREATE TABLE workspace_normalization_actions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'huly',
  action_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'previewed',
  initiated_by TEXT,
  dry_run INTEGER NOT NULL DEFAULT 1,
  input_json TEXT,
  report_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE manual_leave_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  employee_id TEXT,
  source TEXT NOT NULL DEFAULT 'teamforge_manual',
  leave_type TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT NOT NULL,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE TABLE manual_holidays (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  name TEXT NOT NULL,
  holiday_date TEXT NOT NULL,
  country_code TEXT,
  notes TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, holiday_date, name)
);

CREATE TABLE remote_config (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  config_key TEXT NOT NULL,
  config_value_json TEXT NOT NULL,
  rollout_channel TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, config_key, rollout_channel)
);

CREATE TABLE ota_channels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE ota_releases (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  version TEXT NOT NULL,
  platform TEXT NOT NULL,
  arch TEXT NOT NULL,
  artifact_url TEXT NOT NULL,
  signature TEXT NOT NULL,
  release_notes TEXT,
  pub_date TEXT NOT NULL,
  rollout_percentage INTEGER NOT NULL DEFAULT 100,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (channel_id) REFERENCES ota_channels(id) ON DELETE CASCADE,
  UNIQUE (channel_id, version, platform, arch)
);

CREATE TABLE ota_install_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  device_id TEXT,
  channel TEXT NOT NULL,
  version_from TEXT,
  version_to TEXT NOT NULL,
  status TEXT NOT NULL,
  error_details TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (device_id) REFERENCES devices(id) ON DELETE SET NULL
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT,
  actor_type TEXT NOT NULL,
  actor_id TEXT,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_workspaces_organization_id ON workspaces(organization_id);
CREATE INDEX idx_devices_workspace_id ON devices(workspace_id);
CREATE INDEX idx_employees_workspace_id ON employees(workspace_id);
CREATE INDEX idx_projects_workspace_id ON projects(workspace_id);
CREATE INDEX idx_sync_jobs_workspace_source_status ON sync_jobs(workspace_id, source, status);
CREATE INDEX idx_sync_runs_workspace_source_status ON sync_runs(workspace_id, source, status);
CREATE INDEX idx_remote_config_workspace_key ON remote_config(workspace_id, config_key);
CREATE INDEX idx_ota_releases_channel_active_platform_arch ON ota_releases(channel_id, is_active, platform, arch);
CREATE INDEX idx_audit_events_workspace_created_at ON audit_events(workspace_id, created_at);

INSERT INTO ota_channels (id, name, description, is_active, created_at, updated_at)
VALUES
  ('ota-canary', 'canary', 'First-release validation channel.', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  ('ota-stable', 'stable', 'Default production release channel.', 1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
