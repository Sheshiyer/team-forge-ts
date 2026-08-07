-- Founder Plexus identities: shesh@ and mohan@thoughtseed.space as admin.
-- These are the canonical founder logins (CF Access One-Time PIN). Without
-- rows here, /v1/whoami 404s for founders and downstream role maps (Cambium
-- mini app gate) would floor them to consultant.

INSERT OR IGNORE INTO plexus_identities (
  id, workspace_id, email, employee_id, display_name, role, project_visibility,
  capabilities_json, is_active, created_at, updated_at
)
SELECT
  'pid_admin_shesh',
  w.id,
  'shesh@thoughtseed.space',
  (
    SELECT e.id
    FROM employees e
    WHERE e.workspace_id = w.id
      AND LOWER(e.email) = 'shesh@thoughtseed.space'
    LIMIT 1
  ),
  'Shesh Narayan Iyer',
  'admin',
  'all',
  '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":true,"allProjects":true,"employeeEmulation":true}',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.id = 'ws_thoughtseed';

INSERT OR IGNORE INTO plexus_identities (
  id, workspace_id, email, employee_id, display_name, role, project_visibility,
  capabilities_json, is_active, created_at, updated_at
)
SELECT
  'pid_admin_mohan',
  w.id,
  'mohan@thoughtseed.space',
  (
    SELECT e.id
    FROM employees e
    WHERE e.workspace_id = w.id
      AND LOWER(e.email) = 'mohan@thoughtseed.space'
    LIMIT 1
  ),
  'Mohan',
  'admin',
  'all',
  '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":true,"allProjects":true,"employeeEmulation":true}',
  1,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM workspaces w
WHERE w.id = 'ws_thoughtseed';

-- Idempotent promote in case 0009 already auto-provisioned founders as employees.
UPDATE plexus_identities
SET
  role = 'admin',
  project_visibility = 'all',
  capabilities_json = '{"timer":true,"projects":true,"preferences":true,"agentFabric":true,"adminDemo":true,"allProjects":true,"employeeEmulation":true}',
  is_active = 1,
  updated_at = CURRENT_TIMESTAMP
WHERE email IN ('shesh@thoughtseed.space', 'mohan@thoughtseed.space');
