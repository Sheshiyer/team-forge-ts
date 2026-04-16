PRAGMA foreign_keys = ON;

ALTER TABLE project_sync_policies ADD COLUMN sync_state TEXT NOT NULL DEFAULT 'active';
ALTER TABLE project_sync_policies ADD COLUMN last_sync_at TEXT;
ALTER TABLE project_sync_policies ADD COLUMN last_sync_status TEXT;
ALTER TABLE project_sync_policies ADD COLUMN last_sync_job_id TEXT;
ALTER TABLE project_sync_policies ADD COLUMN paused_at TEXT;
ALTER TABLE project_sync_policies ADD COLUMN paused_by TEXT;
ALTER TABLE project_sync_policies ADD COLUMN last_error_code TEXT;
ALTER TABLE project_sync_policies ADD COLUMN last_error_message TEXT;

CREATE TABLE sync_entity_mappings (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT,
  ownership_domain TEXT NOT NULL,
  classification_source TEXT NOT NULL DEFAULT 'rule',
  classification_reason TEXT,
  override_actor TEXT,
  override_at TEXT,
  mapping_status TEXT NOT NULL DEFAULT 'mapped',
  source_url TEXT,
  github_repo TEXT,
  github_number INTEGER,
  github_node_id TEXT,
  huly_project_id TEXT,
  huly_entity_id TEXT,
  last_source TEXT,
  last_source_version TEXT,
  last_github_hash TEXT,
  last_huly_hash TEXT,
  payload_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  last_synced_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX idx_sync_entity_mappings_github
  ON sync_entity_mappings(project_id, entity_type, github_repo, github_number)
  WHERE github_repo IS NOT NULL AND github_number IS NOT NULL;

CREATE UNIQUE INDEX idx_sync_entity_mappings_huly
  ON sync_entity_mappings(project_id, entity_type, huly_project_id, huly_entity_id)
  WHERE huly_project_id IS NOT NULL AND huly_entity_id IS NOT NULL;

CREATE INDEX idx_sync_entity_mappings_project
  ON sync_entity_mappings(project_id, entity_type, ownership_domain, mapping_status);

CREATE TABLE sync_conflicts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  entity_mapping_id TEXT,
  entity_type TEXT NOT NULL,
  conflict_type TEXT NOT NULL,
  canonical_source TEXT NOT NULL,
  detected_source TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  summary TEXT NOT NULL,
  github_payload_json TEXT,
  huly_payload_json TEXT,
  resolution_note TEXT,
  resolved_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_mapping_id) REFERENCES sync_entity_mappings(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_conflicts_project
  ON sync_conflicts(project_id, status, entity_type, created_at);

CREATE TABLE sync_journal (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  entity_mapping_id TEXT,
  entity_type TEXT NOT NULL,
  source_system TEXT NOT NULL,
  destination_system TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  source_ref TEXT,
  destination_ref TEXT,
  payload_hash TEXT NOT NULL,
  payload_json TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  conflict_id TEXT,
  job_id TEXT,
  error_code TEXT,
  error_message TEXT,
  actor_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  started_at TEXT,
  finished_at TEXT,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (entity_mapping_id) REFERENCES sync_entity_mappings(id) ON DELETE SET NULL,
  FOREIGN KEY (conflict_id) REFERENCES sync_conflicts(id) ON DELETE SET NULL,
  FOREIGN KEY (job_id) REFERENCES sync_jobs(id) ON DELETE SET NULL
);

CREATE INDEX idx_sync_journal_project
  ON sync_journal(project_id, status, entity_type, created_at);

CREATE INDEX idx_sync_journal_job
  ON sync_journal(job_id, created_at);
