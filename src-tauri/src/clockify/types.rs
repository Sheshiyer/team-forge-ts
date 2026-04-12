use serde::{Deserialize, Serialize};

// ─── Clockify API response types ────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub profile_picture: Option<String>,
    pub active_workspace: Option<String>,
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyWorkspace {
    pub id: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyProject {
    pub id: String,
    pub name: String,
    pub client_name: Option<String>,
    pub color: Option<String>,
    pub billable: bool,
    pub archived: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyTimeInterval {
    pub start: String,
    pub end: Option<String>,
    pub duration: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyProjectRef {
    pub id: Option<String>,
    pub name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClockifyTimeEntry {
    pub id: String,
    pub description: Option<String>,
    pub time_interval: ClockifyTimeInterval,
    pub project_id: Option<String>,
    pub project: Option<ClockifyProjectRef>,
    pub billable: bool,
}

// ─── Sync report ────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncReport {
    pub users_synced: u32,
    pub projects_synced: u32,
    pub time_entries_synced: u32,
}
