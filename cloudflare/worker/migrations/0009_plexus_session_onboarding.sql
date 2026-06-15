-- Plexus role-aware app sessions and resumable onboarding state.
-- This keeps admin/demo state separate from Clockify-derived employee metrics.

CREATE TABLE IF NOT EXISTS plexus_identities (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  employee_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee', 'admin')),
  project_visibility TEXT NOT NULL DEFAULT 'active' CHECK (project_visibility IN ('active', 'all', 'assigned')),
  capabilities_json TEXT NOT NULL DEFAULT '{}',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_plexus_identities_workspace_role
  ON plexus_identities(workspace_id, role, is_active);

CREATE TABLE IF NOT EXISTS plexus_identity_preferences (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  preferences_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS plexus_onboarding_steps (
  id TEXT PRIMARY KEY,
  identity_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  label TEXT NOT NULL,
  requirement TEXT NOT NULL CHECK (requirement IN ('required', 'optional')),
  state TEXT NOT NULL CHECK (state IN ('required', 'optional', 'skipped', 'deferred', 'completed', 'failed')),
  metadata_json TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  UNIQUE (identity_id, step_id)
);

CREATE INDEX IF NOT EXISTS idx_plexus_onboarding_identity_state
  ON plexus_onboarding_steps(identity_id, state);

INSERT OR IGNORE INTO plexus_identities (
  id, workspace_id, email, employee_id, display_name, role, project_visibility,
  capabilities_json, is_active, created_at, updated_at
)
SELECT
  'pid_' || id,
  workspace_id,
  LOWER(email),
  id,
  display_name,
  'employee',
  'active',
  '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":false}',
  is_active,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM employees
WHERE email IS NOT NULL
  AND TRIM(email) <> ''
  AND LOWER(email) <> 'thoughtseedlabs@gmail.com';

INSERT OR IGNORE INTO plexus_identities (
  id, workspace_id, email, employee_id, display_name, role, project_visibility,
  capabilities_json, is_active, created_at, updated_at
)
SELECT
  'pid_admin_thoughtseed_labs',
  w.id,
  'thoughtseedlabs@gmail.com',
  (
    SELECT e.id
    FROM employees e
    WHERE e.workspace_id = w.id
      AND LOWER(e.email) = 'thoughtseedlabs@gmail.com'
    LIMIT 1
  ),
  'Thoughtseed Labs Admin',
  'admin',
  'all',
  '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":true,"allProjects":true,"employeeEmulation":true}',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.id = 'ws_thoughtseed';

UPDATE plexus_identities
SET
  role = 'admin',
  project_visibility = 'all',
  display_name = 'Thoughtseed Labs Admin',
  capabilities_json = '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":true,"allProjects":true,"employeeEmulation":true}',
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE email = 'thoughtseedlabs@gmail.com';

INSERT OR IGNORE INTO plexus_onboarding_steps (
  id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at
)
SELECT
  'onb_' || id || '_identity_projects',
  id,
  workspace_id,
  'identity_projects',
  'Identity and project access',
  'required',
  'required',
  '{}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM plexus_identities;

INSERT OR IGNORE INTO plexus_onboarding_steps (
  id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at
)
SELECT
  'onb_' || id || '_preferences',
  id,
  workspace_id,
  'preferences',
  'Personal preferences',
  'optional',
  'optional',
  '{}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM plexus_identities;

INSERT OR IGNORE INTO plexus_onboarding_steps (
  id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at
)
SELECT
  'onb_' || id || '_paperclip',
  id,
  workspace_id,
  'paperclip',
  'Paperclip / Vapor Clip agent fabric',
  'optional',
  'optional',
  '{}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM plexus_identities;

INSERT OR IGNORE INTO plexus_onboarding_steps (
  id, identity_id, workspace_id, step_id, label, requirement, state, metadata_json, created_at, updated_at
)
SELECT
  'onb_' || id || '_daily_agent',
  id,
  workspace_id,
  'daily_agent',
  'Daily agent and standup',
  'optional',
  'optional',
  '{}',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM plexus_identities;
