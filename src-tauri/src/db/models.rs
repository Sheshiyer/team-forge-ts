use serde::{Deserialize, Serialize};

// ─── Core table models ───────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Employee {
    pub id: String,
    pub clockify_user_id: String,
    pub huly_person_id: Option<String>,
    pub name: String,
    pub email: String,
    pub avatar_url: Option<String>,
    pub monthly_quota_hours: f64,
    pub is_active: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct IdentityMapEntry {
    pub id: Option<i64>,
    pub source: String,
    pub external_id: String,
    pub employee_id: Option<String>,
    pub confidence: f64,
    pub resolution_status: String,
    pub match_method: Option<String>,
    pub is_override: bool,
    pub override_by: Option<String>,
    pub override_reason: Option<String>,
    pub override_at: Option<String>,
    pub first_seen_at: String,
    pub last_seen_at: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub clockify_project_id: String,
    pub huly_project_id: Option<String>,
    pub name: String,
    pub client_name: Option<String>,
    pub color: Option<String>,
    pub is_billable: bool,
    pub is_archived: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubRepoConfig {
    pub repo: String,
    pub display_name: String,
    pub client_name: Option<String>,
    pub default_milestone_number: Option<i64>,
    pub huly_project_id: Option<String>,
    pub clockify_project_id: Option<String>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProject {
    pub id: String,
    pub slug: String,
    pub name: String,
    pub portfolio_name: Option<String>,
    pub client_name: Option<String>,
    pub project_type: Option<String>,
    pub status: String,
    pub sync_mode: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectGithubRepoLink {
    pub project_id: String,
    pub repo: String,
    pub display_name: Option<String>,
    pub is_primary: bool,
    pub sync_issues: bool,
    pub sync_milestones: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectHulyLink {
    pub project_id: String,
    pub huly_project_id: String,
    pub sync_issues: bool,
    pub sync_milestones: bool,
    pub sync_components: bool,
    pub sync_templates: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectArtifact {
    pub id: String,
    pub project_id: String,
    pub artifact_type: String,
    pub title: String,
    pub url: String,
    pub source: String,
    pub external_id: Option<String>,
    pub is_primary: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubMilestoneCache {
    pub repo: String,
    pub number: i64,
    pub title: String,
    pub description: Option<String>,
    pub state: String,
    pub due_on: Option<String>,
    pub url: Option<String>,
    pub open_issues: i64,
    pub closed_issues: i64,
    pub updated_at: Option<String>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubIssueCache {
    pub repo: String,
    pub number: i64,
    pub node_id: Option<String>,
    pub title: String,
    pub body_excerpt: Option<String>,
    pub state: String,
    pub url: String,
    pub milestone_number: Option<i64>,
    pub assignee_logins_json: String,
    pub labels_json: String,
    pub priority: Option<String>,
    pub track: Option<String>,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubPullRequestCache {
    pub repo: String,
    pub number: i64,
    pub node_id: Option<String>,
    pub title: String,
    pub state: String,
    pub draft: bool,
    pub url: String,
    pub head_ref: String,
    pub head_sha: String,
    pub base_ref: String,
    pub author_login: Option<String>,
    pub labels_json: String,
    pub assignee_logins_json: String,
    pub created_at: Option<String>,
    pub updated_at: Option<String>,
    pub closed_at: Option<String>,
    pub merged_at: Option<String>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubBranchCache {
    pub repo: String,
    pub name: String,
    pub commit_sha: String,
    pub protected: bool,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct GithubCheckRunCache {
    pub repo: String,
    pub check_run_id: i64,
    pub branch_name: Option<String>,
    pub head_sha: String,
    pub name: String,
    pub status: String,
    pub conclusion: Option<String>,
    pub url: Option<String>,
    pub details_url: Option<String>,
    pub app_slug: Option<String>,
    pub started_at: Option<String>,
    pub completed_at: Option<String>,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct TimeEntry {
    pub id: String,
    pub employee_id: String,
    pub project_id: Option<String>,
    pub description: Option<String>,
    pub start_time: String,
    pub end_time: Option<String>,
    pub duration_seconds: Option<i64>,
    pub is_billable: bool,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HulyIssueActivity {
    pub id: Option<i64>,
    pub employee_id: String,
    pub huly_issue_id: String,
    pub issue_identifier: Option<String>,
    pub issue_title: Option<String>,
    pub action: String,
    pub old_status: Option<String>,
    pub new_status: Option<String>,
    pub occurred_at: String,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HulyDocumentActivity {
    pub id: Option<i64>,
    pub employee_id: String,
    pub huly_doc_id: String,
    pub doc_title: Option<String>,
    pub action: String,
    pub occurred_at: String,
    pub synced_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SlackMessageActivity {
    pub id: Option<i64>,
    pub message_key: String,
    pub slack_channel_id: String,
    pub slack_user_id: Option<String>,
    pub employee_id: Option<String>,
    pub message_ts: String,
    pub message_ts_ms: Option<i64>,
    pub content_preview: Option<String>,
    pub detected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct OpsEvent {
    pub id: Option<i64>,
    pub sync_key: String,
    pub schema_version: String,
    pub source: String,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub actor_employee_id: Option<String>,
    pub actor_clockify_user_id: Option<String>,
    pub actor_huly_person_id: Option<String>,
    pub actor_slack_user_id: Option<String>,
    pub occurred_at: String,
    pub severity: String,
    pub payload_json: String,
    pub detected_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AgentFeedItem {
    pub id: Option<i64>,
    pub sync_key: String,
    pub schema_version: String,
    pub source: String,
    pub event_type: String,
    pub entity_type: String,
    pub entity_id: String,
    pub occurred_at: String,
    pub detected_at: String,
    pub severity: String,
    pub owner_hint: Option<String>,
    pub actor_employee_id: Option<String>,
    pub actor_clockify_user_id: Option<String>,
    pub actor_huly_person_id: Option<String>,
    pub actor_slack_user_id: Option<String>,
    pub payload_json: String,
    pub metadata_json: Option<String>,
    pub refreshed_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Presence {
    pub employee_id: String,
    pub clockify_timer_active: bool,
    pub clockify_timer_project: Option<String>,
    pub clockify_timer_start: Option<String>,
    pub huly_last_seen: Option<String>,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct SyncState {
    pub source: String,
    pub entity: String,
    pub last_sync_at: String,
    pub last_cursor: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct Setting {
    pub key: String,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct HulyCachedEntityRow {
    pub id: String,
    pub payload: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ManualLeaveEntry {
    pub id: String,
    pub employee_id: String,
    pub leave_type: String,
    pub date_from: String,
    pub date_to: String,
    pub status: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ManualHoliday {
    pub id: String,
    pub title: String,
    pub date: String,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

// ─── View / summary structs (returned to frontend) ───────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaRow {
    pub employee_name: String,
    pub this_week_hours: f64,
    pub this_month_hours: f64,
    pub quota: f64,
    pub status: QuotaStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum QuotaStatus {
    OnTrack,
    Behind,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OverviewData {
    pub team_hours_this_month: f64,
    pub team_quota: f64,
    pub utilization_rate: f64,
    pub active_count: u32,
    pub total_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStats {
    pub project_id: Option<String>,
    pub project_name: String,
    pub total_hours: f64,
    pub billable_hours: f64,
    pub team_members: u32,
    pub utilization: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectGraph {
    pub project: TeamforgeProject,
    pub github_repos: Vec<TeamforgeProjectGithubRepoLink>,
    pub huly_links: Vec<TeamforgeProjectHulyLink>,
    pub artifacts: Vec<TeamforgeProjectArtifact>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectSyncPolicyView {
    pub issues_enabled: bool,
    pub milestones_enabled: bool,
    pub components_enabled: bool,
    pub templates_enabled: bool,
    pub issue_ownership_mode: String,
    pub engineering_source: String,
    pub execution_source: String,
    pub milestone_authority: String,
    pub issue_classification_mode: String,
    pub direction_mode: String,
    pub rule_config_json: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgePolicyStateView {
    pub sync_state: String,
    pub last_sync_at: Option<String>,
    pub last_sync_status: Option<String>,
    pub last_sync_job_id: Option<String>,
    pub paused_at: Option<String>,
    pub paused_by: Option<String>,
    pub last_error_code: Option<String>,
    pub last_error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeSyncEntityMappingView {
    pub id: String,
    pub entity_type: String,
    pub title: String,
    pub status: Option<String>,
    pub ownership_domain: String,
    pub classification_source: String,
    pub classification_reason: Option<String>,
    pub mapping_status: String,
    pub source_url: Option<String>,
    pub github_repo: Option<String>,
    pub github_number: Option<i64>,
    pub huly_project_id: Option<String>,
    pub huly_entity_id: Option<String>,
    pub last_source: Option<String>,
    pub last_source_version: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeSyncJournalEntryView {
    pub id: String,
    pub entity_mapping_id: Option<String>,
    pub entity_type: String,
    pub source_system: String,
    pub destination_system: String,
    pub action: String,
    pub status: String,
    pub source_ref: Option<String>,
    pub destination_ref: Option<String>,
    pub payload_hash: String,
    pub payload_json: Option<String>,
    pub retry_count: u32,
    pub conflict_id: Option<String>,
    pub job_id: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
    pub actor_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeSyncConflictView {
    pub id: String,
    pub entity_mapping_id: Option<String>,
    pub entity_type: String,
    pub conflict_type: String,
    pub canonical_source: String,
    pub detected_source: String,
    pub status: String,
    pub summary: String,
    pub github_payload_json: Option<String>,
    pub huly_payload_json: Option<String>,
    pub resolution_note: Option<String>,
    pub resolved_by: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    pub resolved_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectControlPlaneSummaryView {
    pub open_conflicts: u32,
    pub mapped_milestones: u32,
    pub engineering_issues: u32,
    pub execution_issues: u32,
    pub recent_failures: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeProjectControlPlaneView {
    pub project: TeamforgeProjectGraph,
    pub policy: Option<TeamforgeProjectSyncPolicyView>,
    pub policy_state: TeamforgePolicyStateView,
    pub entity_mappings: Vec<TeamforgeSyncEntityMappingView>,
    pub journal: Vec<TeamforgeSyncJournalEntryView>,
    pub conflicts: Vec<TeamforgeSyncConflictView>,
    pub summary: TeamforgeProjectControlPlaneSummaryView,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionProjectView {
    pub id: String,
    pub source: String,
    pub repo: Option<String>,
    pub milestone: Option<String>,
    pub title: String,
    pub status: String,
    pub total_issues: u32,
    pub open_issues: u32,
    pub closed_issues: u32,
    pub total_prs: u32,
    pub open_prs: u32,
    pub branches: u32,
    pub failing_checks: u32,
    pub percent_complete: f64,
    pub latest_activity: Option<String>,
    pub huly_project_id: Option<String>,
    pub clockify_project_id: Option<String>,
    pub total_hours: f64,
    pub billable_hours: f64,
    pub team_members: u32,
    pub utilization: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCatalogItem {
    pub id: String,
    pub name: String,
    pub client_name: Option<String>,
    pub is_billable: bool,
    pub is_archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresenceStatus {
    pub employee_name: String,
    pub clockify_timer_active: bool,
    pub clockify_project: Option<String>,
    pub clockify_duration: Option<i64>,
    pub huly_last_seen: Option<String>,
    pub combined_status: CombinedStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CombinedStatus {
    Active,
    Idle,
    Offline,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct ActivityItem {
    pub source: String,
    pub employee_name: String,
    pub action: String,
    pub detail: Option<String>,
    pub occurred_at: String,
    pub project_id: Option<String>,
    pub source_url: Option<String>,
    pub entity_type: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GithubSyncReport {
    pub repo: String,
    pub project_id: String,
    pub milestones_synced: u32,
    pub issues_synced: u32,
    pub pull_requests_synced: u32,
    pub branches_synced: u32,
    pub check_runs_synced: u32,
    pub ops_events_upserted: u32,
    pub total_issues: u32,
    pub open_issues: u32,
    pub closed_issues: u32,
}

// ─── New Huly integration view structs ──────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MilestoneView {
    pub id: String,
    pub label: String,
    pub status: String,
    pub target_date: Option<String>,
    pub total_issues: u32,
    pub completed_issues: u32,
    pub progress_percent: f64,
    pub project_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimeDiscrepancy {
    pub employee_name: String,
    pub huly_hours: f64,
    pub clockify_hours: f64,
    pub difference_hours: f64,
    pub difference_percent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EstimationAccuracy {
    pub employee_name: String,
    pub total_issues: u32,
    pub avg_estimated_hours: f64,
    pub avg_actual_hours: f64,
    pub accuracy_percent: f64,
    pub chronic_under_estimator: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PriorityDistribution {
    pub priority: String,
    pub count: u32,
    pub assigned_count: u32,
    pub unassigned_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DepartmentView {
    pub id: String,
    pub name: String,
    pub head_name: Option<String>,
    pub member_count: u32,
    pub total_hours: f64,
    pub quota_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgPersonView {
    pub person_id: String,
    pub employee_id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub active: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgDepartmentMappingView {
    pub id: String,
    pub name: String,
    pub head_person_id: Option<String>,
    pub head_name: Option<String>,
    pub team_lead_person_id: Option<String>,
    pub team_lead_name: Option<String>,
    pub member_person_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgChartView {
    pub departments: Vec<OrgDepartmentMappingView>,
    pub people: Vec<OrgPersonView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamSnapshotView {
    pub departments: Vec<DepartmentView>,
    pub org_chart: Option<OrgChartView>,
    pub leaves: Vec<LeaveView>,
    pub holidays: Vec<HolidayView>,
    pub cache_updated_at: Option<String>,
    pub huly_error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrgDepartmentUpdateInput {
    pub department_id: String,
    pub head_person_id: Option<String>,
    pub team_lead_person_id: Option<String>,
    pub member_person_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveView {
    pub id: String,
    pub employee_id: Option<String>,
    pub source: String,
    pub editable: bool,
    pub employee_name: String,
    pub leave_type: String,
    pub date_from: String,
    pub date_to: String,
    pub status: String,
    pub days: u32,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HolidayView {
    pub id: String,
    pub source: String,
    pub editable: bool,
    pub title: String,
    pub date: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualLeaveInput {
    pub id: Option<String>,
    pub employee_id: String,
    pub leave_type: String,
    pub date_from: String,
    pub date_to: String,
    pub status: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManualHolidayInput {
    pub id: Option<String>,
    pub title: String,
    pub date: String,
    pub note: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatActivityView {
    pub employee_name: String,
    pub message_count: u32,
    pub channels_active: u32,
    pub last_message_at: Option<String>,
    pub sources: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardCardView {
    pub id: String,
    pub title: String,
    pub status: String,
    pub assignee_name: Option<String>,
    pub days_in_status: u32,
    pub board_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MeetingLoadView {
    pub employee_name: String,
    pub meetings_this_week: u32,
    pub total_meeting_hours: f64,
    pub work_hours: f64,
    pub meeting_ratio: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeScheduleEventView {
    pub id: String,
    pub title: String,
    pub starts_at: String,
    pub ends_at: Option<String>,
    pub source: String,
    pub space: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmployeeSummaryView {
    pub employee: Employee,
    pub department_names: Vec<String>,
    pub role_labels: Vec<String>,
    pub work_hours_this_week: f64,
    pub work_hours_this_month: f64,
    pub meetings_this_week: u32,
    pub meeting_hours_this_week: f64,
    pub standups_last_7_days: u32,
    pub last_standup_at: Option<String>,
    pub messages_last_7_days: u32,
    pub last_message_at: Option<String>,
    pub current_leave: Option<LeaveView>,
    pub upcoming_leaves: Vec<LeaveView>,
    pub upcoming_events: Vec<EmployeeScheduleEventView>,
}
