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
            (Some(endpoint), Some(token), Some(workspace)) => {
                Some(WorkspaceLoginInfo { endpoint, token, workspace })
            }
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
    pub title: Option<String>,
    pub description: Option<String>,
    pub members: Option<Vec<String>>,
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
}
