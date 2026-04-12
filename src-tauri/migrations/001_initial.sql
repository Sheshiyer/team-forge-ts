-- Core entities
CREATE TABLE IF NOT EXISTS employees (
    id TEXT PRIMARY KEY,
    clockify_user_id TEXT NOT NULL UNIQUE,
    huly_person_id TEXT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    avatar_url TEXT,
    monthly_quota_hours REAL NOT NULL DEFAULT 160.0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS identity_map (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    external_id TEXT NOT NULL,
    employee_id TEXT REFERENCES employees(id),
    confidence REAL NOT NULL DEFAULT 1.0,
    resolution_status TEXT NOT NULL DEFAULT 'linked',
    match_method TEXT,
    is_override INTEGER NOT NULL DEFAULT 0,
    override_by TEXT,
    override_reason TEXT,
    override_at TEXT,
    first_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(source, external_id)
);

CREATE INDEX IF NOT EXISTS idx_identity_map_employee_source
    ON identity_map(employee_id, source);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_map_linked_employee_source
    ON identity_map(employee_id, source)
    WHERE employee_id IS NOT NULL AND resolution_status = 'linked';

CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    clockify_project_id TEXT NOT NULL UNIQUE,
    huly_project_id TEXT,
    name TEXT NOT NULL,
    client_name TEXT,
    color TEXT,
    is_billable INTEGER NOT NULL DEFAULT 1,
    is_archived INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS time_entries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    project_id TEXT REFERENCES projects(id),
    description TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    duration_seconds INTEGER,
    is_billable INTEGER NOT NULL DEFAULT 1,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_time_entries_employee_date ON time_entries(employee_id, start_time);
CREATE INDEX IF NOT EXISTS idx_time_entries_project ON time_entries(project_id);

CREATE TABLE IF NOT EXISTS huly_issue_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    huly_issue_id TEXT NOT NULL,
    issue_identifier TEXT,
    issue_title TEXT,
    action TEXT NOT NULL,
    old_status TEXT,
    new_status TEXT,
    occurred_at TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_huly_activity_employee_date ON huly_issue_activity(employee_id, occurred_at);

CREATE TABLE IF NOT EXISTS huly_document_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    huly_doc_id TEXT NOT NULL,
    doc_title TEXT,
    action TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    synced_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS slack_message_activity (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    message_key TEXT NOT NULL UNIQUE,
    slack_channel_id TEXT NOT NULL,
    slack_user_id TEXT,
    employee_id TEXT REFERENCES employees(id),
    message_ts TEXT NOT NULL,
    message_ts_ms INTEGER,
    content_preview TEXT,
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_slack_message_activity_employee_ts
    ON slack_message_activity(employee_id, message_ts_ms);
CREATE INDEX IF NOT EXISTS idx_slack_message_activity_channel_ts
    ON slack_message_activity(slack_channel_id, message_ts_ms);

CREATE TABLE IF NOT EXISTS ops_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_key TEXT NOT NULL UNIQUE,
    schema_version TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    actor_employee_id TEXT REFERENCES employees(id),
    actor_clockify_user_id TEXT,
    actor_huly_person_id TEXT,
    actor_slack_user_id TEXT,
    occurred_at TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    payload_json TEXT NOT NULL,
    detected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ops_events_source_event_time
    ON ops_events(source, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_ops_events_actor_time
    ON ops_events(actor_employee_id, occurred_at);

CREATE TABLE IF NOT EXISTS agent_feed (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sync_key TEXT NOT NULL UNIQUE,
    schema_version TEXT NOT NULL,
    source TEXT NOT NULL,
    event_type TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    detected_at TEXT NOT NULL,
    severity TEXT NOT NULL,
    owner_hint TEXT,
    actor_employee_id TEXT,
    actor_clockify_user_id TEXT,
    actor_huly_person_id TEXT,
    actor_slack_user_id TEXT,
    payload_json TEXT NOT NULL,
    metadata_json TEXT,
    refreshed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_agent_feed_occurred_at
    ON agent_feed(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feed_severity_occurred
    ON agent_feed(severity, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_feed_owner_occurred
    ON agent_feed(owner_hint, occurred_at DESC);

CREATE TABLE IF NOT EXISTS presence (
    employee_id TEXT PRIMARY KEY REFERENCES employees(id),
    clockify_timer_active INTEGER NOT NULL DEFAULT 0,
    clockify_timer_project TEXT,
    clockify_timer_start TEXT,
    huly_last_seen TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sync_state (
    source TEXT NOT NULL,
    entity TEXT NOT NULL,
    last_sync_at TEXT NOT NULL,
    last_cursor TEXT,
    PRIMARY KEY (source, entity)
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS huly_departments_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS huly_people_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS huly_employees_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS huly_leave_requests_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS huly_holidays_cache (
    id TEXT PRIMARY KEY,
    payload TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manual_leave_entries (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id),
    leave_type TEXT NOT NULL,
    date_from TEXT NOT NULL,
    date_to TEXT NOT NULL,
    status TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manual_leave_entries_dates
    ON manual_leave_entries(date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_manual_leave_entries_employee
    ON manual_leave_entries(employee_id);

CREATE TABLE IF NOT EXISTS manual_holidays (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    date TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_manual_holidays_date
    ON manual_holidays(date);
