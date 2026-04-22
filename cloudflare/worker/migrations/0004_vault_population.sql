PRAGMA foreign_keys = ON;

CREATE TABLE client_profiles (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  client_name TEXT NOT NULL,
  engagement_model TEXT NOT NULL,
  industry TEXT,
  primary_contact TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  onboarded TEXT,
  project_ids_json TEXT NOT NULL DEFAULT '[]',
  stakeholders_json TEXT NOT NULL DEFAULT '[]',
  strategic_fit_json TEXT NOT NULL DEFAULT '[]',
  risks_json TEXT NOT NULL DEFAULT '[]',
  resource_links_json TEXT NOT NULL DEFAULT '[]',
  tags_json TEXT NOT NULL DEFAULT '[]',
  source_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, client_id)
);

CREATE INDEX idx_client_profiles_workspace_active
  ON client_profiles(workspace_id, active, client_name);

CREATE TABLE onboarding_flows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  flow_id TEXT NOT NULL,
  audience TEXT NOT NULL CHECK (audience IN ('client', 'employee')),
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_progress', 'completed', 'stalled')),
  owner TEXT,
  starts_on TEXT,
  client_id TEXT,
  member_id TEXT,
  project_ids_json TEXT NOT NULL DEFAULT '[]',
  primary_contact TEXT,
  workspace_ready INTEGER,
  manager TEXT,
  department TEXT,
  joined_on TEXT,
  source_path TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, flow_id)
);

CREATE INDEX idx_onboarding_flows_workspace_audience
  ON onboarding_flows(workspace_id, audience, status, starts_on);

CREATE TABLE onboarding_tasks (
  id TEXT PRIMARY KEY,
  onboarding_flow_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER NOT NULL DEFAULT 0,
  completed_at TEXT,
  resource_created TEXT,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (onboarding_flow_id) REFERENCES onboarding_flows(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (onboarding_flow_id, task_id)
);

CREATE INDEX idx_onboarding_tasks_flow_position
  ON onboarding_tasks(onboarding_flow_id, position, task_id);
