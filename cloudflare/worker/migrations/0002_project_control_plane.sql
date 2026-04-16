PRAGMA foreign_keys = ON;

ALTER TABLE projects ADD COLUMN slug TEXT;
ALTER TABLE projects ADD COLUMN portfolio_name TEXT;
ALTER TABLE projects ADD COLUMN client_name TEXT;
ALTER TABLE projects ADD COLUMN visibility TEXT NOT NULL DEFAULT 'workspace';
ALTER TABLE projects ADD COLUMN sync_mode TEXT NOT NULL DEFAULT 'manual';

CREATE TABLE project_github_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  repo_owner TEXT NOT NULL,
  repo_name TEXT NOT NULL,
  repo_role TEXT NOT NULL DEFAULT 'primary',
  display_name TEXT,
  sync_issues INTEGER NOT NULL DEFAULT 1,
  sync_milestones INTEGER NOT NULL DEFAULT 1,
  sync_labels INTEGER NOT NULL DEFAULT 1,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (project_id, repo_owner, repo_name)
);

CREATE TABLE project_huly_links (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  huly_project_id TEXT NOT NULL,
  sync_issues INTEGER NOT NULL DEFAULT 1,
  sync_milestones INTEGER NOT NULL DEFAULT 1,
  sync_components INTEGER NOT NULL DEFAULT 0,
  sync_templates INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (project_id, huly_project_id)
);

CREATE TABLE project_artifacts (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT NOT NULL,
  external_id TEXT,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE project_sync_policies (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  issues_enabled INTEGER NOT NULL DEFAULT 1,
  milestones_enabled INTEGER NOT NULL DEFAULT 1,
  components_enabled INTEGER NOT NULL DEFAULT 0,
  templates_enabled INTEGER NOT NULL DEFAULT 0,
  issue_ownership_mode TEXT NOT NULL DEFAULT 'split',
  engineering_source TEXT NOT NULL DEFAULT 'github',
  execution_source TEXT NOT NULL DEFAULT 'huly',
  milestone_authority TEXT NOT NULL DEFAULT 'github',
  issue_classification_mode TEXT NOT NULL DEFAULT 'hybrid',
  direction_mode TEXT NOT NULL DEFAULT 'review_gate',
  rule_config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX idx_projects_workspace_slug ON projects(workspace_id, slug);
CREATE INDEX idx_project_github_links_project_id ON project_github_links(project_id);
CREATE INDEX idx_project_huly_links_project_id ON project_huly_links(project_id);
CREATE INDEX idx_project_artifacts_project_id ON project_artifacts(project_id);
CREATE INDEX idx_project_sync_policies_workspace_id ON project_sync_policies(workspace_id);
