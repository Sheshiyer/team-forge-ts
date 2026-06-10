PRAGMA foreign_keys = ON;

-- Handoffs: agent stage-to-stage transitions (vault handoffs/HO-NNN.md)
-- Source of truth for narrative remains the .md in the vault.
-- This table holds the lightweight routing + status machine for Hermes /ts-handoffs flows.
CREATE TABLE handoffs (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  handoff_id TEXT NOT NULL,           -- e.g. HO-001 (canonical from vault)
  project_slug TEXT,                  -- e.g. mathis-portal-reskin (TeamForge slug)
  client_slug TEXT,                   -- e.g. mathis
  "from" TEXT,                        -- e.g. system, ceo, engineer
  "to" TEXT,                          -- e.g. ceo, engineer, synthesist
  type TEXT,                          -- e.g. task-assignment, review, escalation
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TEXT NOT NULL,
  due_at TEXT,
  priority TEXT,                      -- e.g. high, medium, low
  source_path TEXT,                   -- relative path in vault for reference (e.g. handoffs/HO-001.md)
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, handoff_id)
);

CREATE INDEX idx_handoffs_workspace_status ON handoffs(workspace_id, status, created_at);
CREATE INDEX idx_handoffs_workspace_project ON handoffs(workspace_id, project_slug);
CREATE INDEX idx_handoffs_workspace_client ON handoffs(workspace_id, client_slug);

-- Optional: allow quick lookup of pending handoffs for a project (used by dashboards / Hermes)
CREATE INDEX idx_handoffs_pending_project ON handoffs(workspace_id, project_slug, status) WHERE status = 'pending';
