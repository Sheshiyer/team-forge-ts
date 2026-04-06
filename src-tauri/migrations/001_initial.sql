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
