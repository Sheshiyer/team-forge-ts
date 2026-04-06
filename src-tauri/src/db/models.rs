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
