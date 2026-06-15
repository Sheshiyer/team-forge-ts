-- 0010_command_runs.sql
-- Founder/cofounder command intake + run state machine + audit log.

CREATE TABLE IF NOT EXISTS command_runs (
  id TEXT PRIMARY KEY,
  command_id TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_kind TEXT NOT NULL CHECK (actor_kind IN ('founder', 'cofounder', 'employee', 'multica_service', 'paperclip_agent')),
  auth_mode TEXT NOT NULL CHECK (auth_mode IN ('cf_access', 'm2m', 'app_bearer', 'aws_task_role', 'paperclip_token')),
  state TEXT NOT NULL CHECK (state IN ('created', 'accepted', 'in_progress', 'succeeded', 'failed', 'partial', 'cancelled')),
  target_kind TEXT,
  target_id TEXT,
  correlation_id TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  accepted_at INTEGER,
  completed_at INTEGER,
  result_json TEXT,
  error_code TEXT,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_command_runs_actor ON command_runs(actor_id, requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_command_runs_correlation ON command_runs(correlation_id);
CREATE INDEX IF NOT EXISTS idx_command_runs_state ON command_runs(state, requested_at DESC);

CREATE TABLE IF NOT EXISTS command_audit_events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES command_runs(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN (
    'command_received',
    'run_created',
    'downstream_agent_contacted',
    'downstream_agent_responded',
    'result_received',
    'result_delivered',
    'failure',
    'partial_failure',
    'cancelled'
  )),
  actor_id TEXT,
  actor_kind TEXT,
  payload_json TEXT,
  occurred_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_command_audit_run ON command_audit_events(run_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_command_audit_kind ON command_audit_events(kind, occurred_at DESC);
