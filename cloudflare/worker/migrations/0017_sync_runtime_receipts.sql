PRAGMA foreign_keys = ON;

ALTER TABLE sync_jobs ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;

CREATE INDEX idx_sync_jobs_project_status
  ON sync_jobs(project_id, status, created_at);

CREATE TABLE sync_runtime_receipts (
  runtime_id TEXT NOT NULL PRIMARY KEY,
  schema_version TEXT NOT NULL CHECK (schema_version = 'teamforge.sync-runtime-receipt.v1'),
  last_message_id TEXT NOT NULL,
  last_job_id TEXT NOT NULL,
  last_status TEXT NOT NULL CHECK (last_status IN ('completed', 'failed', 'rejected')),
  last_consumed_at TEXT NOT NULL,
  last_terminal_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_sync_runtime_receipts_updated
  ON sync_runtime_receipts(updated_at DESC);
