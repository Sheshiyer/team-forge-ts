-- Phase 7/9: Employee preferences for Agent Fabric personalization
CREATE TABLE IF NOT EXISTS employee_preferences (
  id TEXT PRIMARY KEY,
  employee_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE CASCADE,
  UNIQUE (employee_id)
);
