use chrono::{DateTime, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::time::Duration;

use crate::db::queries;

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
    pub steps: u32,
    pub blocked: u32,
    pub stale: bool,
    pub uninitialized: bool,
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

    let personal = fetch_personal_context(pool, &founder_user_id).await?;
    Ok(summarize_runtime(&telemetry, &personal))
}

fn summarize_runtime(
    telemetry: &[PaperclipTelemetryItem],
    personal: &PaperclipPersonalContext,
) -> PaperclipRuntimeOverview {
    let healthy_count = telemetry
        .iter()
        .filter(|item| item.status == "healthy")
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
        .filter(|task| task.status != "completed")
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
    }
}

fn telemetry_rank(status: &str) -> u8 {
    match status {
        "stale" => 0,
        "uninitialized" => 1,
        _ => 2,
    }
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

        let summary = summarize_runtime(&telemetry, &personal);
        assert_eq!(summary.healthy_count, 1);
        assert_eq!(summary.stale_count, 1);
        assert_eq!(summary.escalation_backlog_count, 1);
        assert_eq!(summary.active_task_count, 3);
        assert_eq!(
            summary.latest_escalation_title.as_deref(),
            Some("Founder escalation for delivery blocker")
        );
    }
}
