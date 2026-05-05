use chrono::{DateTime, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::time::Duration;

use crate::db::queries;

const DEFAULT_PAPERCLIP_UI_URL: &str = "http://127.0.0.1:3131";
const DEFAULT_PAPERCLIP_API_URL: &str = "http://127.0.0.1:3101/api";

#[derive(Debug, Clone)]
struct PaperclipApiConfig {
    base_url: Url,
    token: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipUser {
    pub user_id: String,
    pub user_name: String,
    pub title: Option<String>,
    pub department: Option<String>,
    pub role: Option<String>,
    pub reports_to: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipTelemetryItem {
    pub user_id: String,
    pub user_name: String,
    pub department: Option<String>,
    pub role: Option<String>,
    pub status: String,
    pub last_cycle: Option<String>,
    pub outcome: Option<String>,
    #[serde(default)]
    pub steps: u32,
    #[serde(default)]
    pub blocked: u32,
    #[serde(default)]
    pub degraded: bool,
    #[serde(default)]
    pub stale: bool,
    #[serde(default)]
    pub uninitialized: bool,
    #[serde(default)]
    pub missing_files: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipTaskSummary {
    pub pending: u32,
    pub in_progress: u32,
    pub blocked: u32,
    pub completed: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipTask {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub department: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub source_ref: Option<String>,
    pub updated_at: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipPersonalContext {
    pub user_id: String,
    pub user_name: String,
    pub current_krebs: Option<String>,
    pub latest_heartbeat_at: Option<String>,
    pub summary: PaperclipTaskSummary,
    #[serde(default)]
    pub tasks: Vec<PaperclipTask>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRoomDefinition {
    pub id: String,
    pub name: String,
    pub room_type: String,
    pub description: Option<String>,
    pub project_code: Option<String>,
    pub project_name: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipEscalationInput {
    pub title: String,
    pub body: String,
    pub severity: Option<String>,
    pub user_id: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipEscalationResponse {
    pub id: String,
    pub issue_key: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeOverview {
    pub healthy_count: u32,
    pub stale_count: u32,
    pub uninitialized_count: u32,
    pub total_agents: u32,
    pub active_task_count: u32,
    pub escalation_backlog_count: u32,
    pub latest_activity_at: Option<String>,
    pub latest_activity_label: Option<String>,
    pub latest_escalation_title: Option<String>,
    pub latest_escalation_at: Option<String>,
    pub focus_user_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeStatusSummary {
    pub healthy: u32,
    pub degraded: u32,
    pub uninitialized: u32,
    pub stale: u32,
    pub missing_file_agents: u32,
    pub total: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeRefreshTargets {
    pub stale: u32,
    pub uninitialized: u32,
    pub refresh_candidates: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeStatusView {
    pub checked_at: String,
    pub summary: PaperclipRuntimeStatusSummary,
    #[serde(default)]
    pub agents: Vec<PaperclipTelemetryItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeOperationRequest {
    #[serde(default)]
    pub agents: Vec<String>,
    pub include_no_cycle: Option<bool>,
    pub converge: Option<bool>,
    pub strict_final_check: Option<bool>,
    pub dry_run: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRuntimeOperationResult {
    pub operation: String,
    pub status: String,
    pub message: String,
    pub dry_run: bool,
    pub output: Option<String>,
    #[serde(default)]
    pub targeted_agents: Vec<String>,
    #[serde(default)]
    pub refreshed_agents: Vec<String>,
    pub refreshed_count: u32,
    pub failures: u32,
    pub initial_summary: Option<PaperclipRuntimeStatusSummary>,
    pub final_summary: Option<PaperclipRuntimeStatusSummary>,
    pub initial_refresh_targets: Option<PaperclipRuntimeRefreshTargets>,
    pub final_refresh_targets: Option<PaperclipRuntimeRefreshTargets>,
    pub runtime_status: PaperclipRuntimeStatusView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApiProbeResult {
    pub ready: bool,
    pub base_url: String,
    pub message: String,
    pub user_count: u32,
    pub telemetry_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipOrgNodeView {
    pub user: PaperclipUser,
    pub telemetry: Option<PaperclipTelemetryItem>,
    pub queue_summary: PaperclipTaskSummary,
    pub active_task_count: u32,
    pub escalation_count: u32,
    pub room_count: u32,
    pub project_room_count: u32,
    pub project_room_names: Vec<String>,
    pub latest_heartbeat_at: Option<String>,
    pub direct_report_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipOrgView {
    pub root_user_id: String,
    pub nodes: Vec<PaperclipOrgNodeView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipFounderQueueItemView {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub department: Option<String>,
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub source_ref: Option<String>,
    pub updated_at: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub user_id: String,
    pub user_name: String,
    pub escalation_tagged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipFounderQueueSectionView {
    pub key: String,
    pub label: String,
    pub count: u32,
    pub items: Vec<PaperclipFounderQueueItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipFounderQueueView {
    pub founder_user_id: String,
    pub founder_user_name: String,
    pub latest_heartbeat_at: Option<String>,
    pub total_active: u32,
    pub escalation_backlog_count: u32,
    pub sections: Vec<PaperclipFounderQueueSectionView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipAgentDetailView {
    pub user: PaperclipUser,
    pub telemetry: Option<PaperclipTelemetryItem>,
    pub personal_context: PaperclipPersonalContext,
    pub rooms: Vec<PaperclipRoomDefinition>,
    pub active_task_count: u32,
    pub escalation_backlog_count: u32,
    pub project_room_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApprovalItemView {
    pub id: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub department: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub source: Option<String>,
    pub source_ref: Option<String>,
    pub updated_at: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub user_id: String,
    pub user_name: String,
    pub escalation_tagged: bool,
    pub details: Option<String>,
    pub approval_state: String,
    pub approval_decision: Option<String>,
    pub approval_note: Option<String>,
    pub resolved_at: Option<String>,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApprovalSectionView {
    pub key: String,
    pub label: String,
    pub count: u32,
    #[serde(default)]
    pub items: Vec<PaperclipApprovalItemView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApprovalQueueView {
    pub founder_user_id: String,
    pub founder_user_name: String,
    pub latest_heartbeat_at: Option<String>,
    pub total_open: u32,
    pub pending_count: u32,
    pub blocked_count: u32,
    pub deferred_count: u32,
    pub resolved_count: u32,
    #[serde(default)]
    pub sections: Vec<PaperclipApprovalSectionView>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApprovalResolveInput {
    pub decision: String,
    pub note: Option<String>,
    pub resolved_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipApprovalResolveResult {
    pub id: String,
    pub decision: String,
    pub status: String,
    pub approval_state: String,
    pub note: Option<String>,
    pub resolved_at: String,
    pub resolved_by: String,
    pub dry_run: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PaperclipUserLookup {
    pub user_id: String,
}

fn normalize_optional_setting(value: Option<String>) -> Option<String> {
    value
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
}

async fn setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, String> {
    Ok(normalize_optional_setting(
        queries::get_setting(pool, key)
            .await
            .map_err(|error| format!("read {key}: {error}"))?,
    ))
}

pub async fn read_api_config_optional(pool: &SqlitePool) -> Result<Option<(String, bool)>, String> {
    let url = setting(pool, "paperclip_api_url").await?;
    let token = setting(pool, "paperclip_api_token").await?;

    match (url, token) {
        (None, None) => Ok(None),
        (Some(url), Some(_token)) => Ok(Some((url, true))),
        (Some(url), None) => Ok(Some((url, false))),
        (None, Some(_token)) => Ok(Some((DEFAULT_PAPERCLIP_API_URL.to_string(), true))),
    }
}

async fn load_api_config(pool: &SqlitePool) -> Result<PaperclipApiConfig, String> {
    let url = setting(pool, "paperclip_api_url")
        .await?
        .unwrap_or_else(|| DEFAULT_PAPERCLIP_API_URL.to_string());
    let token = setting(pool, "paperclip_api_token")
        .await?
        .ok_or_else(|| "Paperclip API token is not configured.".to_string())?;

    let base_url =
        Url::parse(&url).map_err(|error| format!("Invalid Paperclip API URL: {error}"))?;
    if !matches!(base_url.scheme(), "http" | "https") {
        return Err("Paperclip API URL must use http:// or https://".to_string());
    }

    Ok(PaperclipApiConfig { base_url, token })
}

pub fn default_api_url() -> &'static str {
    DEFAULT_PAPERCLIP_API_URL
}

pub fn default_ui_url() -> &'static str {
    DEFAULT_PAPERCLIP_UI_URL
}

fn endpoint_url(base_url: &Url, route: &str) -> Result<Url, String> {
    let route = route.trim();
    if route.is_empty() {
        return Err("Paperclip API route is required".to_string());
    }

    let mut url = base_url.clone();
    let mut base_path = url.path().trim_end_matches('/').to_string();
    let mut route_path = route.trim_start_matches('/').to_string();

    if base_path.ends_with("/api") && route_path.starts_with("api/") {
        route_path = route_path.trim_start_matches("api/").to_string();
    }

    if base_path.is_empty() {
        base_path.push('/');
    }
    if !base_path.ends_with('/') {
        base_path.push('/');
    }
    base_path.push_str(&route_path);
    url.set_path(&base_path);
    Ok(url)
}

pub async fn probe_url(base_url: &str, token: &str) -> Result<(), String> {
    let parsed =
        Url::parse(base_url).map_err(|error| format!("Invalid Paperclip API URL: {error}"))?;
    let url = endpoint_url(&parsed, "/api/users")?;
    Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .map_err(|error| format!("Build Paperclip probe client: {error}"))?
        .get(url.clone())
        .bearer_auth(token)
        .send()
        .await
        .map_err(|error| format!("GET {}: {error}", url))?
        .error_for_status()
        .map_err(|error| format!("GET {}: {error}", url))?;
    Ok(())
}

async fn get_json<T: for<'de> Deserialize<'de>>(
    pool: &SqlitePool,
    route: &str,
) -> Result<T, String> {
    let config = load_api_config(pool).await?;
    let url = endpoint_url(&config.base_url, route)?;
    let response = Client::new()
        .get(url.clone())
        .bearer_auth(config.token)
        .send()
        .await
        .map_err(|error| format!("GET {}: {error}", url))?
        .error_for_status()
        .map_err(|error| format!("GET {}: {error}", url))?;

    response
        .json::<T>()
        .await
        .map_err(|error| format!("Decode {}: {error}", url))
}

async fn get_json_allow_404<T: for<'de> Deserialize<'de>>(
    pool: &SqlitePool,
    route: &str,
) -> Result<Option<T>, String> {
    let config = load_api_config(pool).await?;
    let url = endpoint_url(&config.base_url, route)?;
    let response = Client::new()
        .get(url.clone())
        .bearer_auth(config.token)
        .send()
        .await
        .map_err(|error| format!("GET {}: {error}", url))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }

    let response = response
        .error_for_status()
        .map_err(|error| format!("GET {}: {error}", url))?;

    response
        .json::<T>()
        .await
        .map(Some)
        .map_err(|error| format!("Decode {}: {error}", url))
}

async fn post_json<T: for<'de> Deserialize<'de>, B: Serialize>(
    pool: &SqlitePool,
    route: &str,
    body: &B,
) -> Result<T, String> {
    let config = load_api_config(pool).await?;
    let url = endpoint_url(&config.base_url, route)?;
    let response = Client::new()
        .post(url.clone())
        .bearer_auth(config.token)
        .json(body)
        .send()
        .await
        .map_err(|error| format!("POST {}: {error}", url))?
        .error_for_status()
        .map_err(|error| format!("POST {}: {error}", url))?;

    response
        .json::<T>()
        .await
        .map_err(|error| format!("Decode {}: {error}", url))
}

pub async fn fetch_users(pool: &SqlitePool) -> Result<Vec<PaperclipUser>, String> {
    let mut users = get_json::<Vec<PaperclipUser>>(pool, "/api/users").await?;
    users.sort_by(|left, right| left.user_name.cmp(&right.user_name));
    Ok(users)
}

pub async fn fetch_telemetry(pool: &SqlitePool) -> Result<Vec<PaperclipTelemetryItem>, String> {
    let mut items = get_json::<Vec<PaperclipTelemetryItem>>(pool, "/api/telemetry").await?;
    items.sort_by(|left, right| {
        telemetry_rank(&left.status)
            .cmp(&telemetry_rank(&right.status))
            .then(left.user_name.cmp(&right.user_name))
    });
    Ok(items)
}

pub async fn fetch_runtime_status(pool: &SqlitePool) -> Result<PaperclipRuntimeStatusView, String> {
    get_json(pool, "/api/runtime/status").await
}

pub async fn fetch_personal_context(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<PaperclipPersonalContext, String> {
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("Paperclip user id is required".to_string());
    }
    get_json(pool, &format!("/api/personal/{user_id}")).await
}

pub async fn fetch_rooms(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Vec<PaperclipRoomDefinition>, String> {
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("Paperclip user id is required".to_string());
    }
    get_json(pool, &format!("/api/rooms/{user_id}")).await
}

pub async fn create_escalation(
    pool: &SqlitePool,
    input: &PaperclipEscalationInput,
) -> Result<PaperclipEscalationResponse, String> {
    if input.title.trim().is_empty() {
        return Err("Escalation title is required".to_string());
    }
    if input.body.trim().is_empty() {
        return Err("Escalation body is required".to_string());
    }
    post_json(pool, "/api/escalations", input).await
}

pub async fn run_warm_start(
    pool: &SqlitePool,
    input: &PaperclipRuntimeOperationRequest,
) -> Result<PaperclipRuntimeOperationResult, String> {
    post_json(pool, "/api/runtime/warm-start", input).await
}

pub async fn run_refresh_stale(
    pool: &SqlitePool,
    input: &PaperclipRuntimeOperationRequest,
) -> Result<PaperclipRuntimeOperationResult, String> {
    post_json(pool, "/api/runtime/refresh-stale", input).await
}

pub async fn run_maintain_heartbeat(
    pool: &SqlitePool,
    input: &PaperclipRuntimeOperationRequest,
) -> Result<PaperclipRuntimeOperationResult, String> {
    post_json(pool, "/api/runtime/maintain-heartbeat", input).await
}

pub async fn fetch_approvals(pool: &SqlitePool) -> Result<PaperclipApprovalQueueView, String> {
    get_json(pool, "/api/approvals").await
}

pub async fn resolve_approval(
    pool: &SqlitePool,
    task_id: &str,
    input: &PaperclipApprovalResolveInput,
) -> Result<PaperclipApprovalResolveResult, String> {
    let task_id = task_id.trim();
    if task_id.is_empty() {
        return Err("Approval task id is required".to_string());
    }
    post_json(pool, &format!("/api/approvals/{task_id}/resolve"), input).await
}

pub async fn probe_api(pool: &SqlitePool) -> Result<PaperclipApiProbeResult, String> {
    let config = load_api_config(pool).await?;
    let users = fetch_users(pool).await?;
    let telemetry = fetch_telemetry(pool).await?;

    Ok(PaperclipApiProbeResult {
        ready: true,
        base_url: config.base_url.to_string(),
        message: "Paperclip runtime API is reachable.".to_string(),
        user_count: users.len() as u32,
        telemetry_count: telemetry.len() as u32,
    })
}

pub async fn fetch_runtime_overview(pool: &SqlitePool) -> Result<PaperclipRuntimeOverview, String> {
    let telemetry = fetch_telemetry(pool).await?;
    let users = fetch_users(pool).await?;

    let founder_user_id = users
        .iter()
        .find(|user| user.user_id == "ceo")
        .map(|user| user.user_id.clone())
        .or_else(|| users.first().map(|user| user.user_id.clone()))
        .unwrap_or_else(|| "ceo".to_string());
    let focus_user_id = resolve_focus_user_id(pool, &users).await?;

    let personal = fetch_personal_context(pool, &founder_user_id).await?;
    Ok(summarize_runtime(&telemetry, &personal, focus_user_id))
}

pub async fn fetch_org_view(pool: &SqlitePool) -> Result<PaperclipOrgView, String> {
    let users = fetch_users(pool).await?;
    if users.is_empty() {
        return Err("Paperclip returned no agents.".to_string());
    }

    let telemetry = fetch_telemetry(pool).await?;
    let telemetry_by_id: HashMap<String, PaperclipTelemetryItem> = telemetry
        .into_iter()
        .map(|item| (item.user_id.clone(), item))
        .collect();

    let mut personal_by_user: HashMap<String, PaperclipPersonalContext> = HashMap::new();
    let mut rooms_by_user: HashMap<String, Vec<PaperclipRoomDefinition>> = HashMap::new();

    for user in &users {
        personal_by_user.insert(
            user.user_id.clone(),
            fetch_personal_context(pool, &user.user_id)
                .await
                .unwrap_or_else(|_| empty_personal_context(user)),
        );
        rooms_by_user.insert(
            user.user_id.clone(),
            fetch_rooms(pool, &user.user_id).await.unwrap_or_default(),
        );
    }

    let mut direct_reports_by_manager: HashMap<String, Vec<String>> = HashMap::new();
    for user in &users {
        if let Some(manager_id) = user
            .reports_to
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            direct_reports_by_manager
                .entry(manager_id.to_string())
                .or_default()
                .push(user.user_id.clone());
        }
    }

    let user_name_by_id: HashMap<&str, &str> = users
        .iter()
        .map(|user| (user.user_id.as_str(), user.user_name.as_str()))
        .collect();
    for reports in direct_reports_by_manager.values_mut() {
        reports.sort_by(|left, right| {
            user_name_by_id
                .get(left.as_str())
                .copied()
                .unwrap_or(left.as_str())
                .cmp(
                    user_name_by_id
                        .get(right.as_str())
                        .copied()
                        .unwrap_or(right.as_str()),
                )
        });
    }

    let root_user_id = users
        .iter()
        .find(|user| user.user_id == "ceo")
        .map(|user| user.user_id.clone())
        .or_else(|| {
            users
                .iter()
                .find(|user| {
                    user.reports_to
                        .as_deref()
                        .map(str::trim)
                        .filter(|value| !value.is_empty())
                        .is_none()
                })
                .map(|user| user.user_id.clone())
        })
        .unwrap_or_else(|| users[0].user_id.clone());

    let mut nodes = Vec::with_capacity(users.len());
    for user in users {
        let personal = personal_by_user
            .remove(&user.user_id)
            .unwrap_or_else(|| empty_personal_context(&user));
        let rooms = rooms_by_user.remove(&user.user_id).unwrap_or_default();
        let project_room_names: Vec<String> = rooms
            .iter()
            .filter(|room| room.room_type.eq_ignore_ascii_case("project"))
            .map(|room| {
                room.project_name
                    .clone()
                    .unwrap_or_else(|| room.name.clone())
            })
            .collect();

        nodes.push(PaperclipOrgNodeView {
            telemetry: telemetry_by_id.get(&user.user_id).cloned(),
            queue_summary: personal.summary.clone(),
            active_task_count: active_task_count(&personal.summary),
            escalation_count: personal
                .tasks
                .iter()
                .filter(|task| !task_is_completed(task))
                .filter(|task| task_is_escalation(task))
                .count() as u32,
            room_count: rooms.len() as u32,
            project_room_count: project_room_names.len() as u32,
            project_room_names,
            latest_heartbeat_at: personal.latest_heartbeat_at.clone(),
            direct_report_ids: direct_reports_by_manager
                .get(&user.user_id)
                .cloned()
                .unwrap_or_default(),
            user,
        });
    }

    nodes.sort_by(|left, right| {
        if left.user.user_id == root_user_id {
            Ordering::Less
        } else if right.user.user_id == root_user_id {
            Ordering::Greater
        } else {
            left.user.user_name.cmp(&right.user.user_name)
        }
    });

    Ok(PaperclipOrgView {
        root_user_id,
        nodes,
    })
}

pub async fn fetch_founder_queue(pool: &SqlitePool) -> Result<PaperclipFounderQueueView, String> {
    let users = fetch_users(pool).await?;
    let founder = users
        .iter()
        .find(|user| user.user_id == "ceo")
        .cloned()
        .or_else(|| users.first().cloned())
        .ok_or_else(|| "Paperclip returned no agents.".to_string())?;
    let personal = fetch_personal_context(pool, &founder.user_id).await?;

    let mut sections = vec![
        build_queue_section(
            "awaiting-routing",
            "Awaiting Routing",
            &founder,
            &personal.tasks,
        ),
        build_queue_section("blocked", "Blocked", &founder, &personal.tasks),
        build_queue_section("escalations", "Escalations", &founder, &personal.tasks),
        build_queue_section("in-progress", "In Progress", &founder, &personal.tasks),
        build_queue_section(
            "recent-completed",
            "Recent Completed",
            &founder,
            &personal.tasks,
        ),
    ];
    sections.retain(|section| !section.items.is_empty());

    Ok(PaperclipFounderQueueView {
        founder_user_id: founder.user_id,
        founder_user_name: founder.user_name,
        latest_heartbeat_at: personal.latest_heartbeat_at,
        total_active: active_task_count(&personal.summary),
        escalation_backlog_count: personal
            .tasks
            .iter()
            .filter(|task| !task_is_completed(task))
            .filter(|task| task_is_escalation(task))
            .count() as u32,
        sections,
    })
}

pub async fn fetch_agent_detail(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<PaperclipAgentDetailView, String> {
    let user_id = user_id.trim();
    if user_id.is_empty() {
        return Err("Paperclip user id is required".to_string());
    }

    let users = fetch_users(pool).await?;
    let user = users
        .into_iter()
        .find(|candidate| candidate.user_id == user_id)
        .ok_or_else(|| format!("Paperclip user not found: {user_id}"))?;
    let telemetry = fetch_telemetry(pool)
        .await?
        .into_iter()
        .find(|item| item.user_id == user_id);
    let personal_context = fetch_personal_context(pool, user_id).await?;
    let rooms = fetch_rooms(pool, user_id).await?;
    let project_room_count = rooms
        .iter()
        .filter(|room| room.room_type.eq_ignore_ascii_case("project"))
        .count() as u32;
    let escalation_backlog_count = personal_context
        .tasks
        .iter()
        .filter(|task| !task_is_completed(task))
        .filter(|task| task_is_escalation(task))
        .count() as u32;

    Ok(PaperclipAgentDetailView {
        user,
        telemetry,
        active_task_count: active_task_count(&personal_context.summary),
        escalation_backlog_count,
        project_room_count,
        personal_context,
        rooms,
    })
}

fn summarize_runtime(
    telemetry: &[PaperclipTelemetryItem],
    personal: &PaperclipPersonalContext,
    focus_user_id: Option<String>,
) -> PaperclipRuntimeOverview {
    let healthy_count = telemetry
        .iter()
        .filter(|item| {
            item.status == "healthy" && !item.degraded && !item.stale && !item.uninitialized
        })
        .count() as u32;
    let stale_count = telemetry.iter().filter(|item| item.stale).count() as u32;
    let uninitialized_count = telemetry
        .iter()
        .filter(|item| item.uninitialized || item.missing_files > 0)
        .count() as u32;

    let latest_activity = telemetry
        .iter()
        .filter_map(|item| {
            item.last_cycle
                .as_deref()
                .and_then(parse_iso_timestamp)
                .map(|timestamp| (timestamp, item))
        })
        .max_by_key(|(timestamp, _)| *timestamp);

    let escalation_tasks = personal
        .tasks
        .iter()
        .filter(|task| !task_is_completed(task))
        .filter(|task| {
            task.tags
                .iter()
                .any(|tag| tag.eq_ignore_ascii_case("escalation"))
                || task.title.to_ascii_lowercase().contains("escalat")
                || task
                    .priority
                    .as_deref()
                    .map(|priority| priority.eq_ignore_ascii_case("critical"))
                    .unwrap_or(false)
        })
        .collect::<Vec<_>>();

    let latest_escalation = escalation_tasks
        .iter()
        .filter_map(|task| {
            task.updated_at
                .as_deref()
                .and_then(parse_iso_timestamp)
                .map(|timestamp| (timestamp, *task))
        })
        .max_by_key(|(timestamp, _)| *timestamp);

    PaperclipRuntimeOverview {
        healthy_count,
        stale_count,
        uninitialized_count,
        total_agents: telemetry.len() as u32,
        active_task_count: personal.summary.pending
            + personal.summary.in_progress
            + personal.summary.blocked,
        escalation_backlog_count: escalation_tasks.len() as u32,
        latest_activity_at: latest_activity.map(|(timestamp, _)| timestamp.to_rfc3339()),
        latest_activity_label: latest_activity.map(|(_, item)| {
            let outcome = item
                .outcome
                .clone()
                .unwrap_or_else(|| item.status.clone())
                .to_uppercase();
            format!("{} · {}", item.user_name.to_uppercase(), outcome)
        }),
        latest_escalation_title: latest_escalation.map(|(_, task)| task.title.clone()),
        latest_escalation_at: latest_escalation.map(|(timestamp, _)| timestamp.to_rfc3339()),
        focus_user_id,
    }
}

fn telemetry_rank(status: &str) -> u8 {
    match status {
        "stale" => 0,
        "uninitialized" => 1,
        "degraded" => 2,
        _ => 3,
    }
}

fn normalize_task_status(status: &str) -> String {
    status
        .trim()
        .to_ascii_lowercase()
        .replace('-', "_")
        .replace(' ', "_")
}

fn task_is_completed(task: &PaperclipTask) -> bool {
    matches!(
        normalize_task_status(&task.status).as_str(),
        "completed" | "done" | "closed"
    )
}

fn task_is_in_progress(task: &PaperclipTask) -> bool {
    matches!(
        normalize_task_status(&task.status).as_str(),
        "in_progress" | "active" | "working"
    )
}

fn task_is_blocked(task: &PaperclipTask) -> bool {
    matches!(normalize_task_status(&task.status).as_str(), "blocked")
}

fn task_is_escalation(task: &PaperclipTask) -> bool {
    task.tags
        .iter()
        .any(|tag| tag.eq_ignore_ascii_case("escalation"))
        || task.title.to_ascii_lowercase().contains("escalat")
        || task
            .priority
            .as_deref()
            .map(|priority| priority.eq_ignore_ascii_case("critical"))
            .unwrap_or(false)
}

fn active_task_count(summary: &PaperclipTaskSummary) -> u32 {
    summary.pending + summary.in_progress + summary.blocked
}

fn priority_rank(priority: Option<&str>) -> u8 {
    match priority
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_ascii_lowercase())
        .as_deref()
    {
        Some("critical") => 0,
        Some("high") => 1,
        Some("medium") => 2,
        Some("low") => 3,
        _ => 4,
    }
}

fn task_sort(left: &PaperclipTask, right: &PaperclipTask) -> Ordering {
    task_is_escalation(right)
        .cmp(&task_is_escalation(left))
        .then_with(|| {
            priority_rank(left.priority.as_deref()).cmp(&priority_rank(right.priority.as_deref()))
        })
        .then_with(|| {
            parse_iso_timestamp(right.updated_at.as_deref().unwrap_or_default()).cmp(
                &parse_iso_timestamp(left.updated_at.as_deref().unwrap_or_default()),
            )
        })
        .then_with(|| left.title.cmp(&right.title))
}

fn queue_section_key(task: &PaperclipTask) -> &'static str {
    if task_is_completed(task) {
        "recent-completed"
    } else if task_is_escalation(task) {
        "escalations"
    } else if task_is_blocked(task) {
        "blocked"
    } else if task_is_in_progress(task) {
        "in-progress"
    } else {
        "awaiting-routing"
    }
}

fn build_queue_section(
    key: &str,
    label: &str,
    founder: &PaperclipUser,
    tasks: &[PaperclipTask],
) -> PaperclipFounderQueueSectionView {
    let mut section_tasks: Vec<PaperclipTask> = tasks
        .iter()
        .filter(|task| queue_section_key(task) == key)
        .cloned()
        .collect::<Vec<_>>();
    section_tasks.sort_by(task_sort);
    let items = section_tasks
        .into_iter()
        .map(|task| {
            let escalation_tagged = task_is_escalation(&task);
            PaperclipFounderQueueItemView {
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                department: task.department,
                tags: task.tags,
                source: task.source,
                source_ref: task.source_ref,
                updated_at: task.updated_at,
                project_code: task.project_code,
                project_id: task.project_id,
                client_id: task.client_id,
                user_id: founder.user_id.clone(),
                user_name: founder.user_name.clone(),
                escalation_tagged,
            }
        })
        .collect::<Vec<_>>();

    PaperclipFounderQueueSectionView {
        key: key.to_string(),
        label: label.to_string(),
        count: items.len() as u32,
        items,
    }
}

fn empty_personal_context(user: &PaperclipUser) -> PaperclipPersonalContext {
    PaperclipPersonalContext {
        user_id: user.user_id.clone(),
        user_name: user.user_name.clone(),
        current_krebs: user.department.clone(),
        latest_heartbeat_at: None,
        summary: PaperclipTaskSummary {
            pending: 0,
            in_progress: 0,
            blocked: 0,
            completed: 0,
        },
        tasks: Vec::new(),
    }
}

async fn resolve_focus_user_id(
    pool: &SqlitePool,
    users: &[PaperclipUser],
) -> Result<Option<String>, String> {
    if let Some(email) = operator_email_hint(pool).await? {
        if let Some(match_user) = fetch_user_lookup_by_email(pool, &email).await? {
            return Ok(Some(match_user.user_id));
        }
    }

    Ok(users
        .iter()
        .find(|user| user.user_id == "ceo")
        .map(|user| user.user_id.clone())
        .or_else(|| users.first().map(|user| user.user_id.clone())))
}

async fn operator_email_hint(pool: &SqlitePool) -> Result<Option<String>, String> {
    for key in [
        "paperclip_operator_email",
        "operator_email",
        "founder_email",
    ] {
        if let Some(value) = setting(pool, key).await? {
            if !value.is_empty() {
                return Ok(Some(value));
            }
        }
    }

    for key in ["TEAMFORGE_OPERATOR_EMAIL", "USER_EMAIL", "EMAIL"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                return Ok(Some(trimmed.to_string()));
            }
        }
    }

    Ok(None)
}

async fn fetch_user_lookup_by_email(
    pool: &SqlitePool,
    email: &str,
) -> Result<Option<PaperclipUserLookup>, String> {
    let email = email.trim();
    if email.is_empty() {
        return Ok(None);
    }

    let route = format!("/api/user/{email}");
    let lookup = get_json_allow_404::<PaperclipUserLookup>(pool, &route).await?;
    Ok(lookup)
}

fn parse_iso_timestamp(value: &str) -> Option<DateTime<Utc>> {
    DateTime::parse_from_rfc3339(value)
        .ok()
        .map(|timestamp| timestamp.with_timezone(&Utc))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn endpoint_url_handles_api_base_alias() {
        let base = Url::parse("http://127.0.0.1:3100/api").unwrap();
        let endpoint = endpoint_url(&base, "/api/telemetry").unwrap();
        assert_eq!(endpoint.as_str(), "http://127.0.0.1:3100/api/telemetry");
    }

    #[test]
    fn summarize_runtime_uses_founder_tasks_for_escalations() {
        let telemetry = vec![
            PaperclipTelemetryItem {
                user_id: "ceo".to_string(),
                user_name: "CEO".to_string(),
                department: Some("leadership".to_string()),
                role: Some("Chief Executive".to_string()),
                status: "healthy".to_string(),
                last_cycle: Some("2026-04-30T00:00:00Z".to_string()),
                outcome: Some("completed".to_string()),
                steps: 12,
                blocked: 0,
                degraded: false,
                stale: false,
                uninitialized: false,
                missing_files: 0,
            },
            PaperclipTelemetryItem {
                user_id: "engineer".to_string(),
                user_name: "Engineer".to_string(),
                department: Some("engineering".to_string()),
                role: Some("Engineering Lead".to_string()),
                status: "stale".to_string(),
                last_cycle: Some("2026-04-29T22:00:00Z".to_string()),
                outcome: Some("blocked".to_string()),
                steps: 5,
                blocked: 1,
                degraded: false,
                stale: true,
                uninitialized: false,
                missing_files: 0,
            },
        ];
        let personal = PaperclipPersonalContext {
            user_id: "ceo".to_string(),
            user_name: "CEO".to_string(),
            current_krebs: Some("leadership".to_string()),
            latest_heartbeat_at: Some("2026-04-30T00:00:00Z".to_string()),
            summary: PaperclipTaskSummary {
                pending: 1,
                in_progress: 1,
                blocked: 1,
                completed: 2,
            },
            tasks: vec![
                PaperclipTask {
                    id: "task-1".to_string(),
                    title: "Founder escalation for delivery blocker".to_string(),
                    status: "pending".to_string(),
                    priority: Some("critical".to_string()),
                    department: Some("leadership".to_string()),
                    tags: vec!["escalation".to_string()],
                    source: Some("teamforge".to_string()),
                    source_ref: None,
                    updated_at: Some("2026-04-30T00:10:00Z".to_string()),
                    project_code: None,
                    project_id: None,
                    client_id: None,
                },
                PaperclipTask {
                    id: "task-2".to_string(),
                    title: "Review design handoff".to_string(),
                    status: "in_progress".to_string(),
                    priority: Some("high".to_string()),
                    department: Some("leadership".to_string()),
                    tags: Vec::new(),
                    source: Some("paperclip".to_string()),
                    source_ref: None,
                    updated_at: Some("2026-04-30T00:05:00Z".to_string()),
                    project_code: None,
                    project_id: None,
                    client_id: None,
                },
            ],
        };

        let summary = summarize_runtime(&telemetry, &personal, Some("ceo".to_string()));
        assert_eq!(summary.healthy_count, 1);
        assert_eq!(summary.stale_count, 1);
        assert_eq!(summary.escalation_backlog_count, 1);
        assert_eq!(summary.active_task_count, 3);
        assert_eq!(summary.focus_user_id.as_deref(), Some("ceo"));
        assert_eq!(
            summary.latest_escalation_title.as_deref(),
            Some("Founder escalation for delivery blocker")
        );
    }

    #[test]
    fn founder_queue_sections_prioritize_escalations_and_blockers() {
        let founder = PaperclipUser {
            user_id: "ceo".to_string(),
            user_name: "CEO".to_string(),
            title: Some("Chief Executive".to_string()),
            department: Some("leadership".to_string()),
            role: Some("Founder".to_string()),
            reports_to: None,
            icon: None,
        };
        let tasks = vec![
            PaperclipTask {
                id: "task-route".to_string(),
                title: "Route new signal".to_string(),
                status: "pending".to_string(),
                priority: Some("medium".to_string()),
                department: Some("leadership".to_string()),
                tags: vec!["routing".to_string()],
                source: Some("paperclip".to_string()),
                source_ref: None,
                updated_at: Some("2026-04-30T00:01:00Z".to_string()),
                project_code: None,
                project_id: None,
                client_id: None,
            },
            PaperclipTask {
                id: "task-blocked".to_string(),
                title: "Resolve blocked spec".to_string(),
                status: "blocked".to_string(),
                priority: Some("high".to_string()),
                department: Some("leadership".to_string()),
                tags: Vec::new(),
                source: Some("teamforge".to_string()),
                source_ref: None,
                updated_at: Some("2026-04-30T00:02:00Z".to_string()),
                project_code: None,
                project_id: None,
                client_id: None,
            },
            PaperclipTask {
                id: "task-escalation".to_string(),
                title: "Founder escalation on delivery".to_string(),
                status: "pending".to_string(),
                priority: Some("critical".to_string()),
                department: Some("leadership".to_string()),
                tags: vec!["escalation".to_string()],
                source: Some("teamforge".to_string()),
                source_ref: Some("ESC-123".to_string()),
                updated_at: Some("2026-04-30T00:03:00Z".to_string()),
                project_code: Some("AXTECH".to_string()),
                project_id: Some("proj-1".to_string()),
                client_id: Some("client-1".to_string()),
            },
            PaperclipTask {
                id: "task-progress".to_string(),
                title: "Review launch copy".to_string(),
                status: "in_progress".to_string(),
                priority: Some("low".to_string()),
                department: Some("leadership".to_string()),
                tags: Vec::new(),
                source: Some("paperclip".to_string()),
                source_ref: None,
                updated_at: Some("2026-04-30T00:04:00Z".to_string()),
                project_code: None,
                project_id: None,
                client_id: None,
            },
            PaperclipTask {
                id: "task-done".to_string(),
                title: "Close previous loop".to_string(),
                status: "completed".to_string(),
                priority: Some("low".to_string()),
                department: Some("leadership".to_string()),
                tags: Vec::new(),
                source: Some("paperclip".to_string()),
                source_ref: None,
                updated_at: Some("2026-04-30T00:05:00Z".to_string()),
                project_code: None,
                project_id: None,
                client_id: None,
            },
        ];

        let awaiting =
            build_queue_section("awaiting-routing", "Awaiting Routing", &founder, &tasks);
        let blocked = build_queue_section("blocked", "Blocked", &founder, &tasks);
        let escalations = build_queue_section("escalations", "Escalations", &founder, &tasks);
        let in_progress = build_queue_section("in-progress", "In Progress", &founder, &tasks);
        let completed =
            build_queue_section("recent-completed", "Recent Completed", &founder, &tasks);

        assert_eq!(awaiting.count, 1);
        assert_eq!(blocked.count, 1);
        assert_eq!(escalations.count, 1);
        assert_eq!(in_progress.count, 1);
        assert_eq!(completed.count, 1);
        assert!(escalations.items[0].escalation_tagged);
        assert_eq!(escalations.items[0].project_id.as_deref(), Some("proj-1"));
    }
}
