use chrono::{DateTime, Utc};
use reqwest::{Client, Url};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::cmp::Ordering;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
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
pub struct PaperclipAgentProfileRoutine {
    pub id: String,
    pub trigger: Option<String>,
    pub action: Option<String>,
    pub scope: Option<String>,
    pub renderer: Option<String>,
    pub output_path: Option<String>,
    #[serde(default)]
    pub platforms: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipAgentProfileTrigger {
    pub event: String,
    pub interval: Option<String>,
    pub action: Option<String>,
    pub filter: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipAgentProfileCommand {
    pub platform: String,
    pub command: String,
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipAgentOperatingProfile {
    pub mission: Option<String>,
    #[serde(default)]
    pub responsibilities: Vec<String>,
    #[serde(default)]
    pub boundaries: Vec<String>,
    #[serde(default)]
    pub context_sections: Vec<String>,
    #[serde(default)]
    pub routines: Vec<PaperclipAgentProfileRoutine>,
    #[serde(default)]
    pub triggers: Vec<PaperclipAgentProfileTrigger>,
    pub loop_interval: Option<String>,
    #[serde(default)]
    pub loop_reads: Vec<String>,
    #[serde(default)]
    pub loop_writes: Vec<String>,
    pub escalation_target: Option<String>,
    #[serde(default)]
    pub commands: Vec<PaperclipAgentProfileCommand>,
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
    pub operating_profile: Option<PaperclipAgentOperatingProfile>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipGoalSummaryView {
    pub total_goals: u32,
    pub active_goals: u32,
    pub blocked_goals: u32,
    pub completed_goals: u32,
    pub standing_goals: u32,
    pub agents_with_work: u32,
    pub total_agents: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipGoalItemView {
    pub key: String,
    pub title: String,
    pub status: String,
    pub priority: Option<String>,
    pub tags: Vec<String>,
    pub detail: Option<String>,
    pub source_kind: String,
    pub source_label: String,
    pub section: String,
    pub task_id: Option<String>,
    pub source_ref: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub updated_at: Option<String>,
    pub user_id: String,
    pub user_name: String,
    pub department: Option<String>,
    pub role: Option<String>,
    pub current_krebs: Option<String>,
    pub mission: Option<String>,
    pub escalation_tagged: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipGoalsAgentView {
    pub user: PaperclipUser,
    pub telemetry: Option<PaperclipTelemetryItem>,
    pub mission: Option<String>,
    pub current_krebs: Option<String>,
    pub latest_heartbeat_at: Option<String>,
    pub active_count: u32,
    pub blocked_count: u32,
    pub completed_count: u32,
    pub standing_count: u32,
    pub goals: Vec<PaperclipGoalItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipGoalsView {
    pub generated_at: String,
    pub summary: PaperclipGoalSummaryView,
    pub agents: Vec<PaperclipGoalsAgentView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRoutineSummaryView {
    pub total_agents: u32,
    pub automated_agents: u32,
    pub total_custom_routines: u32,
    pub total_event_triggers: u32,
    pub total_commands: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRoutineItemView {
    pub key: String,
    pub kind: String,
    pub label: String,
    pub detail: Option<String>,
    pub trigger: Option<String>,
    pub action: Option<String>,
    pub filter: Option<String>,
    pub interval: Option<String>,
    pub scope: Option<String>,
    pub renderer: Option<String>,
    pub output_path: Option<String>,
    #[serde(default)]
    pub platforms: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRoutinesAgentView {
    pub user: PaperclipUser,
    pub telemetry: Option<PaperclipTelemetryItem>,
    pub mission: Option<String>,
    pub current_krebs: Option<String>,
    pub loop_interval: Option<String>,
    #[serde(default)]
    pub loop_reads: Vec<String>,
    #[serde(default)]
    pub loop_writes: Vec<String>,
    pub escalation_target: Option<String>,
    pub custom_routine_count: u32,
    pub trigger_count: u32,
    pub command_count: u32,
    pub items: Vec<PaperclipRoutineItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipRoutinesView {
    pub generated_at: String,
    pub summary: PaperclipRoutineSummaryView,
    pub agents: Vec<PaperclipRoutinesAgentView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipAgentFileView {
    pub user_id: String,
    pub file_name: String,
    pub file_path: String,
    pub content: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipFileSaveResult {
    pub user_id: String,
    pub file_name: String,
    pub file_path: String,
    pub saved_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipHermesDeliveryEntryView {
    pub occurred_at: Option<String>,
    pub channel: String,
    pub summary: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaperclipHermesSyncView {
    pub generated_at: String,
    pub status_line: Option<String>,
    pub pending_requests: Vec<String>,
    pub outbound_queue: Vec<String>,
    pub loop_errors: Vec<String>,
    pub recent_deliveries: Vec<PaperclipHermesDeliveryEntryView>,
    pub recent_poller_events: Vec<String>,
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

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestRoot {
    #[serde(default)]
    skills: PaperclipManifestSkills,
    #[serde(default)]
    triggers: Vec<PaperclipManifestTrigger>,
    #[serde(rename = "loop", default)]
    loop_config: PaperclipManifestLoop,
    #[serde(default)]
    platforms: HashMap<String, PaperclipManifestPlatform>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestSkills {
    #[serde(default)]
    custom: Vec<PaperclipManifestRoutine>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestRoutine {
    id: String,
    trigger: Option<String>,
    action: Option<String>,
    scope: Option<String>,
    renderer: Option<String>,
    output_path: Option<String>,
    #[serde(default)]
    platforms: Vec<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestTrigger {
    event: String,
    interval: Option<String>,
    action: Option<String>,
    filter: Option<HashMap<String, String>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestLoop {
    interval: Option<String>,
    #[serde(default)]
    reads: Vec<String>,
    #[serde(default)]
    writes: Vec<String>,
    escalation: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestPlatform {
    #[serde(default)]
    commands: Vec<PaperclipManifestCommand>,
}

#[derive(Debug, Clone, Deserialize, Default)]
struct PaperclipManifestCommand {
    command: String,
    description: Option<String>,
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

fn repo_paperclip_working_directory() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../thoughtseed-paperclip")
}

fn resolve_default_paperclip_working_directory() -> Option<PathBuf> {
    for key in ["THOUGHTSEED_PAPERCLIP_ROOT", "PAPERCLIP_ROOT"] {
        if let Ok(value) = std::env::var(key) {
            let trimmed = value.trim();
            if !trimmed.is_empty() {
                let path = PathBuf::from(trimmed);
                if path.is_dir() {
                    return Some(path);
                }
            }
        }
    }

    let repo_path = repo_paperclip_working_directory();
    if repo_path.is_dir() {
        return Some(repo_path);
    }

    None
}

async fn resolve_paperclip_working_directory(pool: &SqlitePool) -> Result<Option<PathBuf>, String> {
    let configured = setting(pool, "paperclip_working_dir").await?;
    if let Some(path) = configured {
        let candidate = PathBuf::from(path.trim());
        if candidate.is_dir() {
            return Ok(Some(candidate));
        }
        return Err(format!(
            "Configured Paperclip working directory does not exist: {}",
            candidate.display()
        ));
    }

    Ok(resolve_default_paperclip_working_directory())
}

fn normalize_inline_text(value: &str) -> Option<String> {
    let collapsed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    let trimmed = collapsed.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn extract_markdown_lead_paragraph(content: &str) -> Option<String> {
    let mut lines: Vec<String> = Vec::new();

    for raw_line in content.lines() {
        let trimmed = raw_line.trim();
        if trimmed.is_empty() {
            if !lines.is_empty() {
                break;
            }
            continue;
        }
        if trimmed.starts_with('#') {
            continue;
        }
        if trimmed.starts_with("- ") || trimmed.starts_with("* ") || trimmed.starts_with("|") {
            if !lines.is_empty() {
                break;
            }
            continue;
        }

        let normalized = trimmed.trim_start_matches('>').trim();
        if let Some(text) = normalize_inline_text(normalized) {
            lines.push(text);
        }
    }

    normalize_inline_text(&lines.join(" "))
}

fn extract_markdown_section_entries(content: &str, headings: &[&str]) -> Vec<String> {
    let headings = headings
        .iter()
        .map(|heading| heading.trim().to_ascii_lowercase())
        .collect::<HashSet<_>>();
    let mut in_section = false;
    let mut items = Vec::new();
    let mut current_item: Option<String> = None;

    for raw_line in content.lines() {
        let trimmed = raw_line.trim();
        if let Some(current) = trimmed.strip_prefix("## ") {
            if let Some(item) = current_item.take() {
                if let Some(item) = normalize_inline_text(&item) {
                    items.push(item);
                }
            }

            in_section = headings.contains(&current.trim().to_ascii_lowercase());
            continue;
        }

        if !in_section {
            continue;
        }

        if trimmed.eq_ignore_ascii_case("_none._") || trimmed.eq_ignore_ascii_case("_empty._") {
            continue;
        }

        if let Some(item) = trimmed
            .strip_prefix("- ")
            .or_else(|| trimmed.strip_prefix("* "))
        {
            if let Some(existing) = current_item.take() {
                if let Some(existing) = normalize_inline_text(&existing) {
                    items.push(existing);
                }
            }
            current_item = normalize_inline_text(item);
            continue;
        }

        if trimmed.is_empty() {
            continue;
        }

        if let Some(existing) = current_item.as_mut() {
            if let Some(fragment) = normalize_inline_text(trimmed) {
                existing.push(' ');
                existing.push_str(&fragment);
            }
        }
    }

    if let Some(item) = current_item.take() {
        if let Some(item) = normalize_inline_text(&item) {
            items.push(item);
        }
    }

    items
}

fn extract_markdown_section_bullets(content: &str, heading: &str) -> Vec<String> {
    extract_markdown_section_entries(content, &[heading])
}

fn extract_markdown_section_titles(content: &str) -> Vec<String> {
    content
        .lines()
        .filter_map(|line| line.trim().strip_prefix("## "))
        .filter_map(normalize_inline_text)
        .collect()
}

fn summarize_trigger_filter(filter: Option<HashMap<String, String>>) -> Option<String> {
    let mut pairs = filter?
        .into_iter()
        .filter_map(|(key, value)| normalize_inline_text(&value).map(|value| (key, value)))
        .collect::<Vec<_>>();
    pairs.sort_by(|left, right| left.0.cmp(&right.0));
    let summary = pairs
        .into_iter()
        .map(|(key, value)| format!("{key}: {value}"))
        .collect::<Vec<_>>()
        .join(" · ");
    normalize_inline_text(&summary)
}

fn build_operating_profile(
    manifest_content: Option<&str>,
    identity_content: Option<&str>,
    context_content: Option<&str>,
) -> Result<PaperclipAgentOperatingProfile, String> {
    if manifest_content.is_none() && identity_content.is_none() && context_content.is_none() {
        return Err("Paperclip agent profile files are unavailable.".to_string());
    }

    let manifest = if let Some(content) = manifest_content {
        serde_yaml::from_str::<PaperclipManifestRoot>(content)
            .map_err(|error| format!("parse MANIFEST.yaml: {error}"))?
    } else {
        PaperclipManifestRoot::default()
    };

    let mission = identity_content.and_then(extract_markdown_lead_paragraph);
    let responsibilities = identity_content
        .map(|content| extract_markdown_section_bullets(content, "What I do"))
        .unwrap_or_default();
    let boundaries = identity_content
        .map(|content| extract_markdown_section_bullets(content, "What I do NOT do"))
        .unwrap_or_default();
    let context_sections = context_content
        .map(extract_markdown_section_titles)
        .unwrap_or_default();

    let routines = manifest
        .skills
        .custom
        .into_iter()
        .map(|routine| PaperclipAgentProfileRoutine {
            id: routine.id,
            trigger: routine
                .trigger
                .and_then(|value| normalize_inline_text(&value)),
            action: routine
                .action
                .and_then(|value| normalize_inline_text(&value)),
            scope: routine
                .scope
                .and_then(|value| normalize_inline_text(&value)),
            renderer: routine
                .renderer
                .and_then(|value| normalize_inline_text(&value)),
            output_path: routine
                .output_path
                .and_then(|value| normalize_inline_text(&value)),
            platforms: routine
                .platforms
                .into_iter()
                .filter_map(|value| normalize_inline_text(&value))
                .collect(),
        })
        .collect::<Vec<_>>();

    let triggers = manifest
        .triggers
        .into_iter()
        .map(|trigger| PaperclipAgentProfileTrigger {
            event: trigger.event,
            interval: trigger
                .interval
                .and_then(|value| normalize_inline_text(&value)),
            action: trigger
                .action
                .and_then(|value| normalize_inline_text(&value)),
            filter: summarize_trigger_filter(trigger.filter),
        })
        .collect::<Vec<_>>();

    let commands = manifest
        .platforms
        .into_iter()
        .flat_map(|(platform, entry)| {
            entry
                .commands
                .into_iter()
                .map(move |command| PaperclipAgentProfileCommand {
                    platform: platform.clone(),
                    command: command.command,
                    description: command
                        .description
                        .and_then(|value| normalize_inline_text(&value)),
                })
        })
        .collect::<Vec<_>>();

    Ok(PaperclipAgentOperatingProfile {
        mission,
        responsibilities,
        boundaries,
        context_sections,
        routines,
        triggers,
        loop_interval: manifest
            .loop_config
            .interval
            .and_then(|value| normalize_inline_text(&value)),
        loop_reads: manifest
            .loop_config
            .reads
            .into_iter()
            .filter_map(|value| normalize_inline_text(&value))
            .collect(),
        loop_writes: manifest
            .loop_config
            .writes
            .into_iter()
            .filter_map(|value| normalize_inline_text(&value))
            .collect(),
        escalation_target: manifest
            .loop_config
            .escalation
            .and_then(|value| normalize_inline_text(&value)),
        commands,
    })
}

#[derive(Debug, Clone)]
struct PaperclipTaskFileItem {
    title: String,
    status: String,
    priority: Option<String>,
    tags: Vec<String>,
    detail: Option<String>,
    task_id: Option<String>,
    section: String,
}

#[derive(Debug, Clone, Default)]
struct PaperclipTaskFileView {
    work_items: Vec<PaperclipTaskFileItem>,
    standing_responsibilities: Vec<String>,
}

fn status_from_task_section(section: &str) -> &'static str {
    let normalized = section.trim().to_ascii_lowercase();
    if normalized.contains("completed") {
        "completed"
    } else if normalized.contains("in progress") {
        "in_progress"
    } else if normalized.contains("standing") {
        "standing"
    } else {
        "open"
    }
}

fn parse_local_task_item(section: &str, entry: &str) -> PaperclipTaskFileItem {
    let mut raw = entry.trim().to_string();
    let mut status = status_from_task_section(section).to_string();
    let mut priority = None;
    let mut tags = Vec::new();
    let mut detail = None;
    let mut task_id = None;

    if let Some(rest) = raw.strip_prefix("[x]") {
        status = "completed".to_string();
        raw = rest.trim().to_string();
    } else if let Some(rest) = raw.strip_prefix("[ ]") {
        raw = rest.trim().to_string();
    }

    if raw.starts_with('`') {
        if let Some(end) = raw[1..].find('`') {
            task_id = normalize_inline_text(&raw[1..end + 1]);
            raw = raw[end + 2..]
                .trim()
                .trim_start_matches('|')
                .trim()
                .to_string();
        }
    }

    if raw.contains('|') {
        let parts = raw
            .split('|')
            .map(str::trim)
            .filter(|part| !part.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();

        if let Some(last) = parts.last() {
            raw = last.clone();
        }

        for meta in parts.iter().take(parts.len().saturating_sub(1)) {
            if let Some(value) = meta.as_str().strip_prefix("status:") {
                status = normalize_task_status(value);
            } else if let Some(value) = meta.as_str().strip_prefix("priority:") {
                priority = normalize_inline_text(value);
            } else if let Some(value) = meta.as_str().strip_prefix("tags:[") {
                let value = value.trim_end_matches(']');
                tags.extend(
                    value
                        .split(',')
                        .filter_map(normalize_inline_text)
                        .collect::<Vec<_>>(),
                );
            }
        }
    } else {
        while raw.starts_with('[') {
            let Some(end) = raw.find(']') else {
                break;
            };
            let token = raw[1..end].trim();
            if token.eq_ignore_ascii_case("critical")
                || token.eq_ignore_ascii_case("high")
                || token.eq_ignore_ascii_case("medium")
                || token.eq_ignore_ascii_case("low")
            {
                priority = normalize_inline_text(token);
            } else if let Some(tag) = normalize_inline_text(token) {
                tags.push(tag);
            }
            raw = raw[end + 1..].trim().to_string();
        }
    }

    if let Some((title, result)) = raw.clone().split_once("— Result:") {
        raw = title.trim().to_string();
        detail = normalize_inline_text(result);
    }

    PaperclipTaskFileItem {
        title: normalize_inline_text(&raw).unwrap_or_else(|| section.to_string()),
        status,
        priority,
        tags,
        detail,
        task_id,
        section: section.to_string(),
    }
}

fn parse_task_file(content: &str) -> PaperclipTaskFileView {
    let mut work_items = Vec::new();

    for section in ["Active Tasks", "Pending", "In progress", "Outbound Queue"] {
        work_items.extend(
            extract_markdown_section_entries(content, &[section])
                .into_iter()
                .map(|entry| parse_local_task_item(section, &entry)),
        );
    }

    for section in ["Completed Tasks", "Completed (last 7 days)"] {
        work_items.extend(
            extract_markdown_section_entries(content, &[section])
                .into_iter()
                .map(|entry| parse_local_task_item(section, &entry)),
        );
    }

    PaperclipTaskFileView {
        work_items,
        standing_responsibilities: extract_markdown_section_entries(
            content,
            &["Standing responsibilities (never complete)"],
        ),
    }
}

fn read_optional_text_file(path: &Path) -> Result<Option<String>, String> {
    if !path.is_file() {
        return Ok(None);
    }
    fs::read_to_string(path)
        .map(Some)
        .map_err(|error| format!("read {}: {error}", path.display()))
}

async fn load_agent_operating_profile(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Option<PaperclipAgentOperatingProfile>, String> {
    let Some(working_dir) = resolve_paperclip_working_directory(pool).await? else {
        return Ok(None);
    };

    let agent_dir = working_dir.join("agents").join(user_id);
    if !agent_dir.is_dir() {
        return Ok(None);
    }

    let manifest = read_optional_text_file(&agent_dir.join("MANIFEST.yaml"))?;
    let identity = read_optional_text_file(&agent_dir.join("IDENTITY.md"))?;
    let context = read_optional_text_file(&agent_dir.join("CONTEXT.md"))?;

    Ok(Some(build_operating_profile(
        manifest.as_deref(),
        identity.as_deref(),
        context.as_deref(),
    )?))
}

async fn load_agent_task_file(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<Option<PaperclipTaskFileView>, String> {
    let Some(working_dir) = resolve_paperclip_working_directory(pool).await? else {
        return Ok(None);
    };

    let agent_dir = working_dir.join("agents").join(user_id);
    if !agent_dir.is_dir() {
        return Ok(None);
    }

    let tasks = read_optional_text_file(&agent_dir.join("TASKS.md"))?;
    Ok(tasks.as_deref().map(parse_task_file))
}

async fn resolve_agent_file_path(
    pool: &SqlitePool,
    user_id: &str,
    file_name: &str,
) -> Result<PathBuf, String> {
    let Some(working_dir) = resolve_paperclip_working_directory(pool).await? else {
        return Err("Paperclip working directory is not configured.".to_string());
    };

    let trimmed_user = user_id.trim();
    if trimmed_user.is_empty() {
        return Err("Paperclip user id is required.".to_string());
    }

    let trimmed_file = file_name.trim();
    if trimmed_file.is_empty() {
        return Err("Paperclip file name is required.".to_string());
    }
    if trimmed_file.contains('/') || trimmed_file.contains('\\') {
        return Err("Nested Paperclip file paths are not allowed.".to_string());
    }

    let agent_dir = working_dir.join("agents").join(trimmed_user);
    if !agent_dir.is_dir() {
        return Err(format!(
            "Paperclip agent directory not found for {trimmed_user}."
        ));
    }

    Ok(agent_dir.join(trimmed_file))
}

fn read_required_text_file(path: &Path) -> Result<String, String> {
    fs::read_to_string(path).map_err(|error| format!("read {}: {error}", path.display()))
}

fn tail_lines(content: &str, limit: usize) -> Vec<String> {
    let mut lines = content
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect::<Vec<_>>();
    if lines.len() > limit {
        lines = lines.split_off(lines.len() - limit);
    }
    lines
}

fn parse_hermes_delivery_line(line: &str) -> PaperclipHermesDeliveryEntryView {
    let trimmed = line.trim();
    let occurred_at = trimmed
        .strip_prefix('[')
        .and_then(|value| value.split_once(']'))
        .map(|(value, _)| value.to_string());
    let remainder = trimmed
        .strip_prefix('[')
        .and_then(|value| value.split_once(']'))
        .map(|(_, value)| value.trim())
        .unwrap_or(trimmed);
    let channel = remainder
        .strip_prefix('[')
        .and_then(|value| value.split_once(']'))
        .map(|(value, _)| value.trim().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    let summary = remainder
        .strip_prefix('[')
        .and_then(|value| value.split_once(']'))
        .map(|(_, value)| value.trim())
        .filter(|value| !value.is_empty())
        .unwrap_or(trimmed)
        .to_string();
    PaperclipHermesDeliveryEntryView {
        occurred_at,
        channel,
        summary,
    }
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
    let runtime_status = fetch_runtime_status(pool).await?;
    let users = fetch_users(pool).await?;

    Ok(PaperclipApiProbeResult {
        ready: true,
        base_url: config.base_url.to_string(),
        message: "Paperclip runtime API and TeamForge runtime routes are reachable.".to_string(),
        user_count: users.len() as u32,
        telemetry_count: runtime_status.agents.len() as u32,
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
    let operating_profile = load_agent_operating_profile(pool, user_id)
        .await
        .ok()
        .flatten();
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
        operating_profile,
    })
}

pub async fn fetch_goals(pool: &SqlitePool) -> Result<PaperclipGoalsView, String> {
    let users = fetch_users(pool).await?;
    if users.is_empty() {
        return Err("Paperclip returned no agents.".to_string());
    }

    let telemetry_by_id: HashMap<String, PaperclipTelemetryItem> = fetch_telemetry(pool)
        .await?
        .into_iter()
        .map(|item| (item.user_id.clone(), item))
        .collect();

    let mut agents = Vec::with_capacity(users.len());
    let mut total_goals = 0_u32;
    let mut active_goals = 0_u32;
    let mut blocked_goals = 0_u32;
    let mut completed_goals = 0_u32;
    let mut standing_goals = 0_u32;
    let mut agents_with_work = 0_u32;

    for user in users {
        let telemetry = telemetry_by_id.get(&user.user_id).cloned();
        let personal = fetch_personal_context(pool, &user.user_id)
            .await
            .unwrap_or_else(|_| empty_personal_context(&user));
        let operating_profile = load_agent_operating_profile(pool, &user.user_id)
            .await
            .ok()
            .flatten();
        let task_file = load_agent_task_file(pool, &user.user_id)
            .await
            .ok()
            .flatten()
            .unwrap_or_default();

        let goals = build_goal_items(&user, &personal, operating_profile.as_ref(), &task_file);
        let active_count = goals
            .iter()
            .filter(|goal| goal_status_is_active(&goal.status))
            .count() as u32;
        let blocked_count = goals
            .iter()
            .filter(|goal| goal_status_is_blocked(&goal.status))
            .count() as u32;
        let completed_count = goals
            .iter()
            .filter(|goal| goal_status_is_completed(&goal.status))
            .count() as u32;
        let standing_count = goals
            .iter()
            .filter(|goal| goal_status_is_standing(&goal.status))
            .count() as u32;

        total_goals += goals.len() as u32;
        active_goals += active_count;
        blocked_goals += blocked_count;
        completed_goals += completed_count;
        standing_goals += standing_count;
        if !goals.is_empty() {
            agents_with_work += 1;
        }

        agents.push(PaperclipGoalsAgentView {
            mission: operating_profile
                .as_ref()
                .and_then(|profile| profile.mission.clone()),
            current_krebs: personal.current_krebs.clone(),
            latest_heartbeat_at: personal.latest_heartbeat_at.clone(),
            user,
            telemetry,
            active_count,
            blocked_count,
            completed_count,
            standing_count,
            goals,
        });
    }

    agents.sort_by(|left, right| {
        right
            .active_count
            .cmp(&left.active_count)
            .then(right.blocked_count.cmp(&left.blocked_count))
            .then(left.user.user_name.cmp(&right.user.user_name))
    });

    Ok(PaperclipGoalsView {
        generated_at: Utc::now().to_rfc3339(),
        summary: PaperclipGoalSummaryView {
            total_goals,
            active_goals,
            blocked_goals,
            completed_goals,
            standing_goals,
            agents_with_work,
            total_agents: agents.len() as u32,
        },
        agents,
    })
}

pub async fn fetch_routines(pool: &SqlitePool) -> Result<PaperclipRoutinesView, String> {
    let users = fetch_users(pool).await?;
    if users.is_empty() {
        return Err("Paperclip returned no agents.".to_string());
    }

    let telemetry_by_id: HashMap<String, PaperclipTelemetryItem> = fetch_telemetry(pool)
        .await?
        .into_iter()
        .map(|item| (item.user_id.clone(), item))
        .collect();

    let mut agents = Vec::with_capacity(users.len());
    let mut automated_agents = 0_u32;
    let mut total_custom_routines = 0_u32;
    let mut total_event_triggers = 0_u32;
    let mut total_commands = 0_u32;

    for user in users {
        let telemetry = telemetry_by_id.get(&user.user_id).cloned();
        let personal = fetch_personal_context(pool, &user.user_id)
            .await
            .unwrap_or_else(|_| empty_personal_context(&user));
        let operating_profile = load_agent_operating_profile(pool, &user.user_id)
            .await
            .ok()
            .flatten();
        let items = build_routine_items(&user.user_id, operating_profile.as_ref());
        let custom_routine_count = operating_profile
            .as_ref()
            .map(|profile| profile.routines.len() as u32)
            .unwrap_or(0);
        let trigger_count = operating_profile
            .as_ref()
            .map(|profile| profile.triggers.len() as u32)
            .unwrap_or(0);
        let command_count = operating_profile
            .as_ref()
            .map(|profile| profile.commands.len() as u32)
            .unwrap_or(0);

        total_custom_routines += custom_routine_count;
        total_event_triggers += trigger_count;
        total_commands += command_count;
        if !items.is_empty() {
            automated_agents += 1;
        }

        agents.push(PaperclipRoutinesAgentView {
            mission: operating_profile
                .as_ref()
                .and_then(|profile| profile.mission.clone()),
            current_krebs: personal.current_krebs.clone(),
            loop_interval: operating_profile
                .as_ref()
                .and_then(|profile| profile.loop_interval.clone()),
            loop_reads: operating_profile
                .as_ref()
                .map(|profile| profile.loop_reads.clone())
                .unwrap_or_default(),
            loop_writes: operating_profile
                .as_ref()
                .map(|profile| profile.loop_writes.clone())
                .unwrap_or_default(),
            escalation_target: operating_profile
                .as_ref()
                .and_then(|profile| profile.escalation_target.clone()),
            user,
            telemetry,
            custom_routine_count,
            trigger_count,
            command_count,
            items,
        });
    }

    agents.sort_by(|left, right| {
        (right.custom_routine_count + right.trigger_count + right.command_count)
            .cmp(&(left.custom_routine_count + left.trigger_count + left.command_count))
            .then(left.user.user_name.cmp(&right.user.user_name))
    });

    Ok(PaperclipRoutinesView {
        generated_at: Utc::now().to_rfc3339(),
        summary: PaperclipRoutineSummaryView {
            total_agents: agents.len() as u32,
            automated_agents,
            total_custom_routines,
            total_event_triggers,
            total_commands,
        },
        agents,
    })
}

pub async fn fetch_agent_tasks_file(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<PaperclipAgentFileView, String> {
    let path = resolve_agent_file_path(pool, user_id, "TASKS.md").await?;
    let content = read_required_text_file(&path)?;
    Ok(PaperclipAgentFileView {
        user_id: user_id.trim().to_string(),
        file_name: "TASKS.md".to_string(),
        file_path: path.display().to_string(),
        content,
        updated_at: Utc::now().to_rfc3339(),
    })
}

pub async fn save_agent_tasks_file(
    pool: &SqlitePool,
    user_id: &str,
    content: &str,
) -> Result<PaperclipFileSaveResult, String> {
    let path = resolve_agent_file_path(pool, user_id, "TASKS.md").await?;
    fs::write(&path, content).map_err(|error| format!("write {}: {error}", path.display()))?;
    Ok(PaperclipFileSaveResult {
        user_id: user_id.trim().to_string(),
        file_name: "TASKS.md".to_string(),
        file_path: path.display().to_string(),
        saved_at: Utc::now().to_rfc3339(),
    })
}

pub async fn fetch_agent_manifest_file(
    pool: &SqlitePool,
    user_id: &str,
) -> Result<PaperclipAgentFileView, String> {
    let path = resolve_agent_file_path(pool, user_id, "MANIFEST.yaml").await?;
    let content = read_required_text_file(&path)?;
    Ok(PaperclipAgentFileView {
        user_id: user_id.trim().to_string(),
        file_name: "MANIFEST.yaml".to_string(),
        file_path: path.display().to_string(),
        content,
        updated_at: Utc::now().to_rfc3339(),
    })
}

pub async fn save_agent_manifest_file(
    pool: &SqlitePool,
    user_id: &str,
    content: &str,
) -> Result<PaperclipFileSaveResult, String> {
    serde_yaml::from_str::<PaperclipManifestRoot>(content)
        .map_err(|error| format!("parse MANIFEST.yaml before save: {error}"))?;
    let path = resolve_agent_file_path(pool, user_id, "MANIFEST.yaml").await?;
    fs::write(&path, content).map_err(|error| format!("write {}: {error}", path.display()))?;
    Ok(PaperclipFileSaveResult {
        user_id: user_id.trim().to_string(),
        file_name: "MANIFEST.yaml".to_string(),
        file_path: path.display().to_string(),
        saved_at: Utc::now().to_rfc3339(),
    })
}

pub async fn fetch_hermes_sync(pool: &SqlitePool) -> Result<PaperclipHermesSyncView, String> {
    let Some(working_dir) = resolve_paperclip_working_directory(pool).await? else {
        return Err("Paperclip working directory is not configured.".to_string());
    };

    let inbox_content =
        read_optional_text_file(&working_dir.join("agents/hermes/INBOX.md"))?.unwrap_or_default();
    let tasks_content =
        read_optional_text_file(&working_dir.join("agents/hermes/TASKS.md"))?.unwrap_or_default();
    let context_content =
        read_optional_text_file(&working_dir.join("agents/hermes/CONTEXT.md"))?.unwrap_or_default();
    let deliveries_content =
        read_optional_text_file(&working_dir.join("logs/hermes-deliveries.log"))?
            .unwrap_or_default();
    let poller_content =
        read_optional_text_file(&working_dir.join(".state/tg-poller.log"))?.unwrap_or_default();

    let status_line = context_content
        .lines()
        .find(|line| line.trim_start().starts_with("- **Status:**"))
        .and_then(normalize_inline_text);
    let pending_requests = extract_markdown_section_entries(&inbox_content, &["Pending"]);
    let outbound_queue = extract_markdown_section_entries(&tasks_content, &["Outbound Queue"]);
    let loop_errors = context_content
        .lines()
        .map(str::trim)
        .filter(|line| line.contains("Loop cycle error"))
        .map(str::to_string)
        .collect::<Vec<_>>();
    let recent_deliveries = tail_lines(&deliveries_content, 12)
        .into_iter()
        .map(|line| parse_hermes_delivery_line(&line))
        .collect::<Vec<_>>();
    let recent_poller_events = tail_lines(&poller_content, 20);

    Ok(PaperclipHermesSyncView {
        generated_at: Utc::now().to_rfc3339(),
        status_line,
        pending_requests,
        outbound_queue,
        loop_errors,
        recent_deliveries,
        recent_poller_events,
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

fn goal_status_is_completed(status: &str) -> bool {
    matches!(
        normalize_task_status(status).as_str(),
        "completed" | "done" | "closed"
    )
}

fn goal_status_is_blocked(status: &str) -> bool {
    normalize_task_status(status).as_str() == "blocked"
}

fn goal_status_is_standing(status: &str) -> bool {
    normalize_task_status(status).as_str() == "standing"
}

fn goal_status_is_active(status: &str) -> bool {
    let normalized = normalize_task_status(status);
    !goal_status_is_completed(&normalized)
        && !goal_status_is_blocked(&normalized)
        && !goal_status_is_standing(&normalized)
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

fn goal_sort(left: &PaperclipGoalItemView, right: &PaperclipGoalItemView) -> Ordering {
    goal_status_rank(&left.status)
        .cmp(&goal_status_rank(&right.status))
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

fn goal_status_rank(status: &str) -> u8 {
    let normalized = normalize_task_status(status);
    match normalized.as_str() {
        "blocked" => 0,
        "in_progress" | "active" | "working" => 1,
        "open" | "pending" | "queued" => 2,
        "standing" => 3,
        "completed" | "done" | "closed" => 4,
        _ => 5,
    }
}

fn build_goal_items(
    user: &PaperclipUser,
    personal: &PaperclipPersonalContext,
    operating_profile: Option<&PaperclipAgentOperatingProfile>,
    task_file: &PaperclipTaskFileView,
) -> Vec<PaperclipGoalItemView> {
    let mission = operating_profile.and_then(|profile| profile.mission.clone());
    let mut items = Vec::new();
    let mut seen_ids = HashSet::new();
    let mut seen_titles = HashSet::new();

    for task in &personal.tasks {
        if let Some(task_id) = normalize_inline_text(&task.id) {
            seen_ids.insert(task_id);
        }
        if let Some(title) = normalize_inline_text(&task.title) {
            seen_titles.insert(title.to_ascii_lowercase());
        }

        items.push(PaperclipGoalItemView {
            key: format!("{}:runtime:{}", user.user_id, task.id),
            title: task.title.clone(),
            status: normalize_task_status(&task.status),
            priority: task.priority.clone(),
            tags: task.tags.clone(),
            detail: None,
            source_kind: "runtime_task".to_string(),
            source_label: "LIVE QUEUE".to_string(),
            section: queue_section_key(task).replace('-', " "),
            task_id: Some(task.id.clone()),
            source_ref: task.source_ref.clone(),
            project_code: task.project_code.clone(),
            project_id: task.project_id.clone(),
            client_id: task.client_id.clone(),
            updated_at: task.updated_at.clone(),
            user_id: user.user_id.clone(),
            user_name: user.user_name.clone(),
            department: user.department.clone(),
            role: user.role.clone(),
            current_krebs: personal.current_krebs.clone(),
            mission: mission.clone(),
            escalation_tagged: task_is_escalation(task),
        });
    }

    for (index, task) in task_file.work_items.iter().enumerate() {
        let duplicate = task
            .task_id
            .as_ref()
            .map(|task_id| seen_ids.contains(task_id))
            .unwrap_or(false)
            || seen_titles.contains(&task.title.to_ascii_lowercase());
        if duplicate {
            continue;
        }

        items.push(PaperclipGoalItemView {
            key: format!("{}:local:{index}", user.user_id),
            title: task.title.clone(),
            status: normalize_task_status(&task.status),
            priority: task.priority.clone(),
            tags: task.tags.clone(),
            detail: task.detail.clone(),
            source_kind: "local_task_file".to_string(),
            source_label: "TASKS FILE".to_string(),
            section: task.section.clone(),
            task_id: task.task_id.clone(),
            source_ref: None,
            project_code: None,
            project_id: None,
            client_id: None,
            updated_at: None,
            user_id: user.user_id.clone(),
            user_name: user.user_name.clone(),
            department: user.department.clone(),
            role: user.role.clone(),
            current_krebs: personal.current_krebs.clone(),
            mission: mission.clone(),
            escalation_tagged: task
                .tags
                .iter()
                .any(|tag| tag.eq_ignore_ascii_case("escalation")),
        });
    }

    for (index, responsibility) in task_file.standing_responsibilities.iter().enumerate() {
        items.push(PaperclipGoalItemView {
            key: format!("{}:standing:{index}", user.user_id),
            title: responsibility.clone(),
            status: "standing".to_string(),
            priority: None,
            tags: Vec::new(),
            detail: None,
            source_kind: "standing_responsibility".to_string(),
            source_label: "STANDING".to_string(),
            section: "Standing responsibilities".to_string(),
            task_id: None,
            source_ref: None,
            project_code: None,
            project_id: None,
            client_id: None,
            updated_at: personal.latest_heartbeat_at.clone(),
            user_id: user.user_id.clone(),
            user_name: user.user_name.clone(),
            department: user.department.clone(),
            role: user.role.clone(),
            current_krebs: personal.current_krebs.clone(),
            mission: mission.clone(),
            escalation_tagged: false,
        });
    }

    items.sort_by(goal_sort);
    items
}

fn build_routine_items(
    user_id: &str,
    operating_profile: Option<&PaperclipAgentOperatingProfile>,
) -> Vec<PaperclipRoutineItemView> {
    let Some(profile) = operating_profile else {
        return Vec::new();
    };

    let mut items = Vec::new();

    for (index, routine) in profile.routines.iter().enumerate() {
        items.push(PaperclipRoutineItemView {
            key: format!("{user_id}:routine:{index}"),
            kind: "custom_routine".to_string(),
            label: routine.id.clone(),
            detail: routine.action.clone().or_else(|| routine.trigger.clone()),
            trigger: routine.trigger.clone(),
            action: routine.action.clone(),
            filter: None,
            interval: None,
            scope: routine.scope.clone(),
            renderer: routine.renderer.clone(),
            output_path: routine.output_path.clone(),
            platforms: routine.platforms.clone(),
        });
    }

    for (index, trigger) in profile.triggers.iter().enumerate() {
        items.push(PaperclipRoutineItemView {
            key: format!("{user_id}:trigger:{index}"),
            kind: "event_trigger".to_string(),
            label: trigger.event.clone(),
            detail: trigger.action.clone(),
            trigger: Some(trigger.event.clone()),
            action: trigger.action.clone(),
            filter: trigger.filter.clone(),
            interval: trigger.interval.clone(),
            scope: None,
            renderer: None,
            output_path: None,
            platforms: Vec::new(),
        });
    }

    for (index, command) in profile.commands.iter().enumerate() {
        items.push(PaperclipRoutineItemView {
            key: format!("{user_id}:command:{index}"),
            kind: "command".to_string(),
            label: format!("{} {}", command.platform, command.command),
            detail: command.description.clone(),
            trigger: None,
            action: None,
            filter: None,
            interval: None,
            scope: None,
            renderer: None,
            output_path: None,
            platforms: vec![command.platform.clone()],
        });
    }

    if profile.loop_interval.is_some()
        || !profile.loop_reads.is_empty()
        || !profile.loop_writes.is_empty()
        || profile.escalation_target.is_some()
    {
        items.push(PaperclipRoutineItemView {
            key: format!("{user_id}:loop"),
            kind: "loop_contract".to_string(),
            label: "Loop contract".to_string(),
            detail: Some(format!(
                "Reads {} · writes {}",
                if profile.loop_reads.is_empty() {
                    "none declared".to_string()
                } else {
                    profile.loop_reads.join(", ")
                },
                if profile.loop_writes.is_empty() {
                    "none declared".to_string()
                } else {
                    profile.loop_writes.join(", ")
                }
            )),
            trigger: None,
            action: profile.escalation_target.clone(),
            filter: None,
            interval: profile.loop_interval.clone(),
            scope: None,
            renderer: None,
            output_path: None,
            platforms: Vec::new(),
        });
    }

    items
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

    #[test]
    fn extracts_identity_sections_into_operating_profile() {
        let identity = r#"
# Engineer — Identity

> I am the Engineer. Knowledge → Utility. I turn validated knowledge into
> working code and reviewed changes.

## What I do

- Build the utility.
- Verify the deploy.

## What I do NOT do

- Make design decisions.
- Route work.
"#;
        let context = r#"
# Engineer — Context

## Active build queue

## PRs awaiting review

## Known blockers
"#;

        let profile = build_operating_profile(None, Some(identity), Some(context)).unwrap();
        assert_eq!(
            profile.mission.as_deref(),
            Some("I am the Engineer. Knowledge → Utility. I turn validated knowledge into working code and reviewed changes.")
        );
        assert_eq!(profile.responsibilities.len(), 2);
        assert_eq!(profile.boundaries.len(), 2);
        assert_eq!(
            profile.context_sections,
            vec![
                "Active build queue".to_string(),
                "PRs awaiting review".to_string(),
                "Known blockers".to_string()
            ]
        );
    }

    #[test]
    fn builds_operating_profile_from_manifest() {
        let manifest = r#"
skills:
  custom:
    - id: "deliver-to-client"
      trigger: "CEO approves external delivery"
      action: "Send document"
      platforms: [telegram, email]
triggers:
  - event: "heartbeat"
    interval: "5m"
    action: "check_outbound_queue"
    filter: { source: "teamforge" }
loop:
  interval: "5m"
  reads: [TASKS.md, CONTEXT.md]
  writes: [TASKS.md, HEARTBEAT.md]
  escalation: ceo
platforms:
  telegram:
    commands:
      - command: "/status"
        description: "System health check"
"#;

        let profile = build_operating_profile(Some(manifest), None, None).unwrap();
        assert_eq!(profile.routines.len(), 1);
        assert_eq!(profile.routines[0].id, "deliver-to-client");
        assert_eq!(
            profile.routines[0].platforms,
            vec!["telegram".to_string(), "email".to_string()]
        );
        assert_eq!(profile.triggers.len(), 1);
        assert_eq!(profile.triggers[0].event, "heartbeat");
        assert_eq!(
            profile.triggers[0].filter.as_deref(),
            Some("source: teamforge")
        );
        assert_eq!(profile.loop_interval.as_deref(), Some("5m"));
        assert_eq!(
            profile.loop_reads,
            vec!["TASKS.md".to_string(), "CONTEXT.md".to_string()]
        );
        assert_eq!(
            profile.loop_writes,
            vec!["TASKS.md".to_string(), "HEARTBEAT.md".to_string()]
        );
        assert_eq!(profile.escalation_target.as_deref(), Some("ceo"));
        assert_eq!(profile.commands.len(), 1);
        assert_eq!(profile.commands[0].platform, "telegram");
        assert_eq!(profile.commands[0].command, "/status");
    }

    #[test]
    fn extract_markdown_section_entries_join_wrapped_bullets() {
        let content = r#"
## Standing responsibilities (never complete)

- [ ] Build per spec from validated Scientist handoffs in
      `vault/handoffs/science-to-engineering/`
- [ ] Escalate architecture-class decisions to CEO before committing code
"#;

        let items = extract_markdown_section_entries(
            content,
            &["Standing responsibilities (never complete)"],
        );
        assert_eq!(items.len(), 2);
        assert!(items[0].contains("vault/handoffs/science-to-engineering/"));
        assert!(items[1].contains("Escalate architecture-class decisions"));
    }

    #[test]
    fn parse_task_file_extracts_work_items_and_standing_responsibilities() {
        let content = r#"
# Engineer — Tasks

## Pending

- [ ] `task-1` | priority:high | tags:[ops, build] | depends_on:none | retry_count:0 | Ship the build

## Completed (last 7 days)

- [x] `task-2` [medium] [handoff] Review the handoff — Result: Verified detail.

## Standing responsibilities (never complete)

- [ ] Keep per-project notes current in
      `vault/projects/{code}/`
"#;

        let parsed = parse_task_file(content);
        assert_eq!(parsed.work_items.len(), 2);
        assert_eq!(parsed.work_items[0].task_id.as_deref(), Some("task-1"));
        assert_eq!(parsed.work_items[0].priority.as_deref(), Some("high"));
        assert_eq!(
            parsed.work_items[0].tags,
            vec!["ops".to_string(), "build".to_string()]
        );
        assert_eq!(parsed.work_items[1].status, "completed");
        assert_eq!(
            parsed.work_items[1].detail.as_deref(),
            Some("Verified detail.")
        );
        assert_eq!(parsed.standing_responsibilities.len(), 1);
        assert!(parsed.standing_responsibilities[0].contains("vault/projects/{code}/"));
    }

    #[test]
    fn build_routine_items_includes_loop_contract() {
        let profile = PaperclipAgentOperatingProfile {
            mission: Some("Mission".to_string()),
            responsibilities: Vec::new(),
            boundaries: Vec::new(),
            context_sections: Vec::new(),
            routines: vec![PaperclipAgentProfileRoutine {
                id: "deliver-to-client".to_string(),
                trigger: Some("approval".to_string()),
                action: Some("send".to_string()),
                scope: None,
                renderer: None,
                output_path: None,
                platforms: vec!["telegram".to_string()],
            }],
            triggers: vec![PaperclipAgentProfileTrigger {
                event: "heartbeat".to_string(),
                interval: Some("5m".to_string()),
                action: Some("check".to_string()),
                filter: Some("source: teamforge".to_string()),
            }],
            loop_interval: Some("5m".to_string()),
            loop_reads: vec!["TASKS.md".to_string()],
            loop_writes: vec!["HEARTBEAT.md".to_string()],
            escalation_target: Some("ceo".to_string()),
            commands: vec![PaperclipAgentProfileCommand {
                platform: "telegram".to_string(),
                command: "/status".to_string(),
                description: Some("System health".to_string()),
            }],
        };

        let items = build_routine_items("hermes", Some(&profile));
        assert_eq!(items.len(), 4);
        assert!(items.iter().any(|item| item.kind == "loop_contract"));
    }

    #[test]
    fn parse_hermes_delivery_line_extracts_timestamp_channel_and_summary() {
        let entry = parse_hermes_delivery_line(
            "[2026-05-06T02:45:00Z] [telegram] Routed founder request to ceo queue",
        );

        assert_eq!(entry.occurred_at.as_deref(), Some("2026-05-06T02:45:00Z"));
        assert_eq!(entry.channel, "telegram");
        assert_eq!(entry.summary, "Routed founder request to ceo queue");
    }

    #[test]
    fn tail_lines_keeps_latest_non_empty_lines() {
        let lines = tail_lines("first\n\nsecond\nthird\nfourth\n", 2);

        assert_eq!(lines, vec!["third".to_string(), "fourth".to_string()]);
    }
}
