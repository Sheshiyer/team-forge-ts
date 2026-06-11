-- Plexus-authored time entries: the canonical employee time-tracking table.
-- Source-tagged ('plexus' | 'clockify' | …) so integrations are absorbed incrementally.
-- workspace_id is FK-enforced; employee_id / project_id are tolerant refs (ingest must
-- not fail on a not-yet-mirrored project/employee). No billable column — internal tool.

CREATE TABLE IF NOT EXISTS time_entries (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  employee_id TEXT,
  project_id TEXT,
  source TEXT NOT NULL DEFAULT 'plexus',
  description TEXT,
  start_time TEXT NOT NULL,
  end_time TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_time_entries_ws ON time_entries(workspace_id, start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_emp ON time_entries(employee_id, start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_proj ON time_entries(project_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_source ON time_entries(source);
