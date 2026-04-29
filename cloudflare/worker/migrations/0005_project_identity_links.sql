ALTER TABLE projects ADD COLUMN client_id TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_workspace_client_id
  ON projects(workspace_id, client_id);

CREATE INDEX IF NOT EXISTS idx_project_external_ids_project_source
  ON project_external_ids(project_id, source);
