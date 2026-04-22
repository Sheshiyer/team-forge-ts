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

CREATE TABLE IF NOT EXISTS employee_kpi_snapshots (
    id TEXT PRIMARY KEY,
    employee_id TEXT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL,
    title TEXT NOT NULL,
    role_template TEXT,
    role_template_file TEXT,
    kpi_version TEXT NOT NULL,
    last_reviewed TEXT,
    reports_to TEXT,
    tags_json TEXT NOT NULL DEFAULT '[]',
    source_file_path TEXT NOT NULL,
    source_relative_path TEXT NOT NULL,
    source_last_modified_at TEXT NOT NULL,
    role_scope_markdown TEXT,
    monthly_kpis_json TEXT NOT NULL DEFAULT '[]',
    quarterly_milestones_json TEXT NOT NULL DEFAULT '[]',
    yearly_milestones_json TEXT NOT NULL DEFAULT '[]',
    cross_role_dependencies_json TEXT NOT NULL DEFAULT '[]',
    evidence_sources_json TEXT NOT NULL DEFAULT '[]',
    compensation_milestones_json TEXT NOT NULL DEFAULT '[]',
    gap_flags_json TEXT NOT NULL DEFAULT '[]',
    synthesis_review_markdown TEXT,
    body_markdown TEXT NOT NULL,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(employee_id, kpi_version)
);

CREATE INDEX IF NOT EXISTS idx_employee_kpi_snapshots_employee_recency
    ON employee_kpi_snapshots(employee_id, source_last_modified_at DESC, updated_at DESC);

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

CREATE TABLE IF NOT EXISTS github_repo_configs (
    repo TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    client_name TEXT,
    default_milestone_number INTEGER,
    huly_project_id TEXT,
    clockify_project_id TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teamforge_projects (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    portfolio_name TEXT,
    client_name TEXT,
    project_type TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    sync_mode TEXT NOT NULL DEFAULT 'bidirectional',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS teamforge_project_github_repos (
    project_id TEXT NOT NULL REFERENCES teamforge_projects(id) ON DELETE CASCADE,
    repo TEXT NOT NULL,
    display_name TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    sync_issues INTEGER NOT NULL DEFAULT 1,
    sync_milestones INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, repo)
);

CREATE INDEX IF NOT EXISTS idx_teamforge_project_github_repos_repo
    ON teamforge_project_github_repos(repo);

CREATE TABLE IF NOT EXISTS teamforge_project_huly_links (
    project_id TEXT NOT NULL REFERENCES teamforge_projects(id) ON DELETE CASCADE,
    huly_project_id TEXT NOT NULL,
    sync_issues INTEGER NOT NULL DEFAULT 1,
    sync_milestones INTEGER NOT NULL DEFAULT 1,
    sync_components INTEGER NOT NULL DEFAULT 1,
    sync_templates INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (project_id, huly_project_id)
);

CREATE INDEX IF NOT EXISTS idx_teamforge_project_huly_links_huly
    ON teamforge_project_huly_links(huly_project_id);

CREATE TABLE IF NOT EXISTS teamforge_project_artifacts (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES teamforge_projects(id) ON DELETE CASCADE,
    artifact_type TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    source TEXT NOT NULL,
    external_id TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_teamforge_project_artifacts_project
    ON teamforge_project_artifacts(project_id, artifact_type, title);

CREATE TABLE IF NOT EXISTS teamforge_client_profiles (
    workspace_id TEXT NOT NULL,
    client_id TEXT NOT NULL,
    client_name TEXT NOT NULL,
    engagement_model TEXT,
    industry TEXT,
    primary_contact TEXT,
    project_ids_json TEXT NOT NULL DEFAULT '[]',
    stakeholders_json TEXT NOT NULL DEFAULT '[]',
    strategic_fit_json TEXT NOT NULL DEFAULT '[]',
    risks_json TEXT NOT NULL DEFAULT '[]',
    resource_links_json TEXT NOT NULL DEFAULT '[]',
    active INTEGER NOT NULL DEFAULT 1,
    onboarded TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, client_id)
);

CREATE INDEX IF NOT EXISTS idx_teamforge_client_profiles_name
    ON teamforge_client_profiles(workspace_id, client_name);

CREATE TABLE IF NOT EXISTS teamforge_onboarding_flows (
    workspace_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    audience TEXT NOT NULL,
    status TEXT NOT NULL,
    owner TEXT,
    starts_on TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    subject_name TEXT NOT NULL,
    primary_contact TEXT,
    manager TEXT,
    department TEXT,
    joined_on TEXT,
    source TEXT NOT NULL DEFAULT 'vault',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, flow_id)
);

