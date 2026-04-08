use serde::{Deserialize, Serialize};

// ─── Huly platform config ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HulyConfig {
    #[serde(rename = "ACCOUNTS_URL")]
    pub accounts_url: String,
    // Other fields may exist; ignore them.
}

// ─── Auth / workspace selection ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SelectWorkspaceRequest {
    pub workspace: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceLoginInfo {
    pub endpoint: String,
    pub token: String,
    pub workspace: String,
}

/// The accounts API may wrap the result in a `result` field.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccountsResponse {
    pub result: Option<WorkspaceLoginInfo>,
    // fall through if flat
    pub endpoint: Option<String>,
    pub token: Option<String>,
    pub workspace: Option<String>,
}

impl AccountsResponse {
    /// Extract the login info whether it's nested under `result` or flat.
    pub fn into_login_info(self) -> Option<WorkspaceLoginInfo> {
        if let Some(info) = self.result {
            return Some(info);
        }
        match (self.endpoint, self.token, self.workspace) {
            (Some(endpoint), Some(token), Some(workspace)) => Some(WorkspaceLoginInfo {
                endpoint,
                token,
                workspace,
            }),
            _ => None,
        }
    }
}

// ─── Huly domain types ─────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyIssue {
    #[serde(rename = "_id")]
    pub id: String,
    pub identifier: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub status: Option<serde_json::Value>,
    pub priority: Option<serde_json::Value>,
    pub assignee: Option<String>,
    pub created_by: Option<String>,
    pub modified_by: Option<String>,
    pub modified_on: Option<i64>,
    pub created_on: Option<i64>,
    pub number: Option<i64>,
    pub space: Option<String>,
    pub estimation: Option<i64>,
    pub remaining_time: Option<i64>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyPerson {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    #[serde(default)]
    pub channels: Option<serde_json::Value>,
    pub city: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyMember {
    #[serde(rename = "_id")]
    pub id: String,
    pub role: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HulyAccountInfo {
    pub uuid: Option<String>,
    pub email: Option<String>,
    pub role: Option<String>,
    pub primary_social_id: Option<String>,
    pub social_ids: Option<Vec<String>>,
    pub workspace: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyEmployee {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    pub active: Option<bool>,
    pub position: Option<String>,
    pub person_uuid: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyProject {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub private: Option<bool>,
    pub members: Option<Vec<String>>,
    pub owners: Option<Vec<String>>,
    pub archived: Option<bool>,
    pub auto_join: Option<bool>,
    pub r#type: Option<String>,
    pub identifier: Option<String>,
    pub sequence: Option<i64>,
    pub default_issue_status: Option<String>,
    pub default_assignee: Option<String>,
    pub default_time_report_day: Option<serde_json::Value>,
    pub icon: Option<String>,
    pub color: Option<serde_json::Value>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

/// Find-all query options sent as the `options` query parameter.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct FindAllOptions {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub limit: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sort: Option<serde_json::Value>,
}

// ─── Milestones ───────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyMilestone {
    #[serde(rename = "_id")]
    pub id: String,
    pub label: Option<String>,
    pub status: Option<String>,
    pub target_date: Option<i64>,
    pub created_on: Option<i64>,
    pub modified_on: Option<i64>,
    pub space: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Time spend reports ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyTimeSpendReport {
    #[serde(rename = "_id")]
    pub id: String,
    pub attached_to: Option<String>,
    pub employee: Option<String>,
    pub value: Option<f64>,
    pub description: Option<String>,
    pub date: Option<i64>,
    pub modified_on: Option<i64>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── HR: Departments ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyDepartment {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub parent: Option<String>,
    pub team_lead: Option<String>,
    pub managers: Option<Vec<String>>,
    pub head: Option<String>,
    pub members: Option<Vec<String>>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── HR: Leave requests ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyLeaveRequest {
    #[serde(rename = "_id")]
    pub id: String,
    pub department: Option<String>,
    pub employee: Option<String>,
    pub r#type: Option<String>,
    pub date_from: Option<i64>,
    pub date_to: Option<i64>,
    pub status: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── HR: Holidays ─────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyHoliday {
    #[serde(rename = "_id")]
    pub id: String,
    pub title: Option<String>,
    pub date: Option<i64>,
    pub department: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Chunter: Channels ───────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyChannel {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    pub title: Option<String>,
    pub description: Option<String>,
    pub topic: Option<String>,
    pub private: Option<bool>,
    pub archived: Option<bool>,
    pub owners: Option<Vec<String>>,
    pub auto_join: Option<bool>,
    pub members: Option<Vec<String>>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Documents ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyDocument {
    #[serde(rename = "_id")]
    pub id: String,
    pub title: Option<String>,
    pub content: Option<String>,
    pub parent: Option<String>,
    pub space: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Boards ───────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyBoard {
    #[serde(rename = "_id")]
    pub id: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub private: Option<bool>,
    pub archived: Option<bool>,
    pub members: Option<Vec<String>>,
    pub owners: Option<Vec<String>>,
    pub r#type: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Chunter: Chat messages ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyChatMessage {
    #[serde(rename = "_id")]
    pub id: String,
    pub attached_to: Option<String>,
    pub content: Option<String>,
    pub created_by: Option<String>,
    pub modified_on: Option<i64>,
    pub created_on: Option<i64>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Board cards ──────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyBoardCard {
    #[serde(rename = "_id")]
    pub id: String,
    pub title: Option<String>,
    pub status: Option<serde_json::Value>,
    pub assignee: Option<String>,
    pub created_on: Option<i64>,
    pub modified_on: Option<i64>,
    pub space: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Calendar events ──────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyCalendarEvent {
    #[serde(rename = "_id")]
    pub id: String,
    pub title: Option<String>,
    pub date: Option<i64>,
    pub due_date: Option<i64>,
    pub participants: Option<Vec<String>>,
    pub created_by: Option<String>,
    pub space: Option<String>,
    #[serde(rename = "_class")]
    pub class: Option<String>,
}

// ─── Sync report ──────────────────────────────────────────────

/// Summary returned from a Huly sync run.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulySyncReport {
    pub issues_synced: u32,
    pub presence_updated: u32,
    pub team_cache_items: u32,
}

// ─── Workspace normalization ──────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HulyWorkspaceNormalizationSnapshot {
    pub project_count: u32,
    pub issue_count: u32,
    pub department_count: u32,
    pub channel_count: u32,
    pub employee_count: u32,
    pub duplicate_people_count: u32,
    pub untitled_document_count: u32,
    pub board_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HulyWorkspaceNormalizationAction {
    pub category: String,
    pub kind: String,
    pub target: String,
    pub reason: String,
    pub safe_to_apply: bool,
    pub applied: bool,
    pub current_value: Option<String>,
    pub desired_value: Option<String>,
    pub object_id: Option<String>,
    pub result_id: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct HulyWorkspaceNormalizationReport {
    pub dry_run: bool,
    pub workspace_id: String,
    pub actor_email: Option<String>,
    pub snapshot: HulyWorkspaceNormalizationSnapshot,
    pub applied_count: u32,
    pub pending_safe_count: u32,
    pub manual_review_count: u32,
    pub warnings: Vec<String>,
    pub actions: Vec<HulyWorkspaceNormalizationAction>,
}
