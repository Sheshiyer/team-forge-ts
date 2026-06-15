-- Plexus realtime workspace: rooms, calls, participants, tracks, and manual meeting closeouts.
-- Cloudflare Realtime owns media transport. TeamForge/D1 owns durable app state.

CREATE TABLE IF NOT EXISTS realtime_rooms (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  project_id TEXT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('workspace_lobby', 'project_room', 'ad_hoc')),
  state TEXT NOT NULL DEFAULT 'open' CHECK (state IN ('open', 'archived')),
  visibility TEXT NOT NULL DEFAULT 'workspace' CHECK (visibility IN ('workspace', 'project', 'private')),
  created_by_identity_id TEXT,
  active_call_id TEXT,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  last_activity_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_realtime_rooms_workspace_slug
  ON realtime_rooms(workspace_id, slug);
CREATE INDEX IF NOT EXISTS idx_realtime_rooms_workspace_state
  ON realtime_rooms(workspace_id, state, room_type);
CREATE INDEX IF NOT EXISTS idx_realtime_rooms_project
  ON realtime_rooms(workspace_id, project_id);

CREATE TABLE IF NOT EXISTS realtime_call_sessions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  project_id TEXT,
  state TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'ended', 'failed')),
  created_by_identity_id TEXT NOT NULL,
  meeting_record_id TEXT,
  provider TEXT NOT NULL DEFAULT 'cloudflare_realtime',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES realtime_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_calls_room_state
  ON realtime_call_sessions(room_id, state, started_at);
CREATE INDEX IF NOT EXISTS idx_realtime_calls_workspace_project
  ON realtime_call_sessions(workspace_id, project_id, started_at);

CREATE TABLE IF NOT EXISTS realtime_participants (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  call_session_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  employee_id TEXT,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'participant' CHECK (role IN ('host', 'participant', 'viewer', 'agent_observer')),
  state TEXT NOT NULL DEFAULT 'joined' CHECK (state IN ('joined', 'left', 'removed')),
  client_instance_id TEXT NOT NULL,
  cloudflare_session_id TEXT,
  audio_enabled INTEGER NOT NULL DEFAULT 0,
  video_enabled INTEGER NOT NULL DEFAULT 0,
  screen_share_enabled INTEGER NOT NULL DEFAULT 0,
  joined_at TEXT NOT NULL,
  left_at TEXT,
  last_seen_at TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES realtime_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (call_session_id) REFERENCES realtime_call_sessions(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_realtime_participants_call_identity_client
  ON realtime_participants(call_session_id, identity_id, client_instance_id);
CREATE INDEX IF NOT EXISTS idx_realtime_participants_call_state
  ON realtime_participants(call_session_id, state, last_seen_at);
CREATE INDEX IF NOT EXISTS idx_realtime_participants_identity
  ON realtime_participants(workspace_id, identity_id, last_seen_at);

CREATE TABLE IF NOT EXISTS realtime_media_tracks (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  call_session_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  identity_id TEXT NOT NULL,
  track_kind TEXT NOT NULL CHECK (track_kind IN ('audio', 'camera', 'screen')),
  direction TEXT NOT NULL DEFAULT 'publish' CHECK (direction IN ('publish', 'subscribe')),
  state TEXT NOT NULL DEFAULT 'live' CHECK (state IN ('live', 'closed', 'failed')),
  label TEXT,
  source_id TEXT,
  cloudflare_session_id TEXT,
  cloudflare_track_id TEXT,
  target_track_ids_json TEXT NOT NULL DEFAULT '[]',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES realtime_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (call_session_id) REFERENCES realtime_call_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES realtime_participants(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_realtime_tracks_call_state
  ON realtime_media_tracks(call_session_id, state, track_kind);
CREATE INDEX IF NOT EXISTS idx_realtime_tracks_participant
  ON realtime_media_tracks(participant_id, state);

CREATE TABLE IF NOT EXISTS realtime_events (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  room_id TEXT,
  call_session_id TEXT,
  actor_identity_id TEXT,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_realtime_events_workspace_time
  ON realtime_events(workspace_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_realtime_events_call_time
  ON realtime_events(call_session_id, occurred_at);

CREATE TABLE IF NOT EXISTS realtime_meeting_records (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  room_id TEXT NOT NULL,
  call_session_id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  time_entry_id TEXT,
  title TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  manual_notes TEXT NOT NULL DEFAULT '',
  decisions_json TEXT NOT NULL DEFAULT '[]',
  action_items_json TEXT NOT NULL DEFAULT '[]',
  participant_snapshot_json TEXT NOT NULL DEFAULT '[]',
  linked_time_entry_ids_json TEXT NOT NULL DEFAULT '[]',
  linked_issue_ids_json TEXT NOT NULL DEFAULT '[]',
  screen_share_summary_json TEXT NOT NULL DEFAULT '[]',
  paperclip_status TEXT NOT NULL DEFAULT 'not_requested' CHECK (paperclip_status IN ('not_requested', 'queued', 'sent', 'failed')),
  paperclip_payload_json TEXT NOT NULL DEFAULT '{}',
  paperclip_artifact_ref TEXT,
  transcript_ref TEXT,
  recording_ref TEXT,
  created_by_identity_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE,
  FOREIGN KEY (room_id) REFERENCES realtime_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (call_session_id) REFERENCES realtime_call_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_realtime_meetings_workspace_project_time
  ON realtime_meeting_records(workspace_id, project_id, started_at);
