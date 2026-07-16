-- Authenticated Plexus desktop process leases.
-- Stable client identity is durable; presence_session_id rotates on every app process start.

CREATE TABLE IF NOT EXISTS plexus_app_presence_leases (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  client_instance_id TEXT NOT NULL,
  presence_session_id TEXT NOT NULL UNIQUE,
  last_sequence INTEGER NOT NULL DEFAULT 0 CHECK (last_sequence >= 0),
  activity TEXT NOT NULL DEFAULT 'available' CHECK (activity IN ('available', 'focused')),
  timer_entry_id TEXT,
  timer_project_id TEXT,
  timer_started_at TEXT,
  room_kind TEXT CHECK (room_kind IN ('workspace_lobby', 'project_room', 'ad_hoc')),
  room_id TEXT,
  call_session_id TEXT,
  participant_id TEXT,
  room_project_id TEXT,
  room_observed_at TEXT,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (identity_id) REFERENCES plexus_identities(id) ON DELETE CASCADE,
  UNIQUE (workspace_id, identity_id, client_instance_id),
  CHECK (
    (activity = 'available' AND timer_entry_id IS NULL AND timer_project_id IS NULL AND timer_started_at IS NULL)
    OR
    (activity = 'focused' AND timer_entry_id IS NOT NULL AND timer_project_id IS NOT NULL AND timer_started_at IS NOT NULL)
  ),
  CHECK (
    (room_kind IS NULL AND room_id IS NULL AND call_session_id IS NULL AND participant_id IS NULL AND room_project_id IS NULL AND room_observed_at IS NULL)
    OR
    (room_kind IS NOT NULL AND room_id IS NOT NULL AND call_session_id IS NOT NULL AND participant_id IS NOT NULL AND room_observed_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_plexus_app_presence_workspace_expiry
  ON plexus_app_presence_leases(workspace_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_plexus_app_presence_identity_expiry
  ON plexus_app_presence_leases(workspace_id, identity_id, expires_at);

ALTER TABLE realtime_participants ADD COLUMN presence_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_realtime_participants_presence_session
  ON realtime_participants(workspace_id, identity_id, client_instance_id, presence_session_id);