CREATE INDEX IF NOT EXISTS idx_teamforge_onboarding_flows_audience
    ON teamforge_onboarding_flows(workspace_id, audience, status);

CREATE TABLE IF NOT EXISTS teamforge_onboarding_tasks (
    workspace_id TEXT NOT NULL,
    flow_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    title TEXT NOT NULL,
    completed INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    resource_created TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (workspace_id, flow_id, task_id),
    FOREIGN KEY (workspace_id, flow_id)
      REFERENCES teamforge_onboarding_flows(workspace_id, flow_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_teamforge_onboarding_tasks_flow
    ON teamforge_onboarding_tasks(workspace_id, flow_id, sort_order);

CREATE TABLE IF NOT EXISTS teamforge_active_project_issues (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    project_id TEXT,
    project_name TEXT NOT NULL,
    client_name TEXT,
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    url TEXT NOT NULL,
    milestone_number INTEGER,
    labels_json TEXT NOT NULL DEFAULT '[]',
    assignees_json TEXT NOT NULL DEFAULT '[]',
    priority TEXT,
    track TEXT,
    created_at TEXT,
    updated_at TEXT,
    closed_at TEXT,
    last_synced_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_teamforge_active_project_issues_project
    ON teamforge_active_project_issues(project_name, state, updated_at);

CREATE TABLE IF NOT EXISTS github_milestones (
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    state TEXT NOT NULL,
    due_on TEXT,
    url TEXT,
    open_issues INTEGER NOT NULL DEFAULT 0,
    closed_issues INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo, number)
);

CREATE TABLE IF NOT EXISTS github_issues (
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    node_id TEXT,
    title TEXT NOT NULL,
    body_excerpt TEXT,
    state TEXT NOT NULL,
    url TEXT NOT NULL,
    milestone_number INTEGER,
    assignee_logins_json TEXT NOT NULL DEFAULT '[]',
    labels_json TEXT NOT NULL DEFAULT '[]',
    priority TEXT,
    track TEXT,
    created_at TEXT,
    updated_at TEXT,
    closed_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo, number)
);

CREATE INDEX IF NOT EXISTS idx_github_issues_project
    ON github_issues(repo, milestone_number, updated_at);
CREATE INDEX IF NOT EXISTS idx_github_issues_state
    ON github_issues(repo, state);

CREATE TABLE IF NOT EXISTS github_pull_requests (
    repo TEXT NOT NULL,
    number INTEGER NOT NULL,
    node_id TEXT,
    title TEXT NOT NULL,
    state TEXT NOT NULL,
    draft INTEGER NOT NULL DEFAULT 0,
    url TEXT NOT NULL,
    head_ref TEXT NOT NULL,
    head_sha TEXT NOT NULL,
    base_ref TEXT NOT NULL,
    author_login TEXT,
    labels_json TEXT NOT NULL DEFAULT '[]',
    assignee_logins_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT,
    updated_at TEXT,
    closed_at TEXT,
    merged_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo, number)
);

CREATE INDEX IF NOT EXISTS idx_github_pull_requests_state
    ON github_pull_requests(repo, state, updated_at);
CREATE INDEX IF NOT EXISTS idx_github_pull_requests_head
    ON github_pull_requests(repo, head_ref, head_sha);

CREATE TABLE IF NOT EXISTS github_branches (
    repo TEXT NOT NULL,
    name TEXT NOT NULL,
    commit_sha TEXT NOT NULL,
    protected INTEGER NOT NULL DEFAULT 0,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo, name)
);

CREATE INDEX IF NOT EXISTS idx_github_branches_sha
    ON github_branches(repo, commit_sha);

CREATE TABLE IF NOT EXISTS github_check_runs (
    repo TEXT NOT NULL,
    check_run_id INTEGER NOT NULL,
    branch_name TEXT,
    head_sha TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    conclusion TEXT,
    url TEXT,
    details_url TEXT,
    app_slug TEXT,
    started_at TEXT,
    completed_at TEXT,
    synced_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (repo, check_run_id)
);

CREATE INDEX IF NOT EXISTS idx_github_check_runs_ref
    ON github_check_runs(repo, branch_name, head_sha);
CREATE INDEX IF NOT EXISTS idx_github_check_runs_status
    ON github_check_runs(repo, status, conclusion, completed_at);

CREATE TABLE IF NOT EXISTS github_project_aliases (
    project_id TEXT PRIMARY KEY,
    repo TEXT NOT NULL,
    milestone_number INTEGER,
    clockify_project_id TEXT,
    huly_project_id TEXT,
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
    slack_channel_name TEXT,
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
