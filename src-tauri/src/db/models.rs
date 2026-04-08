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
    pub project_name: String,
    pub total_hours: f64,
    pub billable_hours: f64,
    pub team_members: u32,
    pub utilization: f64,
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
pub struct OrgDepartmentUpdateInput {
    pub department_id: String,
    pub head_person_id: Option<String>,
    pub team_lead_person_id: Option<String>,
    pub member_person_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LeaveView {
    pub employee_name: String,
    pub leave_type: String,
    pub date_from: String,
    pub date_to: String,
    pub status: String,
    pub days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HolidayView {
    pub title: String,
    pub date: String,
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
