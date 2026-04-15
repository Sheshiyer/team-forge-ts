use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use chrono::{Datelike, Local, NaiveDate, Utc, Weekday};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::State;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::clockify::types::{ClockifyUser, ClockifyWorkspace};
use crate::db::models::*;
use crate::db::queries;
use crate::github::client::GithubClient;
use crate::github::sync::GithubSyncEngine;
use crate::github::types::github_project_id;
use crate::huly::client::HulyClient;
use crate::huly::sync::HulySyncEngine;
use crate::huly::types::{
    HulyAccountInfo, HulyBoard, HulyBoardCard, HulyCalendarEvent, HulyChannel, HulyDepartment,
    HulyDocument, HulyEmployee, HulyHoliday, HulyIssue, HulyLeaveRequest, HulyPerson, HulyProject,
    HulyWorkspaceNormalizationAction, HulyWorkspaceNormalizationReport,
    HulyWorkspaceNormalizationSnapshot,
};
use crate::slack::client::SlackClient;
use crate::slack::sync::SlackSyncEngine;
use crate::slack::types::{SlackConversation, SlackMessage, SlackUser};
use crate::sync::scheduler::SyncScheduler;
use crate::{DbPool, SchedulerState};

const DEFAULT_CLOCKIFY_IGNORED_EMAILS: &str = "thoughtseedlabs@gmail.com";
const SLACK_REQUIRED_SCOPES: &[&str] = &[
    "channels:read",
    "channels:history",
    "groups:read",
    "groups:history",
    "users:read",
    "users:read.email",
];

fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

fn parse_multi_value_setting(value: &str) -> Vec<String> {
    value
        .split(|ch: char| ch == ',' || ch == '\n' || ch == ';')
        .map(|item| item.trim())
        .filter(|item| !item.is_empty())
        .map(|item| item.to_string())
        .collect()
}

fn normalize_ignored_email_value(value: &str) -> String {
    parse_multi_value_setting(value)
        .into_iter()
        .map(|item| normalize_email(&item))
        .filter(|item| !item.is_empty())
        .collect::<Vec<_>>()
        .join(", ")
}

fn normalize_multi_id_value(value: &str) -> String {
    let mut seen = HashSet::new();
    parse_multi_value_setting(value)
        .into_iter()
        .filter(|item| seen.insert(item.clone()))
        .collect::<Vec<_>>()
        .join(", ")
}

fn slack_required_scopes_label() -> String {
    SLACK_REQUIRED_SCOPES.join(", ")
}

fn slack_error_detail(error: &str, key: &str) -> Option<String> {
    error
        .split(" | ")
        .find_map(|segment| {
            segment
                .strip_prefix(key)
                .map(|value| value.trim().to_string())
        })
        .filter(|value| !value.is_empty())
}

fn validate_slack_bot_token(value: &str) -> Result<String, String> {
    let token = value.trim();

    if token.is_empty() {
        return Err("Slack bot token is required".to_string());
    }

    if token.starts_with("xoxp-") {
        return Err(
            "Use the Slack Bot User OAuth Token (xoxb-...), not the User OAuth Token (xoxp-...)."
                .to_string(),
        );
    }

    if !token.starts_with("xoxb-") {
        return Err(
            "Paste the Slack Bot User OAuth Token (xoxb-...) from Slack > Settings > Install App."
                .to_string(),
        );
    }

    Ok(token.to_string())
}

fn humanize_slack_connection_error(error: String) -> String {
    if error.contains("missing_scope") {
        let needed = slack_error_detail(&error, "needed=");
        let mut message = if let Some(scope) = needed {
            format!(
                "Slack connected, but Slack reports the missing scope `{scope}`. Add that Bot Token Scope in Slack, click Reinstall to Workspace, then retry."
            )
        } else {
            "Slack connected, but one or more required scopes are missing or the app has not been reinstalled after scope changes. Reinstall the Slack app, then retry."
                .to_string()
        };

        message.push_str(&format!(
            " TeamForge expects: {}.",
            slack_required_scopes_label()
        ));

        return message;
    }

    if error.contains("invalid_auth")
        || error.contains("not_authed")
        || error.contains("account_inactive")
    {
        return "Slack authentication failed. Paste the Bot User OAuth Token (xoxb-...) from Slack > Settings > Install App."
            .to_string();
    }

    error
}

fn machine_error(code: &str, message: &str) -> String {
    json!({
        "code": code,
        "message": message,
    })
    .to_string()
}

fn parse_agent_feed_cursor(value: &str) -> Result<(String, String), String> {
    let trimmed = value.trim();
    let mut segments = trimmed.splitn(2, '|');
    let detected_at = segments.next().unwrap_or_default().trim();
    let sync_key = segments.next().unwrap_or_default().trim();
    if detected_at.is_empty() || sync_key.is_empty() {
        return Err("Cursor must be encoded as '<detected_at_rfc3339>|<sync_key>'".to_string());
    }
    Ok((detected_at.to_string(), sync_key.to_string()))
}

fn parse_sync_timestamp_utc(value: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&Utc))
        .ok()
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .map(|value| value.and_utc())
        })
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|value| value.and_utc())
        })
}

fn lag_seconds_from_sync_timestamp(
    last_sync_at: Option<&str>,
    now: chrono::DateTime<Utc>,
) -> Option<i64> {
    let timestamp = last_sync_at.and_then(parse_sync_timestamp_utc)?;
    Some((now - timestamp).num_seconds().max(0))
}

fn normalize_person_key(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn person_token_signature(value: &str) -> String {
    let mut tokens: Vec<String> = value
        .split(|ch: char| !ch.is_alphanumeric())
        .map(|token| token.trim().to_lowercase())
        .filter(|token| !token.is_empty())
        .collect();
    tokens.sort();
    tokens.join("|")
}

fn slack_ts_to_millis(ts: &str) -> Option<i64> {
    let seconds = ts.split('.').next()?.parse::<i64>().ok()?;
    Some(seconds.saturating_mul(1000))
}

fn slack_message_key(channel_id: &str, ts: &str) -> String {
    format!("slack:{}:{}", channel_id.trim(), ts.trim())
}

fn slack_content_preview(text: Option<&str>) -> Option<String> {
    text.map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.chars().take(280).collect())
}

async fn persist_slack_message_activity(
    pool: &sqlx::SqlitePool,
    channel_id: &str,
    slack_user_id: Option<&str>,
    employee_id: Option<&str>,
    message: &SlackMessage,
) -> Result<(), String> {
    let activity = SlackMessageActivity {
        id: None,
        message_key: slack_message_key(channel_id, &message.ts),
        slack_channel_id: channel_id.to_string(),
        slack_user_id: slack_user_id.map(|value| value.to_string()),
        employee_id: employee_id.map(|value| value.to_string()),
        message_ts: message.ts.clone(),
        message_ts_ms: slack_ts_to_millis(&message.ts),
        content_preview: slack_content_preview(message.text.as_deref()),
        detected_at: Utc::now().to_rfc3339(),
    };

    queries::upsert_slack_message_activity(pool, &activity)
        .await
        .map_err(|e| format!("persist slack message activity: {e}"))
}

async fn upsert_slack_identity_map_entry(
    pool: &sqlx::SqlitePool,
    slack_user_id: &str,
    employee_id: Option<&str>,
    confidence: f64,
    resolution_status: &str,
    match_method: &str,
) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();
    let entry = IdentityMapEntry {
        id: None,
        source: "slack".to_string(),
        external_id: slack_user_id.to_string(),
        employee_id: employee_id.map(|value| value.to_string()),
        confidence,
        resolution_status: resolution_status.to_string(),
        match_method: Some(match_method.to_string()),
        is_override: false,
        override_by: None,
        override_reason: None,
        override_at: None,
        first_seen_at: now.clone(),
        last_seen_at: now.clone(),
        created_at: now.clone(),
        updated_at: now,
    };
    queries::upsert_identity_map_entry(pool, &entry)
        .await
        .map_err(|e| format!("upsert slack identity map entry: {e}"))
}

async fn resolve_slack_user_employee_ids(
    pool: &sqlx::SqlitePool,
    employees: &[Employee],
    users: &[SlackUser],
) -> Result<HashMap<String, String>, String> {
    queries::seed_identity_map_from_employees(pool)
        .await
        .map_err(|e| format!("seed identity map from employees: {e}"))?;

    let active_employees: Vec<&Employee> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .collect();
    let employee_by_email: HashMap<String, String> = active_employees
        .iter()
        .map(|employee| (normalize_email(&employee.email), employee.id.clone()))
        .collect();
    let mut employee_name_aliases: HashMap<String, String> = HashMap::new();
    for employee in &active_employees {
        for alias in [
            normalize_person_key(&employee.name),
            person_token_signature(&employee.name),
        ] {
            if !alias.is_empty() {
                employee_name_aliases.insert(alias, employee.id.clone());
            }
        }
    }

    let mut mapping = HashMap::new();
    for user in users.iter().filter(|user| !user.deleted && !user.is_bot) {
        if let Some(employee_id) = queries::resolve_employee_id_by_identity(pool, "slack", &user.id)
            .await
            .map_err(|e| format!("resolve slack identity {}: {e}", user.id))?
        {
            mapping.insert(user.id.clone(), employee_id.clone());
            if let Err(error) = upsert_slack_identity_map_entry(
                pool,
                &user.id,
                Some(employee_id.as_str()),
                1.0,
                "linked",
                "identity_map.existing",
            )
            .await
            {
                eprintln!("[commands] warning: {error}");
            }
            continue;
        }

        let mut heuristic_match: Option<(String, &'static str, f64)> = None;
        if let Some(email) = user
            .profile
            .as_ref()
            .and_then(|profile| profile.email.as_ref())
            .map(|value| normalize_email(value))
        {
            if let Some(employee_id) = employee_by_email.get(&email) {
                heuristic_match = Some((employee_id.clone(), "heuristic.email", 0.98));
            }
        }
        if heuristic_match.is_none() {
            'outer: for display_name in slack_user_display_names(user) {
                for alias in [
                    normalize_person_key(&display_name),
                    person_token_signature(&display_name),
                ] {
                    if let Some(employee_id) = employee_name_aliases.get(&alias) {
                        heuristic_match = Some((employee_id.clone(), "heuristic.name_alias", 0.75));
                        break 'outer;
                    }
                }
            }
        }

        match heuristic_match {
            Some((employee_id, match_method, confidence)) => {
                mapping.insert(user.id.clone(), employee_id.clone());
                if let Err(error) = upsert_slack_identity_map_entry(
                    pool,
                    &user.id,
                    Some(employee_id.as_str()),
                    confidence,
                    "linked",
                    match_method,
                )
                .await
                {
                    eprintln!("[commands] warning: {error}");
                }
            }
            None => {
                if let Err(error) = upsert_slack_identity_map_entry(
                    pool,
                    &user.id,
                    None,
                    0.0,
                    "orphaned",
                    "commands.unmatched",
                )
                .await
                {
                    eprintln!("[commands] warning: {error}");
                }
            }
        }
    }

    Ok(mapping)
}

async fn load_ignored_clockify_emails(pool: &sqlx::SqlitePool) -> Result<HashSet<String>, String> {
    let raw = queries::get_setting(pool, "clockify_ignored_emails")
        .await
        .map_err(|e| format!("read ignored Clockify emails: {e}"))?;

    let source = raw
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CLOCKIFY_IGNORED_EMAILS.to_string());

    Ok(source
        .split(|ch: char| ch == ',' || ch == '\n' || ch == ';')
        .map(normalize_email)
        .filter(|item| !item.is_empty())
        .collect())
}

async fn load_ignored_clockify_employee_ids(
    pool: &sqlx::SqlitePool,
) -> Result<HashSet<String>, String> {
    let raw = queries::get_setting(pool, "clockify_ignored_employee_ids")
        .await
        .map_err(|e| format!("read ignored Clockify employees: {e}"))?;

    Ok(raw
        .map(|value| parse_multi_value_setting(&value))
        .unwrap_or_default()
        .into_iter()
        .filter(|item| !item.is_empty())
        .collect())
}

fn employee_is_ignored(
    employee: &Employee,
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> bool {
    ignored_employee_ids.contains(&employee.id)
        || ignored_emails.contains(&normalize_email(&employee.email))
}

async fn apply_clockify_ignore_rules(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let ignored = load_ignored_clockify_emails(pool).await?;
    let ignored_employee_ids = load_ignored_clockify_employee_ids(pool).await?;
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("load employees for ignore rules: {e}"))?;

    for employee in employees {
        let should_ignore = employee_is_ignored(&employee, &ignored, &ignored_employee_ids);
        queries::set_employee_active(pool, &employee.id, !should_ignore)
            .await
            .map_err(|e| format!("update employee ignore state: {e}"))?;

        if should_ignore {
            queries::delete_time_entries_for_employee(pool, &employee.id)
                .await
                .map_err(|e| format!("purge ignored time entries: {e}"))?;
            queries::delete_presence_for_employee(pool, &employee.id)
                .await
                .map_err(|e| format!("purge ignored presence: {e}"))?;
        }
    }

    Ok(())
}

#[derive(Default)]
struct ChatActivityAccum {
    count: u32,
    channels: HashSet<String>,
    last_at_ms: Option<i64>,
    sources: HashSet<String>,
}

fn add_chat_activity(
    per_user: &mut HashMap<String, ChatActivityAccum>,
    employee_name: &str,
    channel_key: String,
    timestamp_ms: Option<i64>,
    source: &str,
) {
    let entry = per_user.entry(employee_name.to_string()).or_default();
    entry.count += 1;
    entry.channels.insert(channel_key);
    entry.sources.insert(source.to_string());
    if let Some(ts) = timestamp_ms {
        entry.last_at_ms = Some(entry.last_at_ms.map_or(ts, |previous| previous.max(ts)));
    }
}

fn slack_user_display_names(user: &SlackUser) -> Vec<String> {
    let mut names = Vec::new();
    for candidate in [
        user.profile
            .as_ref()
            .and_then(|profile| profile.display_name.as_deref()),
        user.profile
            .as_ref()
            .and_then(|profile| profile.real_name.as_deref()),
        user.real_name.as_deref(),
        user.name.as_deref(),
    ] {
        if let Some(value) = candidate {
            let trimmed = value.trim();
            if !trimmed.is_empty() && !names.iter().any(|existing| existing == trimmed) {
                names.push(trimmed.to_string());
            }
        }
    }
    names
}

fn filter_slack_channels(
    channels: Vec<SlackConversation>,
    raw_filters: &str,
) -> Vec<SlackConversation> {
    let filters = parse_multi_value_setting(raw_filters);
    if filters.is_empty() {
        return channels;
    }

    let allowed: HashSet<String> = filters
        .into_iter()
        .map(|value| normalize_person_key(&value))
        .collect();

    channels
        .into_iter()
        .filter(|channel| {
            allowed.contains(&normalize_person_key(&channel.id))
                || channel
                    .name
                    .as_ref()
                    .map(|name| allowed.contains(&normalize_person_key(name)))
                    .unwrap_or(false)
        })
        .collect()
}

fn huly_channel_display_name(channel: &HulyChannel) -> Option<String> {
    [
        channel.title.as_deref(),
        channel.name.as_deref(),
        channel.topic.as_deref(),
        channel.description.as_deref(),
    ]
    .into_iter()
    .flatten()
    .map(str::trim)
    .find(|value| !value.is_empty())
    .map(|value| value.to_string())
}

fn is_standup_label(value: &str) -> bool {
    let compact = normalize_person_key(value);
    compact.contains("standup")
        || compact.contains("checkin")
        || compact.contains("dailysync")
        || compact.contains("dailystandup")
}

fn parse_cache_date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn leave_is_active_on(leave: &LeaveView, date: NaiveDate) -> bool {
    match (
        parse_cache_date(&leave.date_from),
        parse_cache_date(&leave.date_to),
    ) {
        (Some(start), Some(end)) => date >= start && date <= end,
        _ => false,
    }
}

fn leave_starts_on_or_after(leave: &LeaveView, date: NaiveDate) -> bool {
    parse_cache_date(&leave.date_from)
        .map(|start| start >= date)
        .unwrap_or(false)
}

fn next_month_start(today: NaiveDate) -> NaiveDate {
    if today.month() == 12 {
        NaiveDate::from_ymd_opt(today.year() + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(today.year(), today.month() + 1, 1).unwrap()
    }
}

async fn query_hours_for_range(
    pool: &sqlx::SqlitePool,
    employee_id: &str,
    start: &str,
    end: &str,
) -> Result<f64, String> {
    sqlx::query_as::<_, (f64,)>(
        "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
         FROM time_entries
         WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
    )
    .bind(employee_id)
    .bind(start)
    .bind(end)
    .fetch_one(pool)
    .await
    .map(|row| row.0)
    .map_err(|e| format!("time entry hours query failed: {e}"))
}

fn employee_matches_calendar_event(event: &HulyCalendarEvent, person_id: &str) -> bool {
    event.created_by.as_deref() == Some(person_id)
        || event
            .participants
            .as_ref()
            .map(|participants| {
                participants
                    .iter()
                    .any(|participant| participant == person_id)
            })
            .unwrap_or(false)
}

// ─── Clockify connection commands ───────────────────────────────

/// Validate a Clockify API key by fetching the authenticated user.
#[tauri::command]
pub async fn test_clockify_connection(api_key: String) -> Result<ClockifyUser, String> {
    let client = ClockifyClient::new(api_key);
    client.get_current_user().await
}

/// List workspaces accessible with the given API key.
#[tauri::command]
pub async fn get_clockify_workspaces(api_key: String) -> Result<Vec<ClockifyWorkspace>, String> {
    let client = ClockifyClient::new(api_key);
    client.get_workspaces().await
}

/// Run a full Clockify sync (users, projects, time entries).
#[tauri::command]
pub async fn trigger_sync(db: State<'_, DbPool>) -> Result<String, String> {
    let pool = &db.0;

    let api_key = queries::get_setting(pool, "clockify_api_key")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "Clockify API key not configured".to_string())?;

    let workspace_id = queries::get_setting(pool, "clockify_workspace_id")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "Clockify workspace ID not configured".to_string())?;

    let client = Arc::new(ClockifyClient::new(api_key));
    let engine = ClockifySyncEngine::new(client, pool.clone(), workspace_id);

    let report = engine.full_sync().await?;

    Ok(format!(
        "Sync complete: {} users, {} projects, {} time entries",
        report.users_synced, report.projects_synced, report.time_entries_synced
    ))
}

// ─── Settings commands ──────────────────────────────────────────

#[tauri::command]
pub async fn get_settings(db: State<'_, DbPool>) -> Result<HashMap<String, String>, String> {
    let pool = &db.0;
    let rows: Vec<Setting> = sqlx::query_as::<_, Setting>("SELECT key, value FROM settings")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let mut map = HashMap::new();
    for row in rows {
        map.insert(row.key, row.value);
    }
    Ok(map)
}

#[tauri::command]
pub async fn save_setting(db: State<'_, DbPool>, key: String, value: String) -> Result<(), String> {
    let pool = &db.0;
    let value_to_store = if key == "clockify_ignored_emails" {
        let normalized = normalize_ignored_email_value(&value);
        if normalized.is_empty() {
            DEFAULT_CLOCKIFY_IGNORED_EMAILS.to_string()
        } else {
            normalized
        }
    } else if key == "clockify_ignored_employee_ids" {
        normalize_multi_id_value(&value)
    } else {
        value
    };

    queries::set_setting(pool, &key, &value_to_store)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    if key == "clockify_ignored_emails" || key == "clockify_ignored_employee_ids" {
        apply_clockify_ignore_rules(pool).await?;
    }

    Ok(())
}

#[tauri::command]
pub async fn sync_github_plans(db: State<'_, DbPool>) -> Result<Vec<GithubSyncReport>, String> {
    let pool = &db.0;
    run_github_sync_from_settings(pool).await
}

async fn seed_configured_github_repos(pool: &sqlx::SqlitePool) -> Result<(), String> {
    let Some(repos) = queries::get_setting(pool, "github_repos")
        .await
        .map_err(|e| format!("read github repos: {e}"))?
    else {
        return Ok(());
    };
    let now = Utc::now().to_rfc3339();

    for repo in parse_multi_value_setting(&repos) {
        let config = GithubRepoConfig {
            repo: repo.clone(),
            display_name: repo,
            client_name: None,
            default_milestone_number: None,
            huly_project_id: None,
            clockify_project_id: None,
            enabled: true,
            created_at: now.clone(),
            updated_at: now.clone(),
        };
        queries::upsert_github_repo_config(pool, &config)
            .await
            .map_err(|e| format!("upsert github repo config: {e}"))?;
    }

    Ok(())
}

// ─── Dashboard commands ─────────────────────────────────────────

#[tauri::command]
pub async fn get_overview(db: State<'_, DbPool>) -> Result<OverviewData, String> {
    let pool = &db.0;
    let now = Local::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let next_month = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1)
    }
    .unwrap()
    .format("%Y-%m-%d")
    .to_string();

    // Total hours this month
    let hours_row: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(te.duration_seconds), 0) / 3600.0
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE e.is_active = 1 AND te.start_time >= ?1 AND te.start_time < ?2",
    )
    .bind(&month_start)
    .bind(&next_month)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let team_hours = hours_row.0;

    // Billable hours this month
    let billable_row: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(te.duration_seconds), 0) / 3600.0
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE e.is_active = 1 AND te.start_time >= ?1 AND te.start_time < ?2 AND te.is_billable = 1",
    )
    .bind(&month_start)
    .bind(&next_month)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let billable_hours = billable_row.0;

    // Team quota
    let quota_row: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(monthly_quota_hours), 0) FROM employees WHERE is_active = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let team_quota = quota_row.0;

    let utilization_rate = if team_hours > 0.0 {
        billable_hours / team_hours
    } else {
        0.0
    };

    // Active presence count
    let active_row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*)
         FROM presence p
         JOIN employees e ON e.id = p.employee_id
         WHERE e.is_active = 1 AND p.clockify_timer_active = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let total_row: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM employees WHERE is_active = 1")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    Ok(OverviewData {
        team_hours_this_month: team_hours,
        team_quota,
        utilization_rate,
        active_count: active_row.0 as u32,
        total_count: total_row.0 as u32,
    })
}

#[tauri::command]
pub async fn get_quota_compliance(db: State<'_, DbPool>) -> Result<Vec<QuotaRow>, String> {
    let pool = &db.0;
    let now = Local::now();
    let today = now.date_naive();

    // Current week boundaries (Monday to Sunday)
    let weekday_num = today.weekday().num_days_from_monday();
    let week_start = today - chrono::Duration::days(weekday_num as i64);
    let week_end = week_start + chrono::Duration::days(7);

    // Current month boundaries
    let month_start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
    let month_end = if today.month() == 12 {
        NaiveDate::from_ymd_opt(today.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(today.year(), today.month() + 1, 1)
    }
    .unwrap();

    // Count business days elapsed and total in month
    let business_days_elapsed = count_business_days(month_start, today);
    let total_business_days = count_business_days(month_start, month_end);

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let mut rows = Vec::new();
    for emp in employees.iter().filter(|e| e.is_active) {
        // Hours this week
        let week_row: (f64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(te.duration_seconds), 0) / 3600.0
             FROM time_entries te
             JOIN employees e ON e.id = te.employee_id
             WHERE e.is_active = 1 AND te.employee_id = ?1 AND te.start_time >= ?2 AND te.start_time < ?3",
        )
        .bind(&emp.id)
        .bind(week_start.format("%Y-%m-%d").to_string())
        .bind(week_end.format("%Y-%m-%d").to_string())
        .fetch_one(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

        // Hours this month
        let month_row: (f64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(te.duration_seconds), 0) / 3600.0
             FROM time_entries te
             JOIN employees e ON e.id = te.employee_id
             WHERE e.is_active = 1 AND te.employee_id = ?1 AND te.start_time >= ?2 AND te.start_time < ?3",
        )
        .bind(&emp.id)
        .bind(month_start.format("%Y-%m-%d").to_string())
        .bind(month_end.format("%Y-%m-%d").to_string())
        .fetch_one(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

        let expected = if total_business_days > 0 {
            (business_days_elapsed as f64 / total_business_days as f64) * emp.monthly_quota_hours
        } else {
            0.0
        };

        let ratio = if expected > 0.0 {
            month_row.0 / expected
        } else {
            1.0
        };

        let status = if ratio >= 0.9 {
            QuotaStatus::OnTrack
        } else if ratio >= 0.75 {
            QuotaStatus::Behind
        } else {
            QuotaStatus::Critical
        };

        rows.push(QuotaRow {
            employee_name: emp.name.clone(),
            this_week_hours: week_row.0,
            this_month_hours: month_row.0,
            quota: emp.monthly_quota_hours,
            status,
        });
    }

    Ok(rows)
}

/// Count business days (Mon-Fri) from start (inclusive) to end (exclusive).
fn count_business_days(start: NaiveDate, end: NaiveDate) -> u32 {
    let mut count = 0u32;
    let mut d = start;
    while d < end {
        match d.weekday() {
            Weekday::Sat | Weekday::Sun => {}
            _ => count += 1,
        }
        d += chrono::Duration::days(1);
    }
    count
}

// ─── Project breakdown ──────────────────────────────────────────

#[tauri::command]
pub async fn get_project_breakdown(
    db: State<'_, DbPool>,
    start: String,
    end: String,
) -> Result<Vec<ProjectStats>, String> {
    let pool = &db.0;

    #[derive(sqlx::FromRow)]
    struct Row {
        project_id: Option<String>,
        project_name: String,
        total_seconds: f64,
        billable_seconds: f64,
        member_count: i64,
    }

    let rows: Vec<Row> = sqlx::query_as(
        "SELECT
            te.project_id AS project_id,
            COALESCE(p.name, 'No Project') AS project_name,
            COALESCE(SUM(te.duration_seconds), 0) AS total_seconds,
            COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_seconds ELSE 0 END), 0) AS billable_seconds,
            COUNT(DISTINCT te.employee_id) AS member_count
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         LEFT JOIN projects p ON te.project_id = p.id
         WHERE e.is_active = 1 AND te.start_time >= ?1 AND te.start_time < ?2
         GROUP BY COALESCE(p.name, 'No Project')
         ORDER BY total_seconds DESC",
    )
    .bind(&start)
    .bind(&end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            let total_hours = r.total_seconds / 3600.0;
            let billable_hours = r.billable_seconds / 3600.0;
            let utilization = if total_hours > 0.0 {
                billable_hours / total_hours
            } else {
                0.0
            };
            ProjectStats {
                project_id: r.project_id,
                project_name: r.project_name,
                total_hours,
                billable_hours,
                team_members: r.member_count as u32,
                utilization,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_projects_catalog(
    db: State<'_, DbPool>,
) -> Result<Vec<ProjectCatalogItem>, String> {
    let pool = &db.0;
    let projects = queries::get_projects(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let mut rows: Vec<ProjectCatalogItem> = projects
        .into_iter()
        .map(|project| ProjectCatalogItem {
            id: project.id,
            name: project.name,
            client_name: project.client_name,
            is_billable: project.is_billable,
            is_archived: project.is_archived,
        })
        .collect();

    rows.sort_by(|left, right| left.name.to_lowercase().cmp(&right.name.to_lowercase()));
    Ok(rows)
}

#[derive(sqlx::FromRow)]
struct ClockifyProjectHoursRow {
    project_id: Option<String>,
    total_seconds: f64,
    billable_seconds: f64,
    member_count: i64,
}

fn month_bounds() -> (String, String) {
    let now = Local::now();
    let start =
        NaiveDate::from_ymd_opt(now.year(), now.month(), 1).unwrap_or_else(|| now.date_naive());
    let end = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1).unwrap()
    };
    (start.to_string(), end.to_string())
}

fn normalize_project_match(value: &str) -> String {
    value
        .chars()
        .filter(|ch| ch.is_alphanumeric())
        .flat_map(|ch| ch.to_lowercase())
        .collect()
}

fn project_hours_from_row(row: &ClockifyProjectHoursRow) -> (f64, f64, u32, f64) {
    let total_hours = row.total_seconds / 3600.0;
    let billable_hours = row.billable_seconds / 3600.0;
    let utilization = if total_hours > 0.0 {
        billable_hours / total_hours
    } else {
        0.0
    };
    (
        total_hours,
        billable_hours,
        row.member_count.max(0) as u32,
        utilization,
    )
}

#[tauri::command]
pub async fn get_execution_projects(
    db: State<'_, DbPool>,
) -> Result<Vec<ExecutionProjectView>, String> {
    let pool = &db.0;

    let (start, end) = month_bounds();
    let clockify_rows: Vec<ClockifyProjectHoursRow> = sqlx::query_as(
        "SELECT
            te.project_id AS project_id,
            COALESCE(SUM(te.duration_seconds), 0) AS total_seconds,
            COALESCE(SUM(CASE WHEN te.is_billable = 1 THEN te.duration_seconds ELSE 0 END), 0) AS billable_seconds,
            COUNT(DISTINCT te.employee_id) AS member_count
         FROM time_entries te
         JOIN employees e ON e.id = te.employee_id
         WHERE e.is_active = 1 AND te.start_time >= ?1 AND te.start_time < ?2
         GROUP BY te.project_id",
    )
    .bind(&start)
    .bind(&end)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load clockify project hours: {e}"))?;

    let all_clockify_projects = queries::get_projects(pool)
        .await
        .map_err(|e| format!("load clockify projects: {e}"))?;
    let clockify_by_id: HashMap<String, &ClockifyProjectHoursRow> = clockify_rows
        .iter()
        .filter_map(|row| row.project_id.as_ref().map(|id| (id.clone(), row)))
        .collect();
    let clockify_by_normalized_name: HashMap<String, String> = all_clockify_projects
        .iter()
        .map(|project| (normalize_project_match(&project.name), project.id.clone()))
        .collect();

    #[derive(sqlx::FromRow)]
    struct GithubProjectRow {
        repo: String,
        display_name: String,
        default_milestone_number: Option<i64>,
        huly_project_id: Option<String>,
        clockify_project_id: Option<String>,
        milestone_title: Option<String>,
        milestone_state: Option<String>,
        total_issues: i64,
        open_issues: i64,
        closed_issues: i64,
        latest_activity: Option<String>,
    }

    let github_rows: Vec<GithubProjectRow> = sqlx::query_as(
        "SELECT
            c.repo,
            c.display_name,
            c.default_milestone_number,
            c.huly_project_id,
            c.clockify_project_id,
            m.title AS milestone_title,
            m.state AS milestone_state,
            COUNT(i.number) AS total_issues,
            COALESCE(SUM(CASE WHEN LOWER(i.state) = 'open' THEN 1 ELSE 0 END), 0) AS open_issues,
            COALESCE(SUM(CASE WHEN LOWER(i.state) = 'closed' THEN 1 ELSE 0 END), 0) AS closed_issues,
            MAX(i.updated_at) AS latest_activity
         FROM github_repo_configs c
         LEFT JOIN github_milestones m
           ON m.repo = c.repo AND m.number = c.default_milestone_number
         LEFT JOIN github_issues i
           ON i.repo = c.repo AND (
             (c.default_milestone_number IS NOT NULL AND i.milestone_number = c.default_milestone_number)
             OR (c.default_milestone_number IS NULL AND i.milestone_number IS NULL)
           )
         WHERE c.enabled = 1
         GROUP BY c.repo, c.display_name, c.default_milestone_number, c.huly_project_id,
                  c.clockify_project_id, m.title, m.state
         ORDER BY latest_activity DESC, c.display_name ASC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("load github execution projects: {e}"))?;

    let mut rows = Vec::new();
    let mut used_clockify_ids = HashSet::new();

    for row in github_rows {
        let milestone_number = row.default_milestone_number.unwrap_or(0);
        let project_id = github_project_id(&row.repo, milestone_number);
        let title = row
            .milestone_title
            .clone()
            .unwrap_or(row.display_name.clone());
        let matched_clockify_id = row
            .clockify_project_id
            .clone()
            .or_else(|| {
                clockify_by_normalized_name
                    .get(&normalize_project_match(&title))
                    .cloned()
            })
            .or_else(|| {
                clockify_by_normalized_name
                    .get(&normalize_project_match(&row.display_name))
                    .cloned()
            });
        let hours = matched_clockify_id
            .as_ref()
            .and_then(|id| clockify_by_id.get(id).copied());
        if let Some(id) = matched_clockify_id.as_ref() {
            used_clockify_ids.insert(id.clone());
        }
        let (total_hours, billable_hours, team_members, utilization) = hours
            .map(project_hours_from_row)
            .unwrap_or((0.0, 0.0, 0, 0.0));
        let total_issues = row.total_issues.max(0) as u32;
        let closed_issues = row.closed_issues.max(0) as u32;
        let open_issues = row.open_issues.max(0) as u32;
        let percent_complete = if total_issues > 0 {
            closed_issues as f64 / total_issues as f64
        } else {
            0.0
        };
        let status = if total_issues > 0 && open_issues == 0 {
            "done"
        } else if row
            .milestone_state
            .as_deref()
            .unwrap_or_default()
            .eq_ignore_ascii_case("closed")
        {
            "done"
        } else {
            "active"
        };

        rows.push(ExecutionProjectView {
            id: project_id,
            source: "github".to_string(),
            repo: Some(row.repo),
            milestone: row.milestone_title,
            title,
            status: status.to_string(),
            total_issues,
            open_issues,
            closed_issues,
            percent_complete,
            latest_activity: row.latest_activity,
            huly_project_id: row.huly_project_id,
            clockify_project_id: matched_clockify_id,
            total_hours,
            billable_hours,
            team_members,
            utilization,
        });
    }

    for project in all_clockify_projects {
        if project.is_archived || used_clockify_ids.contains(&project.id) {
            continue;
        }
        let hours = clockify_by_id.get(&project.id).copied();
        let (total_hours, billable_hours, team_members, utilization) = hours
            .map(project_hours_from_row)
            .unwrap_or((0.0, 0.0, 0, 0.0));
        rows.push(ExecutionProjectView {
            id: format!("clockify:{}", project.id),
            source: "clockify".to_string(),
            repo: None,
            milestone: None,
            title: project.name,
            status: "active".to_string(),
            total_issues: 0,
            open_issues: 0,
            closed_issues: 0,
            percent_complete: 0.0,
            latest_activity: None,
            huly_project_id: project.huly_project_id,
            clockify_project_id: Some(project.id),
            total_hours,
            billable_hours,
            team_members,
            utilization,
        });
    }

    rows.sort_by(|left, right| {
        let source_order = source_rank(&left.source).cmp(&source_rank(&right.source));
        if source_order != std::cmp::Ordering::Equal {
            return source_order;
        }
        right
            .latest_activity
            .cmp(&left.latest_activity)
            .then_with(|| right.total_hours.total_cmp(&left.total_hours))
            .then_with(|| left.title.cmp(&right.title))
    });

    Ok(rows)
}

fn source_rank(source: &str) -> u8 {
    match source {
        "github" => 0,
        "clockify" => 1,
        _ => 2,
    }
}

// ─── Timesheet ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_time_entries_view(
    db: State<'_, DbPool>,
    employee_id: Option<String>,
    start: String,
    end: String,
) -> Result<Vec<TimeEntry>, String> {
    let pool = &db.0;

    let entries: Vec<TimeEntry> = if let Some(eid) = employee_id {
        sqlx::query_as::<_, TimeEntry>(
            "SELECT te.*
             FROM time_entries te
             JOIN employees e ON e.id = te.employee_id
             WHERE e.is_active = 1 AND te.employee_id = ?1 AND te.start_time >= ?2 AND te.start_time < ?3
             ORDER BY start_time DESC",
        )
        .bind(&eid)
        .bind(&start)
        .bind(&end)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, TimeEntry>(
            "SELECT te.*
             FROM time_entries te
             JOIN employees e ON e.id = te.employee_id
             WHERE e.is_active = 1 AND te.start_time >= ?1 AND te.start_time < ?2
             ORDER BY start_time DESC",
        )
        .bind(&start)
        .bind(&end)
        .fetch_all(pool)
        .await
    }
    .map_err(|e| format!("db error: {e}"))?;

    Ok(entries)
}

// ─── Activity feed ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_activity_feed(
    db: State<'_, DbPool>,
    limit: u32,
) -> Result<Vec<ActivityItem>, String> {
    let pool = &db.0;

    let rows: Vec<OpsActivityRow> = sqlx::query_as(
        "SELECT
            o.source,
            o.event_type,
            o.entity_type,
            o.entity_id,
            o.actor_employee_id,
            e.name AS employee_name,
            o.occurred_at,
            o.payload_json
         FROM ops_events o
         LEFT JOIN employees e ON e.id = o.actor_employee_id
         ORDER BY o.occurred_at DESC
         LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    Ok(rows.into_iter().map(activity_from_ops_row).collect())
}

#[tauri::command]
pub async fn get_project_activity(
    db: State<'_, DbPool>,
    project_id: String,
    limit: u32,
) -> Result<Vec<ActivityItem>, String> {
    let pool = &db.0;
    let rows: Vec<OpsActivityRow> = sqlx::query_as(
        "SELECT
            o.source,
            o.event_type,
            o.entity_type,
            o.entity_id,
            o.actor_employee_id,
            e.name AS employee_name,
            o.occurred_at,
            o.payload_json
         FROM ops_events o
         LEFT JOIN employees e ON e.id = o.actor_employee_id
         WHERE json_extract(o.payload_json, '$.project_id') = ?1
         ORDER BY o.occurred_at DESC
         LIMIT ?2",
    )
    .bind(&project_id)
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    Ok(rows.into_iter().map(activity_from_ops_row).collect())
}

#[derive(sqlx::FromRow)]
struct OpsActivityRow {
    source: String,
    event_type: String,
    entity_type: String,
    entity_id: String,
    actor_employee_id: Option<String>,
    employee_name: Option<String>,
    occurred_at: String,
    payload_json: String,
}

fn activity_from_ops_row(row: OpsActivityRow) -> ActivityItem {
    let payload = serde_json::from_str::<Value>(&row.payload_json).unwrap_or(Value::Null);
    let employee_name = row
        .employee_name
        .or_else(|| row.actor_employee_id.clone())
        .unwrap_or_else(|| match row.source.as_str() {
            "github" => "GitHub".to_string(),
            "huly" => "Huly".to_string(),
            "clockify" => "Clockify".to_string(),
            _ => "System".to_string(),
        });
    let action = match row.event_type.as_str() {
        "clockify.time_entry.logged" => "logged time".to_string(),
        "github.issue.opened" => "opened issue".to_string(),
        "github.issue.updated" => "updated issue".to_string(),
        "github.issue.closed" => "closed issue".to_string(),
        "github.issue.reopened" => "reopened issue".to_string(),
        "github.issue.labels_changed" => "changed issue labels".to_string(),
        "github.issue.assignees_changed" => "changed issue assignees".to_string(),
        "huly.issue.modified" => "mirrored issue".to_string(),
        other => other.rsplit('.').next().unwrap_or(other).replace('_', " "),
    };
    let title = payload
        .get("title")
        .and_then(Value::as_str)
        .map(str::to_string)
        .or_else(|| {
            payload
                .get("description")
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .or_else(|| {
            payload
                .get("identifier")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
    let number = payload.get("number").and_then(Value::as_i64);
    let detail = match (number, title) {
        (Some(number), Some(title)) if row.source == "github" => {
            Some(format!("#{number}: {title}"))
        }
        (_, Some(title)) => Some(title),
        _ => Some(row.entity_id.clone()),
    };

    ActivityItem {
        source: row.source,
        employee_name,
        action,
        detail,
        occurred_at: row.occurred_at,
        project_id: payload
            .get("project_id")
            .and_then(Value::as_str)
            .map(str::to_string),
        source_url: payload
            .get("url")
            .and_then(Value::as_str)
            .map(str::to_string),
        entity_type: Some(row.entity_type),
        status: payload
            .get("state")
            .or_else(|| payload.get("status"))
            .and_then(Value::as_str)
            .map(str::to_string),
    }
}

// ─── Presence status ────────────────────────────────────────────

#[tauri::command]
pub async fn get_presence_status(db: State<'_, DbPool>) -> Result<Vec<PresenceStatus>, String> {
    let pool = &db.0;
    let now = Local::now();

    #[derive(sqlx::FromRow)]
    struct PresenceRow {
        employee_name: String,
        clockify_timer_active: bool,
        clockify_timer_project: Option<String>,
        clockify_timer_start: Option<String>,
        huly_last_seen: Option<String>,
    }

    let rows: Vec<PresenceRow> = sqlx::query_as(
        "SELECT
            e.name AS employee_name,
            COALESCE(p.clockify_timer_active, 0) AS clockify_timer_active,
            p.clockify_timer_project,
            p.clockify_timer_start,
            p.huly_last_seen
         FROM employees e
         LEFT JOIN presence p ON e.id = p.employee_id
         WHERE e.is_active = 1
         ORDER BY e.name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|r| {
            // Calculate clockify duration from timer start to now
            let clockify_duration = r.clockify_timer_start.as_ref().and_then(|ts| {
                chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S")
                    .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S"))
                    .ok()
                    .map(|start| (now.naive_local() - start).num_seconds())
            });

            // Determine combined status
            let huly_recent = r.huly_last_seen.as_ref().and_then(|ts| {
                chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%dT%H:%M:%S")
                    .or_else(|_| chrono::NaiveDateTime::parse_from_str(ts, "%Y-%m-%d %H:%M:%S"))
                    .ok()
                    .map(|seen| (now.naive_local() - seen).num_minutes())
            });

            let combined_status =
                if r.clockify_timer_active || huly_recent.map_or(false, |mins| mins <= 15) {
                    CombinedStatus::Active
                } else if huly_recent.map_or(false, |mins| mins <= 60) {
                    CombinedStatus::Idle
                } else {
                    CombinedStatus::Offline
                };

            PresenceStatus {
                employee_name: r.employee_name,
                clockify_timer_active: r.clockify_timer_active,
                clockify_project: r.clockify_timer_project,
                clockify_duration,
                huly_last_seen: r.huly_last_seen,
                combined_status,
            }
        })
        .collect())
}

// ─── Employees ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_employees(db: State<'_, DbPool>) -> Result<Vec<Employee>, String> {
    let pool = &db.0;
    queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))
}

#[tauri::command]
pub async fn update_employee_quota(
    db: State<'_, DbPool>,
    employee_id: String,
    quota: f64,
) -> Result<(), String> {
    let pool = &db.0;
    sqlx::query(
        "UPDATE employees SET monthly_quota_hours = ?1, updated_at = datetime('now') WHERE id = ?2",
    )
    .bind(quota)
    .bind(&employee_id)
    .execute(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;
    Ok(())
}

// ─── Sync status ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_sync_status(db: State<'_, DbPool>) -> Result<Vec<SyncState>, String> {
    let pool = &db.0;
    let states: Vec<SyncState> =
        sqlx::query_as::<_, SyncState>("SELECT * FROM sync_state ORDER BY source, entity")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("db error: {e}"))?;
    Ok(states)
}

#[tauri::command]
pub async fn get_identity_review_queue(
    db: State<'_, DbPool>,
    max_confidence: Option<f64>,
) -> Result<Vec<IdentityMapEntry>, String> {
    let threshold = max_confidence.unwrap_or(0.85).clamp(0.0, 1.0);
    queries::get_identity_review_queue(&db.0, threshold)
        .await
        .map_err(|e| format!("db error: {e}"))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IdentityOverrideInput {
    pub source: String,
    pub external_id: String,
    pub employee_id: String,
    pub operator: String,
    pub reason: String,
}

#[tauri::command]
pub async fn set_identity_override(
    db: State<'_, DbPool>,
    input: IdentityOverrideInput,
) -> Result<String, String> {
    let pool = &db.0;
    let source = sanitize_required_text("Identity source", &input.source)?.to_lowercase();
    let external_id = sanitize_required_text("External identity id", &input.external_id)?;
    let employee_id = sanitize_required_text("Employee id", &input.employee_id)?;
    let operator = sanitize_required_text("Override operator", &input.operator)?;
    let reason = sanitize_required_text("Override reason", &input.reason)?;

    queries::get_employee_by_id(pool, &employee_id)
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| format!("Unknown employee id: {employee_id}"))?;

    queries::clear_competing_identity_links(pool, &source, &employee_id, &external_id)
        .await
        .map_err(|e| format!("clear competing identity links: {e}"))?;

    let now = Utc::now().to_rfc3339();
    let entry = IdentityMapEntry {
        id: None,
        source: source.clone(),
        external_id: external_id.clone(),
        employee_id: Some(employee_id.clone()),
        confidence: 1.0,
        resolution_status: "linked".to_string(),
        match_method: Some("manual.override".to_string()),
        is_override: true,
        override_by: Some(operator),
        override_reason: Some(reason),
        override_at: Some(now.clone()),
        first_seen_at: now.clone(),
        last_seen_at: now.clone(),
        created_at: now.clone(),
        updated_at: now,
    };
    queries::upsert_identity_map_entry(pool, &entry)
        .await
        .map_err(|e| format!("persist identity override: {e}"))?;

    Ok(format!(
        "Identity override set: source={} external_id={} → employee_id={}",
        source, external_id, employee_id
    ))
}

#[tauri::command]
pub async fn refresh_agent_feed(db: State<'_, DbPool>) -> Result<String, String> {
    let upserted = queries::refresh_agent_feed_projection(&db.0)
        .await
        .map_err(|e| format!("refresh agent feed projection: {e}"))?;
    Ok(format!("Agent feed refreshed ({upserted} upserts)"))
}

#[tauri::command]
pub async fn get_agent_feed(
    db: State<'_, DbPool>,
    limit: Option<u32>,
) -> Result<Vec<AgentFeedItem>, String> {
    let row_limit = limit.unwrap_or(500).clamp(1, 5_000) as i64;
    queries::get_agent_feed(&db.0, row_limit)
        .await
        .map_err(|e| format!("query agent feed: {e}"))
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFeedExportRequest {
    pub since_cursor: Option<String>,
    pub since_timestamp: Option<String>,
    pub limit: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFeedSourceLag {
    pub source: String,
    pub entity: String,
    pub last_sync_at: Option<String>,
    pub lag_seconds: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFeedLagMetadata {
    pub projection_lag_seconds: Option<i64>,
    pub max_source_lag_seconds: Option<i64>,
    pub sources: Vec<AgentFeedSourceLag>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentFeedExportResponse {
    pub schema_version: String,
    pub generated_at: String,
    pub since_cursor: Option<String>,
    pub since_timestamp: Option<String>,
    pub next_cursor: Option<String>,
    pub has_more: bool,
    pub lag: AgentFeedLagMetadata,
    pub items: Vec<AgentFeedItem>,
}

#[tauri::command]
pub async fn export_agent_feed_snapshot(
    db: State<'_, DbPool>,
    request: Option<AgentFeedExportRequest>,
) -> Result<AgentFeedExportResponse, String> {
    let pool = &db.0;
    let request = request.unwrap_or_default();
    let row_limit = request.limit.unwrap_or(500).clamp(1, 5_000) as usize;
    let fetch_limit = (row_limit + 1) as i64;

    let parsed_cursor = match request
        .since_cursor
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Some(cursor) => Some(
            parse_agent_feed_cursor(cursor)
                .map_err(|message| machine_error("invalid_cursor", &message))?,
        ),
        None => None,
    };

    let since_timestamp = request
        .since_timestamp
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string());
    if let Some(value) = since_timestamp.as_deref() {
        if parse_sync_timestamp_utc(value).is_none() {
            return Err(machine_error(
                "invalid_since_timestamp",
                "sinceTimestamp must be RFC3339 or ISO datetime format",
            ));
        }
    }

    let mut items = queries::get_agent_feed_export_rows(
        pool,
        since_timestamp.as_deref(),
        parsed_cursor
            .as_ref()
            .map(|(detected_at, sync_key)| (detected_at.as_str(), sync_key.as_str())),
        fetch_limit,
    )
    .await
    .map_err(|e| machine_error("query_failed", &format!("query agent feed export: {e}")))?;

    let has_more = items.len() > row_limit;
    if has_more {
        items.truncate(row_limit);
    }
    let next_cursor = items
        .last()
        .map(|row| format!("{}|{}", row.detected_at, row.sync_key));

    let now = Utc::now();
    let mut source_lag = Vec::new();
    for (source, entity) in [
        ("clockify", "time_entries"),
        ("huly", "issues"),
        ("slack", "messages_delta"),
        ("agent_feed", "projection"),
    ] {
        let state = queries::get_sync_state(pool, source, entity)
            .await
            .map_err(|e| machine_error("lag_metadata_failed", &format!("load sync state: {e}")))?;
        let last_sync_at = state.as_ref().map(|value| value.last_sync_at.clone());
        source_lag.push(AgentFeedSourceLag {
            source: source.to_string(),
            entity: entity.to_string(),
            lag_seconds: lag_seconds_from_sync_timestamp(last_sync_at.as_deref(), now),
            last_sync_at,
        });
    }

    let projection_lag_seconds = source_lag
        .iter()
        .find(|entry| entry.source == "agent_feed" && entry.entity == "projection")
        .and_then(|entry| entry.lag_seconds);
    let max_source_lag_seconds = source_lag
        .iter()
        .filter(|entry| entry.source != "agent_feed")
        .filter_map(|entry| entry.lag_seconds)
        .max();

    Ok(AgentFeedExportResponse {
        schema_version: "agent_feed/v1".to_string(),
        generated_at: now.to_rfc3339(),
        since_cursor: request.since_cursor,
        since_timestamp,
        next_cursor,
        has_more,
        lag: AgentFeedLagMetadata {
            projection_lag_seconds,
            max_source_lag_seconds,
            sources: source_lag,
        },
        items,
    })
}

// ─── Huly connection commands ──────────────────────────────────

/// Test connectivity to Huly using a user token.
#[tauri::command]
pub async fn test_huly_connection(token: String) -> Result<String, String> {
    let client = HulyClient::connect(None, &token).await?;
    client.test_connection().await
}

/// Test connectivity to Slack using a bot token plus the required read scopes.
#[tauri::command]
pub async fn test_slack_connection(token: String) -> Result<String, String> {
    let token = validate_slack_bot_token(&token)?;
    let client = SlackClient::new(token);
    let auth = client
        .test_connection()
        .await
        .map_err(humanize_slack_connection_error)?;
    let team = auth
        .team
        .or(auth.team_id)
        .or(auth.url)
        .unwrap_or_else(|| "unknown-team".to_string());
    Ok(format!(
        "Connected to Slack workspace {team} as {}",
        auth.user
    ))
}

/// Run a full Huly sync (issues + presence).
#[tauri::command]
pub async fn trigger_huly_sync(db: State<'_, DbPool>) -> Result<String, String> {
    let pool = &db.0;

    let token = queries::get_setting(pool, "huly_token")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "Huly token not configured".to_string())?;

    let client = HulyClient::connect(None, &token).await?;
    let engine = HulySyncEngine::new(Arc::new(client), pool.clone());

    let report = engine.full_sync().await?;

    Ok(format!(
        "Huly sync complete: {} issue activities, {} presence updates, {} cached Team records",
        report.issues_synced, report.presence_updated, report.team_cache_items
    ))
}

// ─── Background sync ───────────────────────────────────────────

#[tauri::command]
pub async fn start_background_sync(
    app_handle: tauri::AppHandle,
    db: State<'_, DbPool>,
    scheduler_state: State<'_, SchedulerState>,
) -> Result<String, String> {
    let pool = db.0.clone();

    // Stop existing scheduler if running
    {
        let mut guard = scheduler_state
            .0
            .lock()
            .map_err(|e| format!("lock error: {e}"))?;
        if let Some(old) = guard.take() {
            old.stop();
        }
    }

    match SyncScheduler::start(pool, app_handle).await {
        Some(scheduler) => {
            let mut guard = scheduler_state
                .0
                .lock()
                .map_err(|e| format!("lock error: {e}"))?;
            *guard = Some(scheduler);
            Ok("Background sync started".to_string())
        }
        None => Ok("Settings not configured, background sync not started".to_string()),
    }
}

// ─── Huly client helper ───────────────────────────────────────

async fn get_huly_client(pool: &sqlx::SqlitePool) -> Result<HulyClient, String> {
    let token = queries::get_setting(pool, "huly_token")
        .await
        .map_err(|e| format!("read huly_token: {e}"))?
        .ok_or_else(|| "Huly token not configured".to_string())?;
    HulyClient::connect(None, &token).await
}

async fn get_optional_slack_client(pool: &sqlx::SqlitePool) -> Result<Option<SlackClient>, String> {
    let token = queries::get_setting(pool, "slack_bot_token")
        .await
        .map_err(|e| format!("read slack_bot_token: {e}"))?;

    match token {
        Some(value) if !value.trim().is_empty() => {
            let token = validate_slack_bot_token(&value)?;
            Ok(Some(SlackClient::new(token)))
        }
        _ => Ok(None),
    }
}

fn resolve_huly_actor_social_id(account: &HulyAccountInfo) -> Option<String> {
    account
        .primary_social_id
        .clone()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            account
                .social_ids
                .as_ref()
                .and_then(|ids| ids.iter().find(|value| !value.is_empty()).cloned())
        })
}

fn department_sort_key(name: &str) -> (u8, String) {
    let rank = match normalize_key(name).as_str() {
        "leadership" => 0,
        "engineering" => 1,
        "marketing" => 2,
        "organization" => 9,
        _ => 5,
    };
    (rank, name.to_lowercase())
}

fn dedupe_person_ids(ids: &[String]) -> Vec<String> {
    let mut seen = HashSet::new();
    let mut deduped = Vec::new();
    for id in ids {
        if !id.trim().is_empty() && seen.insert(id.clone()) {
            deduped.push(id.clone());
        }
    }
    deduped
}

fn sanitize_org_department_update(mapping: &OrgDepartmentUpdateInput) -> OrgDepartmentUpdateInput {
    let mut member_person_ids = dedupe_person_ids(&mapping.member_person_ids);

    for candidate in [&mapping.head_person_id, &mapping.team_lead_person_id] {
        if let Some(person_id) = candidate {
            if !member_person_ids
                .iter()
                .any(|existing| existing == person_id)
            {
                member_person_ids.push(person_id.clone());
            }
        }
    }

    OrgDepartmentUpdateInput {
        department_id: mapping.department_id.clone(),
        head_person_id: mapping
            .head_person_id
            .clone()
            .filter(|value| !value.trim().is_empty()),
        team_lead_person_id: mapping
            .team_lead_person_id
            .clone()
            .filter(|value| !value.trim().is_empty()),
        member_person_ids,
    }
}

fn validate_unique_department_membership(
    mappings: &[OrgDepartmentUpdateInput],
) -> Result<(), String> {
    let mut assignments: HashMap<String, String> = HashMap::new();
    for mapping in mappings {
        for person_id in &mapping.member_person_ids {
            if let Some(previous_department) =
                assignments.insert(person_id.clone(), mapping.department_id.clone())
            {
                return Err(format!(
                    "person {person_id} is assigned to multiple departments ({previous_department}, {})",
                    mapping.department_id
                ));
            }
        }
    }
    Ok(())
}

fn ignored_org_person_ids(
    db_employees: &[Employee],
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> HashSet<String> {
    db_employees
        .iter()
        .filter(|employee| {
            !employee.is_active
                || employee_is_ignored(employee, ignored_emails, ignored_employee_ids)
        })
        .filter_map(|employee| employee.huly_person_id.clone())
        .collect()
}

fn build_org_chart_view(
    mut departments: Vec<HulyDepartment>,
    persons: Vec<HulyPerson>,
    huly_employees: Vec<HulyEmployee>,
    db_employees: Vec<Employee>,
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> OrgChartView {
    let ignored_person_ids =
        ignored_org_person_ids(&db_employees, ignored_emails, ignored_employee_ids);

    let db_employee_by_person: HashMap<String, &Employee> = db_employees
        .iter()
        .filter(|employee| {
            employee.is_active
                && !employee_is_ignored(employee, ignored_emails, ignored_employee_ids)
        })
        .filter_map(|employee| {
            employee
                .huly_person_id
                .as_ref()
                .map(|person_id| (person_id.clone(), employee))
        })
        .collect();

    let person_by_id: HashMap<String, &HulyPerson> = persons
        .iter()
        .map(|person| (person.id.clone(), person))
        .collect();

    let employee_name_by_person: HashMap<String, String> = huly_employees
        .iter()
        .filter_map(|employee| {
            employee.person_uuid.as_ref().and_then(|person_id| {
                if ignored_person_ids.contains(person_id) {
                    None
                } else {
                    Some((
                        person_id.clone(),
                        employee.name.clone().unwrap_or_else(|| person_id.clone()),
                    ))
                }
            })
        })
        .collect();

    let mut relevant_person_ids: HashSet<String> = HashSet::new();
    for department in &departments {
        if let Some(head) = &department.head {
            if !ignored_person_ids.contains(head) {
                relevant_person_ids.insert(head.clone());
            }
        }
        if let Some(team_lead) = &department.team_lead {
            if !ignored_person_ids.contains(team_lead) {
                relevant_person_ids.insert(team_lead.clone());
            }
        }
        if let Some(members) = &department.members {
            relevant_person_ids.extend(
                members
                    .iter()
                    .filter(|person_id| !ignored_person_ids.contains(*person_id))
                    .cloned(),
            );
        }
    }

    for employee in &huly_employees {
        if employee.active.unwrap_or(true) {
            if let Some(person_id) = &employee.person_uuid {
                if !ignored_person_ids.contains(person_id) {
                    relevant_person_ids.insert(person_id.clone());
                }
            }
        }
    }

    for employee in &db_employees {
        if employee.is_active {
            if let Some(person_id) = &employee.huly_person_id {
                if !ignored_person_ids.contains(person_id) {
                    relevant_person_ids.insert(person_id.clone());
                }
            }
        }
    }

    let mut people: Vec<OrgPersonView> = relevant_person_ids
        .into_iter()
        .map(|person_id| {
            let db_employee = db_employee_by_person.get(&person_id).copied();
            let person_name = person_by_id
                .get(&person_id)
                .and_then(|person| person.name.clone())
                .filter(|name| !name.trim().is_empty());
            let employee_name = db_employee.map(|employee| employee.name.clone());
            let huly_employee_name = employee_name_by_person.get(&person_id).cloned();

            OrgPersonView {
                person_id: person_id.clone(),
                employee_id: db_employee.map(|employee| employee.id.clone()),
                name: person_name
                    .or(employee_name)
                    .or(huly_employee_name)
                    .unwrap_or(person_id.clone()),
                email: db_employee.map(|employee| employee.email.clone()),
                active: db_employee
                    .map(|employee| employee.is_active)
                    .unwrap_or(true),
            }
        })
        .collect();

    people.sort_by(|left, right| {
        right
            .active
            .cmp(&left.active)
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });

    let person_name_map: HashMap<String, String> = people
        .iter()
        .map(|person| (person.person_id.clone(), person.name.clone()))
        .collect();

    departments.sort_by(|left, right| {
        let left_name = left.name.clone().unwrap_or_else(|| "Unnamed".to_string());
        let right_name = right.name.clone().unwrap_or_else(|| "Unnamed".to_string());
        department_sort_key(&left_name).cmp(&department_sort_key(&right_name))
    });

    let department_views = departments
        .iter()
        .map(|department| {
            let head_person_id = department
                .head
                .clone()
                .filter(|person_id| !ignored_person_ids.contains(person_id));
            let team_lead_person_id = department
                .team_lead
                .clone()
                .filter(|person_id| !ignored_person_ids.contains(person_id));
            let member_person_ids = dedupe_person_ids(
                &department
                    .members
                    .clone()
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|person_id| !ignored_person_ids.contains(person_id))
                    .collect::<Vec<_>>(),
            );

            OrgDepartmentMappingView {
                id: department.id.clone(),
                name: department
                    .name
                    .clone()
                    .unwrap_or_else(|| "Unnamed".to_string()),
                head_person_id: head_person_id.clone(),
                head_name: head_person_id
                    .as_ref()
                    .and_then(|person_id| person_name_map.get(person_id))
                    .cloned(),
                team_lead_person_id: team_lead_person_id.clone(),
                team_lead_name: team_lead_person_id
                    .as_ref()
                    .and_then(|person_id| person_name_map.get(person_id))
                    .cloned(),
                member_person_ids,
            }
        })
        .collect();

    OrgChartView {
        departments: department_views,
        people,
    }
}

const HULY_PROJECT_CLASS: &str = "tracker:class:Project";
const HULY_ISSUE_CLASS: &str = "tracker:class:Issue";
const HULY_DEPARTMENT_CLASS: &str = "hr:class:Department";
const HULY_CHANNEL_CLASS: &str = "chunter:class:Channel";
const HULY_BOARD_CLASS: &str = "board:class:Board";
const CORE_SPACE_SPACE: &str = "core:space:Space";
const CORE_SPACE_WORKSPACE: &str = "core:space:Workspace";
const HR_HEAD_DEPARTMENT_ID: &str = "hr:ids:Head";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum ProjectTargetKey {
    Axtech,
    TirakApp,
    Vibrasonix,
    TuyaClients,
    OasisRnd,
    InternalOps,
}

impl ProjectTargetKey {
    fn display_name(self) -> &'static str {
        match self {
            Self::Axtech => "Axtech",
            Self::TirakApp => "Tirak-App",
            Self::Vibrasonix => "Vibrasonix",
            Self::TuyaClients => "Tuya clients",
            Self::OasisRnd => "OASIS R&D",
            Self::InternalOps => "Internal Ops",
        }
    }

    fn identifier(self) -> Option<&'static str> {
        match self {
            Self::TuyaClients => Some("TUY"),
            Self::OasisRnd => Some("OAS"),
            Self::InternalOps => Some("INT"),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
struct WorkspaceNormalizationSnapshotData {
    account: HulyAccountInfo,
    projects: Vec<HulyProject>,
    issues: Vec<HulyIssue>,
    departments: Vec<HulyDepartment>,
    channels: Vec<HulyChannel>,
    employees: Vec<HulyEmployee>,
    persons: Vec<HulyPerson>,
    documents: Vec<HulyDocument>,
    boards: Vec<HulyBoard>,
    board_cards: Vec<HulyBoardCard>,
}

#[derive(Debug, Clone)]
enum WorkspaceNormalizationOperation {
    RenameProject {
        project_id: String,
        from_name: String,
        to: ProjectTargetKey,
    },
    CreateProject {
        target: ProjectTargetKey,
    },
    MoveIssue {
        issue_id: String,
        issue_title: String,
        from_project_name: Option<String>,
        from_project_id: Option<String>,
        to: ProjectTargetKey,
        reason: String,
    },
    CreateDepartment {
        name: &'static str,
    },
    CreateChannel {
        name: &'static str,
        description: &'static str,
        topic: &'static str,
    },
    ArchiveBoard {
        board_id: String,
        board_name: String,
    },
    ManualIssueReview {
        issue_id: String,
        issue_title: String,
        current_project_name: Option<String>,
        reason: String,
    },
    ManualDepartmentReview {
        employee_count: usize,
        reason: String,
    },
    ManualDuplicatePerson {
        display_name: String,
        person_ids: Vec<String>,
    },
    ManualDocumentReview {
        document_id: String,
        title: Option<String>,
        has_content: bool,
    },
    ManualBoardReview {
        board_id: String,
        board_name: String,
        card_count: usize,
    },
}

impl WorkspaceNormalizationOperation {
    fn to_action(&self) -> HulyWorkspaceNormalizationAction {
        match self {
            Self::RenameProject {
                project_id,
                from_name,
                to,
            } => HulyWorkspaceNormalizationAction {
                category: "projects".to_string(),
                kind: "rename".to_string(),
                target: to.display_name().to_string(),
                reason: "Runbook rename target".to_string(),
                safe_to_apply: true,
                applied: false,
                current_value: Some(from_name.clone()),
                desired_value: Some(to.display_name().to_string()),
                object_id: Some(project_id.clone()),
                result_id: None,
                error: None,
            },
            Self::CreateProject { target } => HulyWorkspaceNormalizationAction {
                category: "projects".to_string(),
                kind: "create".to_string(),
                target: target.display_name().to_string(),
                reason: "Missing target delivery stream".to_string(),
                safe_to_apply: true,
                applied: false,
                current_value: None,
                desired_value: Some(target.display_name().to_string()),
                object_id: None,
                result_id: None,
                error: None,
            },
            Self::MoveIssue {
                issue_id,
                issue_title,
                from_project_name,
                to,
                reason,
                ..
            } => HulyWorkspaceNormalizationAction {
                category: "issues".to_string(),
                kind: "move".to_string(),
                target: issue_title.clone(),
                reason: reason.clone(),
                safe_to_apply: true,
                applied: false,
                current_value: from_project_name.clone(),
                desired_value: Some(to.display_name().to_string()),
                object_id: Some(issue_id.clone()),
                result_id: None,
                error: None,
            },
            Self::CreateDepartment { name } => HulyWorkspaceNormalizationAction {
                category: "departments".to_string(),
                kind: "create".to_string(),
                target: (*name).to_string(),
                reason: "Missing target department shell".to_string(),
                safe_to_apply: true,
                applied: false,
                current_value: None,
                desired_value: Some((*name).to_string()),
                object_id: None,
                result_id: None,
                error: None,
            },
            Self::CreateChannel { name, topic, .. } => HulyWorkspaceNormalizationAction {
                category: "channels".to_string(),
                kind: "create".to_string(),
                target: format!("#{name}"),
                reason: topic.to_string(),
                safe_to_apply: true,
                applied: false,
                current_value: None,
                desired_value: Some(format!("#{name}")),
                object_id: None,
                result_id: None,
                error: None,
            },
            Self::ArchiveBoard {
                board_id,
                board_name,
            } => HulyWorkspaceNormalizationAction {
                category: "board".to_string(),
                kind: "archive".to_string(),
                target: board_name.clone(),
                reason: "Default board is empty and can be archived safely".to_string(),
                safe_to_apply: true,
                applied: false,
                current_value: Some(board_name.clone()),
                desired_value: Some("Archived".to_string()),
                object_id: Some(board_id.clone()),
                result_id: None,
                error: None,
            },
            Self::ManualIssueReview {
                issue_id,
                issue_title,
                current_project_name,
                reason,
            } => HulyWorkspaceNormalizationAction {
                category: "issues".to_string(),
                kind: "manualReview".to_string(),
                target: issue_title.clone(),
                reason: reason.clone(),
                safe_to_apply: false,
                applied: false,
                current_value: current_project_name.clone(),
                desired_value: None,
                object_id: Some(issue_id.clone()),
                result_id: None,
                error: None,
            },
            Self::ManualDepartmentReview {
                employee_count,
                reason,
            } => HulyWorkspaceNormalizationAction {
                category: "departments".to_string(),
                kind: "manualReview".to_string(),
                target: "Department membership mapping".to_string(),
                reason: format!("{reason} ({employee_count} active employees in scope)"),
                safe_to_apply: false,
                applied: false,
                current_value: None,
                desired_value: Some("Engineering / Marketing / Leadership assignments".to_string()),
                object_id: None,
                result_id: None,
                error: None,
            },
            Self::ManualDuplicatePerson {
                display_name,
                person_ids,
            } => HulyWorkspaceNormalizationAction {
                category: "people".to_string(),
                kind: "manualReview".to_string(),
                target: display_name.clone(),
                reason: format!("Duplicate person records detected: {}", person_ids.join(", ")),
                safe_to_apply: false,
                applied: false,
                current_value: None,
                desired_value: Some("One canonical active person record".to_string()),
                object_id: None,
                result_id: None,
                error: None,
            },
            Self::ManualDocumentReview {
                document_id,
                title,
                has_content,
            } => HulyWorkspaceNormalizationAction {
                category: "documents".to_string(),
                kind: "manualReview".to_string(),
                target: title.clone().unwrap_or_else(|| "(untitled document)".to_string()),
                reason: if *has_content {
                    "Untitled document has content and needs a human rename decision".to_string()
                } else {
                    "Untitled placeholder needs a human archive/delete decision".to_string()
                },
                safe_to_apply: false,
                applied: false,
                current_value: title.clone(),
                desired_value: None,
                object_id: Some(document_id.clone()),
                result_id: None,
                error: None,
            },
            Self::ManualBoardReview {
                board_id,
                board_name,
                card_count,
            } => HulyWorkspaceNormalizationAction {
                category: "board".to_string(),
                kind: "manualReview".to_string(),
                target: board_name.clone(),
                reason: format!(
                    "Default board usage is ambiguous; inspect before archiving ({card_count} cards)"
                ),
                safe_to_apply: false,
                applied: false,
                current_value: Some(board_name.clone()),
                desired_value: Some("Keep with starter cards or archive intentionally".to_string()),
                object_id: Some(board_id.clone()),
                result_id: None,
                error: None,
            },
        }
    }
}

fn normalize_key(value: &str) -> String {
    value.trim().to_lowercase()
}

fn normalize_channel_key(value: &str) -> String {
    normalize_key(value.trim_start_matches('#'))
}

fn project_name(project: &HulyProject) -> String {
    project.name.clone().unwrap_or_else(|| {
        project
            .identifier
            .clone()
            .unwrap_or_else(|| project.id.clone())
    })
}

fn channel_name(channel: &HulyChannel) -> String {
    channel
        .name
        .clone()
        .or_else(|| channel.title.clone())
        .unwrap_or_else(|| channel.id.clone())
}

fn board_name(board: &HulyBoard) -> String {
    board.name.clone().unwrap_or_else(|| board.id.clone())
}

fn canonical_project_target(name: &str) -> Option<ProjectTargetKey> {
    match normalize_key(name).as_str() {
        "heyza" | "heyzack-ai" | "heyzack ai" | "axtech" => Some(ProjectTargetKey::Axtech),
        "tirak" | "tirak-app" => Some(ProjectTargetKey::TirakApp),
        "vibra" | "vibrasonix" => Some(ProjectTargetKey::Vibrasonix),
        "tuya clients" => Some(ProjectTargetKey::TuyaClients),
        "oasis r&d" | "oasis rnd" | "oasis r and d" => Some(ProjectTargetKey::OasisRnd),
        "internal ops" => Some(ProjectTargetKey::InternalOps),
        _ => None,
    }
}

fn issue_title(issue: &HulyIssue) -> String {
    issue
        .title
        .clone()
        .unwrap_or_else(|| issue.identifier.clone().unwrap_or_else(|| issue.id.clone()))
}

fn issue_text(issue: &HulyIssue) -> String {
    format!(
        "{} {} {}",
        issue.identifier.clone().unwrap_or_default(),
        issue.title.clone().unwrap_or_default(),
        issue.description.clone().unwrap_or_default()
    )
    .to_lowercase()
}

fn classify_issue_target(issue: &HulyIssue) -> Option<(ProjectTargetKey, String)> {
    let text = issue_text(issue);

    let find_keyword = |needles: &[&str]| -> Option<String> {
        needles
            .iter()
            .find(|needle| text.contains(**needle))
            .map(|needle| (*needle).to_string())
    };

    if let Some(keyword) = find_keyword(&["tuya"]) {
        return Some((
            ProjectTargetKey::TuyaClients,
            format!("Matched Tuya keyword `{keyword}`"),
        ));
    }

    if let Some(keyword) = find_keyword(&["oasis", "r&d", "r and d", "rnd", "research"]) {
        return Some((
            ProjectTargetKey::OasisRnd,
            format!("Matched R&D keyword `{keyword}`"),
        ));
    }

    if let Some(keyword) = find_keyword(&["axtech", "heyza"]) {
        return Some((
            ProjectTargetKey::Axtech,
            format!("Matched Axtech keyword `{keyword}`"),
        ));
    }

    if let Some(keyword) = find_keyword(&[
        "internal",
        "teamforge",
        "thoughtseed",
        "clockify",
        "huly",
        "workflow",
        "process",
        "ops",
        "readme",
        "documentation",
        "docs",
    ]) {
        return Some((
            ProjectTargetKey::InternalOps,
            format!("Matched internal-ops keyword `{keyword}`"),
        ));
    }

    None
}

fn choose_project_template(projects: &[HulyProject]) -> Option<&HulyProject> {
    let preferred = ["HEYZA", "Axtech", "TIRAK", "VIBRA", "Vibrasonix"];
    for preferred_name in preferred {
        if let Some(project) = projects.iter().find(|project| {
            normalize_key(&project_name(project)) == normalize_key(preferred_name)
                && project.r#type.is_some()
        }) {
            return Some(project);
        }
    }

    projects
        .iter()
        .find(|project| project.r#type.is_some() && !project.archived.unwrap_or(false))
}

fn build_project_create_attributes(
    template: &HulyProject,
    target: ProjectTargetKey,
    actor_account_id: &str,
) -> Result<serde_json::Value, String> {
    let project_type = template
        .r#type
        .clone()
        .ok_or_else(|| "project template is missing a project type".to_string())?;

    let owners = template
        .owners
        .clone()
        .filter(|owners| !owners.is_empty())
        .unwrap_or_else(|| vec![actor_account_id.to_string()]);

    let mut attributes = json!({
        "name": target.display_name(),
        "description": format!("Thoughtseed delivery stream for {}", target.display_name()),
        "private": template.private.unwrap_or(false),
        "members": Vec::<String>::new(),
        "owners": owners,
        "archived": false,
        "autoJoin": template.auto_join.unwrap_or(false),
        "identifier": target.identifier().unwrap_or("TSK"),
        "sequence": 0,
        "type": project_type,
        "defaultIssueStatus": template.default_issue_status.clone().unwrap_or_default(),
        "defaultTimeReportDay": template
            .default_time_report_day
            .clone()
            .unwrap_or_else(|| json!("PreviousWorkDay")),
    });

    if let Some(default_assignee) = &template.default_assignee {
        attributes["defaultAssignee"] = json!(default_assignee);
    }
    if let Some(icon) = &template.icon {
        attributes["icon"] = json!(icon);
    }
    if let Some(color) = &template.color {
        attributes["color"] = color.clone();
    }

    Ok(attributes)
}

fn build_snapshot_summary(
    snapshot: &WorkspaceNormalizationSnapshotData,
) -> HulyWorkspaceNormalizationSnapshot {
    let duplicate_people_count = {
        let mut counts: HashMap<String, usize> = HashMap::new();
        for person in &snapshot.persons {
            if let Some(name) = person
                .name
                .as_ref()
                .filter(|value| !value.trim().is_empty())
            {
                *counts.entry(normalize_key(name)).or_default() += 1;
            }
        }
        counts.values().filter(|count| **count > 1).count() as u32
    };

    let untitled_document_count = snapshot
        .documents
        .iter()
        .filter(|document| {
            document
                .title
                .as_ref()
                .map(|title| {
                    let normalized = normalize_key(title);
                    normalized.is_empty() || normalized == "untitled"
                })
                .unwrap_or(true)
        })
        .count() as u32;

    HulyWorkspaceNormalizationSnapshot {
        project_count: snapshot.projects.len() as u32,
        issue_count: snapshot.issues.len() as u32,
        department_count: snapshot.departments.len() as u32,
        channel_count: snapshot.channels.len() as u32,
        employee_count: snapshot.employees.len() as u32,
        duplicate_people_count,
        untitled_document_count,
        board_count: snapshot.boards.len() as u32,
    }
}

async fn load_workspace_normalization_snapshot(
    client: &HulyClient,
) -> Result<WorkspaceNormalizationSnapshotData, String> {
    let (
        account,
        projects,
        issues,
        departments,
        channels,
        employees,
        persons,
        documents,
        boards,
        board_cards,
    ) = tokio::try_join!(
        client.get_account_info(),
        client.get_projects(),
        client.get_issues(None),
        client.get_departments(),
        client.get_channels(),
        client.get_employees(),
        client.get_persons(),
        client.get_documents(),
        client.get_boards(),
        client.get_board_cards(),
    )?;

    Ok(WorkspaceNormalizationSnapshotData {
        account,
        projects,
        issues,
        departments,
        channels,
        employees,
        persons,
        documents,
        boards,
        board_cards,
    })
}

fn build_workspace_normalization_plan(
    snapshot: &WorkspaceNormalizationSnapshotData,
) -> (Vec<WorkspaceNormalizationOperation>, Vec<String>) {
    let mut operations = Vec::new();
    let mut warnings = Vec::new();

    let projects_by_normalized_name: HashMap<String, &HulyProject> = snapshot
        .projects
        .iter()
        .map(|project| (normalize_key(&project_name(project)), project))
        .collect();

    for (legacy_name, target) in [
        ("HEYZA", ProjectTargetKey::Axtech),
        ("Heyzack-AI", ProjectTargetKey::Axtech),
        ("TIRAK", ProjectTargetKey::TirakApp),
        ("VIBRA", ProjectTargetKey::Vibrasonix),
    ] {
        let legacy = projects_by_normalized_name
            .get(&normalize_key(legacy_name))
            .copied();
        let target_existing = projects_by_normalized_name
            .get(&normalize_key(target.display_name()))
            .copied();

        match (legacy, target_existing) {
            (Some(legacy_project), Some(target_project))
                if legacy_project.id != target_project.id =>
            {
                warnings.push(format!(
                    "Both legacy project `{legacy_name}` and target `{}` exist; leaving rename manual.",
                    target.display_name()
                ));
            }
            (Some(legacy_project), None) => {
                operations.push(WorkspaceNormalizationOperation::RenameProject {
                    project_id: legacy_project.id.clone(),
                    from_name: project_name(legacy_project),
                    to: target,
                })
            }
            _ => {}
        }
    }

    for target in [
        ProjectTargetKey::TuyaClients,
        ProjectTargetKey::OasisRnd,
        ProjectTargetKey::InternalOps,
    ] {
        if !projects_by_normalized_name.contains_key(&normalize_key(target.display_name())) {
            operations.push(WorkspaceNormalizationOperation::CreateProject { target });
        }
    }

    let project_name_by_id: HashMap<String, String> = snapshot
        .projects
        .iter()
        .map(|project| (project.id.clone(), project_name(project)))
        .collect();

    for issue in &snapshot.issues {
        let current_project_name = issue
            .space
            .as_ref()
            .and_then(|space| project_name_by_id.get(space))
            .cloned();
        let current_target = current_project_name
            .as_deref()
            .and_then(canonical_project_target);

        match classify_issue_target(issue) {
            Some((target, reason))
                if current_project_name.is_some()
                    && issue.space.is_some()
                    && current_target != Some(target) =>
            {
                operations.push(WorkspaceNormalizationOperation::MoveIssue {
                    issue_id: issue.id.clone(),
                    issue_title: issue_title(issue),
                    from_project_name: current_project_name.clone(),
                    from_project_id: issue.space.clone(),
                    to: target,
                    reason,
                });
            }
            Some((target, _reason)) if current_target == Some(target) => {}
            Some((_target, reason)) => {
                operations.push(WorkspaceNormalizationOperation::ManualIssueReview {
                    issue_id: issue.id.clone(),
                    issue_title: issue_title(issue),
                    current_project_name,
                    reason: format!("{reason}; issue is missing a current project reference"),
                });
            }
            None if current_target.is_some() => {}
            None if current_project_name.is_some() => {
                operations.push(WorkspaceNormalizationOperation::ManualIssueReview {
                    issue_id: issue.id.clone(),
                    issue_title: issue_title(issue),
                    current_project_name,
                    reason: "No safe project target could be inferred from the issue text"
                        .to_string(),
                });
            }
            None => {}
        }
    }

    let department_names: HashSet<String> = snapshot
        .departments
        .iter()
        .filter_map(|department| department.name.as_ref())
        .map(|value| normalize_key(value))
        .collect();

    for name in ["Engineering", "Marketing", "Leadership"] {
        if !department_names.contains(&normalize_key(name)) {
            operations.push(WorkspaceNormalizationOperation::CreateDepartment { name });
        }
    }

    let active_employee_count = snapshot
        .employees
        .iter()
        .filter(|employee| employee.active.unwrap_or(true))
        .count();
    if active_employee_count > 0 {
        operations.push(WorkspaceNormalizationOperation::ManualDepartmentReview {
            employee_count: active_employee_count,
            reason:
                "Department member and team-lead mapping is not derivable from repo state alone"
                    .to_string(),
        });
    }

    let channel_names: HashSet<String> = snapshot
        .channels
        .iter()
        .map(channel_name)
        .map(|value| normalize_channel_key(&value))
        .collect();

    for (name, description, topic) in [
        (
            "standups",
            "Daily standup updates and async check-ins.",
            "Daily standup updates and async check-ins.",
        ),
        (
            "axtech",
            "Axtech delivery coordination and client-specific updates.",
            "Axtech delivery coordination and client-specific updates.",
        ),
        (
            "tuya-clients",
            "Tuya client delivery stream, integrations, and blockers.",
            "Tuya client delivery stream, integrations, and blockers.",
        ),
        (
            "research-rnd",
            "OASIS and R&D experiments, research notes, and prototypes.",
            "OASIS and R&D experiments, research notes, and prototypes.",
        ),
        (
            "tech-resources",
            "Shared technical resources, snippets, and implementation references.",
            "Shared technical resources, snippets, and implementation references.",
        ),
        (
            "blockers-urgent",
            "Escalate critical blockers that need fast cross-team attention.",
            "Escalate critical blockers that need fast cross-team attention.",
        ),
        (
            "training-questions",
            "Training support, onboarding questions, and learning requests.",
            "Training support, onboarding questions, and learning requests.",
        ),
    ] {
        if !channel_names.contains(&normalize_channel_key(name)) {
            operations.push(WorkspaceNormalizationOperation::CreateChannel {
                name,
                description,
                topic,
            });
        }
    }

    let mut people_by_name: HashMap<String, Vec<&HulyPerson>> = HashMap::new();
    for person in &snapshot.persons {
        if let Some(name) = person
            .name
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            people_by_name
                .entry(normalize_key(name))
                .or_default()
                .push(person);
        }
    }
    if let Some(records) = people_by_name.get(&normalize_key("Akshay Balraj")) {
        if records.len() > 1 {
            operations.push(WorkspaceNormalizationOperation::ManualDuplicatePerson {
                display_name: "Akshay Balraj".to_string(),
                person_ids: records.iter().map(|person| person.id.clone()).collect(),
            });
        }
    }

    for document in &snapshot.documents {
        let normalized_title = document
            .title
            .as_ref()
            .map(|title| normalize_key(title))
            .unwrap_or_default();
        if normalized_title.is_empty() || normalized_title == "untitled" {
            operations.push(WorkspaceNormalizationOperation::ManualDocumentReview {
                document_id: document.id.clone(),
                title: document.title.clone(),
                has_content: document
                    .content
                    .as_ref()
                    .map(|content| !content.trim().is_empty())
                    .unwrap_or(false),
            });
        }
    }

    let board_card_counts: HashMap<String, usize> = snapshot
        .board_cards
        .iter()
        .filter_map(|card| card.space.as_ref().map(|space| space.clone()))
        .fold(HashMap::new(), |mut acc, board_id| {
            *acc.entry(board_id).or_default() += 1;
            acc
        });

    for board in &snapshot.boards {
        let board_label = board_name(board);
        if snapshot.boards.len() == 1 || normalize_key(&board_label) == "default" {
            let card_count = board_card_counts
                .get(&board.id)
                .copied()
                .unwrap_or_default();
            if !board.archived.unwrap_or(false) && card_count == 0 {
                operations.push(WorkspaceNormalizationOperation::ArchiveBoard {
                    board_id: board.id.clone(),
                    board_name: board_label,
                });
            } else {
                operations.push(WorkspaceNormalizationOperation::ManualBoardReview {
                    board_id: board.id.clone(),
                    board_name: board_label,
                    card_count,
                });
            }
        }
    }

    (operations, warnings)
}

fn mark_action_success(
    actions: &mut [HulyWorkspaceNormalizationAction],
    index: usize,
    result_id: Option<String>,
) {
    if let Some(action) = actions.get_mut(index) {
        action.applied = true;
        action.result_id = result_id;
        action.error = None;
    }
}

fn mark_action_error(
    actions: &mut [HulyWorkspaceNormalizationAction],
    index: usize,
    error: String,
) {
    if let Some(action) = actions.get_mut(index) {
        action.applied = false;
        action.error = Some(error);
    }
}

async fn execute_workspace_normalization(
    client: &HulyClient,
    snapshot: &WorkspaceNormalizationSnapshotData,
    operations: &[WorkspaceNormalizationOperation],
    actions: &mut [HulyWorkspaceNormalizationAction],
) -> Vec<String> {
    let mut warnings = Vec::new();
    let actor_account_id = match snapshot.account.uuid.clone() {
        Some(value) if !value.is_empty() => value,
        _ => {
            warnings.push(
                "Current Huly account is missing a uuid, so live mutations were skipped."
                    .to_string(),
            );
            return warnings;
        }
    };
    let actor_social_id = snapshot
        .account
        .primary_social_id
        .clone()
        .filter(|value| !value.is_empty())
        .or_else(|| {
            snapshot
                .account
                .social_ids
                .as_ref()
                .and_then(|ids| ids.iter().find(|value| !value.is_empty()).cloned())
        });
    let actor_social_id = match actor_social_id {
        Some(value) => value,
        None => {
            warnings.push(
                "Current Huly account is missing a primary social id, so live mutations were skipped."
                    .to_string(),
            );
            return warnings;
        }
    };

    let project_template = choose_project_template(&snapshot.projects).cloned();
    let mut target_project_ids: HashMap<ProjectTargetKey, String> = HashMap::new();

    for project in &snapshot.projects {
        if let Some(target) = canonical_project_target(&project_name(project)) {
            target_project_ids.insert(target, project.id.clone());
        }
    }

    for (index, operation) in operations.iter().enumerate() {
        match operation {
            WorkspaceNormalizationOperation::RenameProject { project_id, to, .. } => {
                match client
                    .update_doc(
                        &actor_social_id,
                        HULY_PROJECT_CLASS,
                        CORE_SPACE_SPACE,
                        project_id,
                        json!({ "name": to.display_name() }),
                        Some(false),
                    )
                    .await
                {
                    Ok(_) => {
                        target_project_ids.insert(*to, project_id.clone());
                        mark_action_success(actions, index, Some(project_id.clone()));
                    }
                    Err(error) => mark_action_error(actions, index, error),
                }
            }
            WorkspaceNormalizationOperation::CreateProject { target } => {
                let template = match project_template.as_ref() {
                    Some(template) => template,
                    None => {
                        mark_action_error(
                            actions,
                            index,
                            "No existing Huly project was available as a creation template."
                                .to_string(),
                        );
                        continue;
                    }
                };

                let attributes =
                    match build_project_create_attributes(template, *target, &actor_account_id) {
                        Ok(attributes) => attributes,
                        Err(error) => {
                            mark_action_error(actions, index, error);
                            continue;
                        }
                    };

                match client
                    .create_doc(
                        &actor_social_id,
                        HULY_PROJECT_CLASS,
                        CORE_SPACE_SPACE,
                        attributes,
                        None,
                    )
                    .await
                {
                    Ok(result_id) => {
                        target_project_ids.insert(*target, result_id.clone());
                        mark_action_success(actions, index, Some(result_id));
                    }
                    Err(error) => mark_action_error(actions, index, error),
                }
            }
            WorkspaceNormalizationOperation::CreateDepartment { name } => {
                match client
                    .create_doc(
                        &actor_social_id,
                        HULY_DEPARTMENT_CLASS,
                        CORE_SPACE_WORKSPACE,
                        json!({
                            "name": name,
                            "description": "",
                            "parent": HR_HEAD_DEPARTMENT_ID,
                            "members": Vec::<String>::new(),
                            "teamLead": Value::Null,
                            "managers": Vec::<String>::new(),
                        }),
                        None,
                    )
                    .await
                {
                    Ok(result_id) => mark_action_success(actions, index, Some(result_id)),
                    Err(error) => mark_action_error(actions, index, error),
                }
            }
            WorkspaceNormalizationOperation::CreateChannel {
                name,
                description,
                topic,
            } => {
                match client
                    .create_doc(
                        &actor_social_id,
                        HULY_CHANNEL_CLASS,
                        CORE_SPACE_SPACE,
                        json!({
                            "name": name,
                            "description": description,
                            "private": false,
                            "archived": false,
                            "members": vec![actor_account_id.clone()],
                            "topic": topic,
                            "owners": vec![actor_account_id.clone()],
                            "autoJoin": true,
                        }),
                        None,
                    )
                    .await
                {
                    Ok(result_id) => mark_action_success(actions, index, Some(result_id)),
                    Err(error) => mark_action_error(actions, index, error),
                }
            }
            WorkspaceNormalizationOperation::ArchiveBoard { board_id, .. } => {
                match client
                    .update_doc(
                        &actor_social_id,
                        HULY_BOARD_CLASS,
                        CORE_SPACE_SPACE,
                        board_id,
                        json!({ "archived": true }),
                        Some(false),
                    )
                    .await
                {
                    Ok(_) => mark_action_success(actions, index, Some(board_id.clone())),
                    Err(error) => mark_action_error(actions, index, error),
                }
            }
            _ => {}
        }
    }

    if operations
        .iter()
        .any(|operation| matches!(operation, WorkspaceNormalizationOperation::MoveIssue { .. }))
    {
        match client.get_projects().await {
            Ok(projects) => {
                for project in projects {
                    if let Some(target) = canonical_project_target(&project_name(&project)) {
                        target_project_ids.insert(target, project.id.clone());
                    }
                }
            }
            Err(error) => warnings.push(format!(
                "Could not refresh projects after project mutations: {error}"
            )),
        }
    }

    for (index, operation) in operations.iter().enumerate() {
        if let WorkspaceNormalizationOperation::MoveIssue {
            issue_id,
            from_project_id,
            to,
            ..
        } = operation
        {
            let Some(current_project_id) = from_project_id.as_ref() else {
                mark_action_error(
                    actions,
                    index,
                    "Issue is missing its current project reference.".to_string(),
                );
                continue;
            };
            let Some(target_project_id) = target_project_ids.get(to) else {
                mark_action_error(
                    actions,
                    index,
                    format!(
                        "Target project `{}` does not exist after project normalization.",
                        to.display_name()
                    ),
                );
                continue;
            };
            if current_project_id == target_project_id {
                mark_action_success(actions, index, Some(issue_id.clone()));
                continue;
            }

            match client
                .update_doc(
                    &actor_social_id,
                    HULY_ISSUE_CLASS,
                    current_project_id,
                    issue_id,
                    json!({ "space": target_project_id }),
                    Some(false),
                )
                .await
            {
                Ok(_) => mark_action_success(actions, index, Some(issue_id.clone())),
                Err(error) => mark_action_error(actions, index, error),
            }
        }
    }

    warnings
}

pub async fn run_huly_workspace_normalization(
    pool: &sqlx::SqlitePool,
    dry_run: bool,
) -> Result<HulyWorkspaceNormalizationReport, String> {
    let client = get_huly_client(pool).await?;
    let snapshot = load_workspace_normalization_snapshot(&client).await?;
    let snapshot_summary = build_snapshot_summary(&snapshot);
    let (operations, mut warnings) = build_workspace_normalization_plan(&snapshot);
    let mut actions: Vec<HulyWorkspaceNormalizationAction> = operations
        .iter()
        .map(WorkspaceNormalizationOperation::to_action)
        .collect();

    if !dry_run {
        warnings.extend(
            execute_workspace_normalization(&client, &snapshot, &operations, &mut actions).await,
        );
    }

    let applied_count = actions.iter().filter(|action| action.applied).count() as u32;
    let pending_safe_count = actions
        .iter()
        .filter(|action| action.safe_to_apply && !action.applied)
        .count() as u32;
    let manual_review_count = actions
        .iter()
        .filter(|action| !action.safe_to_apply)
        .count() as u32;

    Ok(HulyWorkspaceNormalizationReport {
        dry_run,
        workspace_id: client.workspace_id().to_string(),
        actor_email: snapshot.account.email.clone(),
        snapshot: snapshot_summary,
        applied_count,
        pending_safe_count,
        manual_review_count,
        warnings,
        actions,
    })
}

#[tauri::command]
pub async fn preview_huly_workspace_normalization(
    db: State<'_, DbPool>,
) -> Result<HulyWorkspaceNormalizationReport, String> {
    run_huly_workspace_normalization(&db.0, true).await
}

#[tauri::command]
pub async fn apply_huly_workspace_normalization(
    db: State<'_, DbPool>,
) -> Result<HulyWorkspaceNormalizationReport, String> {
    run_huly_workspace_normalization(&db.0, false).await
}

/// Format a millisecond epoch timestamp to ISO date string.
fn ms_to_date_string(ms: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(ms).map(|dt| dt.format("%Y-%m-%d").to_string())
}

/// Format a millisecond epoch timestamp to ISO datetime string.
fn ms_to_datetime_string(ms: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(ms).map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn sanitize_required_text(label: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        Err(format!("{label} is required"))
    } else {
        Ok(trimmed.to_string())
    }
}

fn sanitize_iso_date(label: &str, value: &str) -> Result<String, String> {
    let trimmed = value.trim();
    NaiveDate::parse_from_str(trimmed, "%Y-%m-%d")
        .map_err(|_| format!("{label} must use YYYY-MM-DD"))?;
    Ok(trimmed.to_string())
}

fn validate_manual_leave_date_order(date_from: &str, date_to: &str) -> Result<(), String> {
    let from = NaiveDate::parse_from_str(date_from, "%Y-%m-%d")
        .map_err(|_| "Leave start date must use YYYY-MM-DD".to_string())?;
    let to = NaiveDate::parse_from_str(date_to, "%Y-%m-%d")
        .map_err(|_| "Leave end date must use YYYY-MM-DD".to_string())?;

    if to < from {
        Err("Leave end date cannot be before the start date".to_string())
    } else {
        Ok(())
    }
}

fn calculate_leave_days(date_from: &str, date_to: &str) -> u32 {
    match (
        NaiveDate::parse_from_str(date_from, "%Y-%m-%d"),
        NaiveDate::parse_from_str(date_to, "%Y-%m-%d"),
    ) {
        (Ok(from), Ok(to)) => (to.signed_duration_since(from).num_days().max(1)) as u32,
        _ => 0,
    }
}

fn generate_manual_id(prefix: &str) -> String {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_nanos())
        .unwrap_or_default();
    format!("{prefix}-{nanos}")
}

fn sort_leave_views(views: &mut [LeaveView]) {
    views.sort_by(|left, right| {
        left.date_from
            .cmp(&right.date_from)
            .then(left.employee_name.cmp(&right.employee_name))
            .then(left.id.cmp(&right.id))
    });
}

fn sort_holiday_views(views: &mut [HolidayView]) {
    views.sort_by(|left, right| {
        left.date
            .cmp(&right.date)
            .then(left.title.cmp(&right.title))
            .then(left.id.cmp(&right.id))
    });
}

// ─── Milestones ────────────────────────────────────────────────

#[tauri::command]
pub async fn get_milestones(db: State<'_, DbPool>) -> Result<Vec<MilestoneView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let milestones = client.get_milestones().await.unwrap_or_default();
    let issues = client.get_issues(None).await.unwrap_or_default();

    let mut views = Vec::with_capacity(milestones.len());
    for ms in &milestones {
        // Count issues belonging to this milestone by matching the milestone's space
        let milestone_issues: Vec<_> = issues
            .iter()
            .filter(|i| i.space.as_deref() == ms.space.as_deref() && ms.space.is_some())
            .collect();

        let total = milestone_issues.len() as u32;
        let completed = milestone_issues
            .iter()
            .filter(|i| {
                i.status
                    .as_ref()
                    .and_then(|v| v.as_str())
                    .map(|s| {
                        s.contains("Done") || s.contains("Canceled") || s.contains("Cancelled")
                    })
                    .unwrap_or(false)
            })
            .count() as u32;

        let progress = if total > 0 {
            (completed as f64 / total as f64) * 100.0
        } else {
            0.0
        };

        views.push(MilestoneView {
            id: ms.id.clone(),
            label: ms.label.clone().unwrap_or_else(|| "Unnamed".to_string()),
            status: ms.status.clone().unwrap_or_else(|| "unknown".to_string()),
            target_date: ms.target_date.and_then(ms_to_date_string),
            total_issues: total,
            completed_issues: completed,
            progress_percent: progress,
            project_name: ms.space.clone(),
        });
    }
    Ok(views)
}

// ─── Time discrepancies ────────────────────────────────────────

#[tauri::command]
pub async fn get_time_discrepancies(db: State<'_, DbPool>) -> Result<Vec<TimeDiscrepancy>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    // Fetch Huly time reports for this month
    let now = Local::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();

    let reports = client
        .get_time_reports(Some(month_start))
        .await
        .unwrap_or_default();

    // Group Huly hours by employee ref
    let mut huly_hours: HashMap<String, f64> = HashMap::new();
    for r in &reports {
        if let Some(emp) = &r.employee {
            let hours = r.value.unwrap_or(0.0);
            *huly_hours.entry(emp.clone()).or_default() += hours;
        }
    }

    // Get employees and their Clockify hours this month
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let month_start_str = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let month_end_str = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1)
    }
    .unwrap()
    .format("%Y-%m-%d")
    .to_string();

    let mut discrepancies = Vec::new();
    for emp in employees.iter().filter(|e| e.is_active) {
        let huly_h = emp
            .huly_person_id
            .as_ref()
            .and_then(|pid| huly_hours.get(pid))
            .copied()
            .unwrap_or(0.0);

        // Clockify hours from local DB
        let row: (f64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
             FROM time_entries
             WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
        )
        .bind(&emp.id)
        .bind(&month_start_str)
        .bind(&month_end_str)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

        let clockify_h = row.0;
        let diff = huly_h - clockify_h;
        let diff_pct = if clockify_h > 0.0 {
            (diff / clockify_h) * 100.0
        } else if huly_h > 0.0 {
            100.0
        } else {
            0.0
        };

        // Only include if there's meaningful data
        if huly_h > 0.0 || clockify_h > 0.0 {
            discrepancies.push(TimeDiscrepancy {
                employee_name: emp.name.clone(),
                huly_hours: huly_h,
                clockify_hours: clockify_h,
                difference_hours: diff,
                difference_percent: diff_pct,
            });
        }
    }
    Ok(discrepancies)
}

// ─── Estimation accuracy ───────────────────────────────────────

#[tauri::command]
pub async fn get_estimation_accuracy(
    db: State<'_, DbPool>,
) -> Result<Vec<EstimationAccuracy>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let issues = client.get_issues(None).await.unwrap_or_default();
    let time_reports = client.get_time_reports(None).await.unwrap_or_default();

    // Sum actual time per issue from time reports
    let mut actual_per_issue: HashMap<String, f64> = HashMap::new();
    for r in &time_reports {
        if let Some(issue_ref) = &r.attached_to {
            let hours = r.value.unwrap_or(0.0);
            *actual_per_issue.entry(issue_ref.clone()).or_default() += hours;
        }
    }

    // Group by assignee
    struct AccumData {
        total_issues: u32,
        total_estimated: f64,
        total_actual: f64,
    }
    let mut per_assignee: HashMap<String, AccumData> = HashMap::new();

    for issue in &issues {
        // Only consider issues with both estimation and actual time
        let estimation_hours = match issue.estimation {
            Some(est) if est > 0 => est as f64 / 3600000.0, // ms to hours
            _ => continue,
        };
        let actual_hours = match actual_per_issue.get(&issue.id) {
            Some(&h) if h > 0.0 => h,
            _ => continue,
        };
        let assignee = match &issue.assignee {
            Some(a) => a.clone(),
            None => continue,
        };

        let entry = per_assignee.entry(assignee).or_insert(AccumData {
            total_issues: 0,
            total_estimated: 0.0,
            total_actual: 0.0,
        });
        entry.total_issues += 1;
        entry.total_estimated += estimation_hours;
        entry.total_actual += actual_hours;
    }

    // Map assignee refs to names via employees
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let emp_map: HashMap<String, String> = employees
        .iter()
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    let mut results = Vec::new();
    for (assignee, data) in per_assignee {
        let name = emp_map
            .get(&assignee)
            .cloned()
            .unwrap_or_else(|| assignee.clone());

        let avg_est = data.total_estimated / data.total_issues as f64;
        let avg_act = data.total_actual / data.total_issues as f64;
        let accuracy = if avg_est > 0.0 {
            (avg_act / avg_est) * 100.0
        } else {
            0.0
        };

        results.push(EstimationAccuracy {
            employee_name: name,
            total_issues: data.total_issues,
            avg_estimated_hours: avg_est,
            avg_actual_hours: avg_act,
            accuracy_percent: accuracy,
            chronic_under_estimator: accuracy > 120.0,
        });
    }
    Ok(results)
}

// ─── Priority distribution ─────────────────────────────────────

#[tauri::command]
pub async fn get_priority_distribution(
    db: State<'_, DbPool>,
) -> Result<Vec<PriorityDistribution>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let issues = client.get_issues(None).await.unwrap_or_default();

    // Map priority values: 0=Urgent, 1=High, 2=Medium, 3=Low
    fn priority_label(val: &serde_json::Value) -> String {
        let num = val
            .as_i64()
            .or_else(|| val.as_str().and_then(|s| s.parse().ok()));
        match num {
            Some(0) => "Urgent".to_string(),
            Some(1) => "High".to_string(),
            Some(2) => "Medium".to_string(),
            Some(3) => "Low".to_string(),
            _ => val
                .as_str()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "Unknown".to_string()),
        }
    }

    struct PriCount {
        count: u32,
        assigned: u32,
        unassigned: u32,
    }
    let mut dist: HashMap<String, PriCount> = HashMap::new();

    for issue in &issues {
        let label = issue
            .priority
            .as_ref()
            .map(priority_label)
            .unwrap_or_else(|| "No Priority".to_string());

        let entry = dist.entry(label).or_insert(PriCount {
            count: 0,
            assigned: 0,
            unassigned: 0,
        });
        entry.count += 1;
        if issue.assignee.is_some() {
            entry.assigned += 1;
        } else {
            entry.unassigned += 1;
        }
    }

    // Sort by priority order
    let order = ["Urgent", "High", "Medium", "Low", "No Priority", "Unknown"];
    let mut results: Vec<PriorityDistribution> = dist
        .into_iter()
        .map(|(priority, c)| PriorityDistribution {
            priority,
            count: c.count,
            assigned_count: c.assigned,
            unassigned_count: c.unassigned,
        })
        .collect();

    results.sort_by_key(|p| order.iter().position(|&o| o == p.priority).unwrap_or(99));

    Ok(results)
}

// ─── Departments ───────────────────────────────────────────────

async fn build_department_views(
    pool: &sqlx::SqlitePool,
    departments: &[HulyDepartment],
    employees: &[Employee],
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> Vec<DepartmentView> {
    let ignored_person_ids =
        ignored_org_person_ids(employees, ignored_emails, ignored_employee_ids);

    let emp_map: HashMap<String, &Employee> = employees
        .iter()
        .filter(|employee| {
            employee.is_active
                && !employee_is_ignored(employee, ignored_emails, ignored_employee_ids)
        })
        .filter_map(|employee| {
            employee
                .huly_person_id
                .as_ref()
                .map(|person_id| (person_id.clone(), employee))
        })
        .collect();

    let mut views = Vec::with_capacity(departments.len());
    for dept in departments {
        let members = dept.members.as_deref().unwrap_or(&[]);
        let visible_members: Vec<&String> = members
            .iter()
            .filter(|person_id| !ignored_person_ids.contains(*person_id))
            .collect();
        let member_count = visible_members.len() as u32;

        let head_name = dept
            .head
            .as_ref()
            .filter(|person_id| !ignored_person_ids.contains(*person_id))
            .and_then(|person_id| emp_map.get(person_id))
            .map(|employee| employee.name.clone());

        let mut total_hours = 0.0;
        let mut quota_total = 0.0;
        for person_id in visible_members {
            if let Some(emp) = emp_map.get(person_id.as_str()) {
                quota_total += emp.monthly_quota_hours;
                let now = Local::now();
                let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
                    .unwrap()
                    .format("%Y-%m-%d")
                    .to_string();
                let month_end = if now.month() == 12 {
                    NaiveDate::from_ymd_opt(now.year() + 1, 1, 1)
                } else {
                    NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1)
                }
                .unwrap()
                .format("%Y-%m-%d")
                .to_string();

                if let Ok((hours,)) = sqlx::query_as::<_, (f64,)>(
                    "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0 FROM time_entries WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
                )
                .bind(&emp.id)
                .bind(&month_start)
                .bind(&month_end)
                .fetch_one(pool)
                .await
                {
                    total_hours += hours;
                }
            }
        }

        views.push(DepartmentView {
            id: dept.id.clone(),
            name: dept.name.clone().unwrap_or_else(|| "Unnamed".to_string()),
            head_name,
            member_count,
            total_hours,
            quota_total,
        });
    }

    views
}

fn build_leave_views(
    requests: &[HulyLeaveRequest],
    employees: &[Employee],
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> Vec<LeaveView> {
    let ignored_person_ids =
        ignored_org_person_ids(employees, ignored_emails, ignored_employee_ids);

    let emp_map: HashMap<String, String> = employees
        .iter()
        .filter(|employee| {
            employee.is_active
                && !employee_is_ignored(employee, ignored_emails, ignored_employee_ids)
        })
        .filter_map(|employee| {
            employee
                .huly_person_id
                .as_ref()
                .map(|person_id| (person_id.clone(), employee.name.clone()))
        })
        .collect();

    let mut views = Vec::with_capacity(requests.len());
    for req in requests {
        if req
            .employee
            .as_ref()
            .map(|person_id| ignored_person_ids.contains(person_id))
            .unwrap_or(false)
        {
            continue;
        }

        let emp_name = req
            .employee
            .as_ref()
            .and_then(|person_id| emp_map.get(person_id))
            .cloned()
            .unwrap_or_else(|| {
                req.employee
                    .clone()
                    .unwrap_or_else(|| "Unknown".to_string())
            });

        let from_str = req
            .date_from
            .and_then(ms_to_date_string)
            .unwrap_or_default();
        let to_str = req.date_to.and_then(ms_to_date_string).unwrap_or_default();

        let days = match (req.date_from, req.date_to) {
            (Some(f), Some(t)) => ((t - f) / 86_400_000).max(1) as u32,
            _ => 0,
        };

        views.push(LeaveView {
            id: req.id.clone(),
            employee_id: req.employee.clone(),
            source: "huly".to_string(),
            editable: false,
            employee_name: emp_name,
            leave_type: req.r#type.clone().unwrap_or_else(|| "Unknown".to_string()),
            date_from: from_str,
            date_to: to_str,
            status: req.status.clone().unwrap_or_else(|| "Unknown".to_string()),
            days,
            note: None,
        });
    }

    views
}

fn build_holiday_views(holidays: &[HulyHoliday]) -> Vec<HolidayView> {
    holidays
        .iter()
        .map(|holiday| HolidayView {
            id: holiday.id.clone(),
            source: "huly".to_string(),
            editable: false,
            title: holiday
                .title
                .clone()
                .unwrap_or_else(|| "Untitled".to_string()),
            date: holiday.date.and_then(ms_to_date_string).unwrap_or_default(),
            note: None,
        })
        .collect()
}

fn build_manual_leave_views(
    entries: &[ManualLeaveEntry],
    employees: &[Employee],
    ignored_emails: &HashSet<String>,
    ignored_employee_ids: &HashSet<String>,
) -> Vec<LeaveView> {
    let employee_map: HashMap<String, &Employee> = employees
        .iter()
        .map(|employee| (employee.id.clone(), employee))
        .collect();

    let mut views = Vec::with_capacity(entries.len());
    for entry in entries {
        if let Some(employee) = employee_map.get(&entry.employee_id) {
            if employee_is_ignored(employee, ignored_emails, ignored_employee_ids) {
                continue;
            }
        }

        let employee_name = employee_map
            .get(&entry.employee_id)
            .map(|employee| employee.name.clone())
            .unwrap_or_else(|| entry.employee_id.clone());

        views.push(LeaveView {
            id: entry.id.clone(),
            employee_id: Some(entry.employee_id.clone()),
            source: "manual".to_string(),
            editable: true,
            employee_name,
            leave_type: entry.leave_type.clone(),
            date_from: entry.date_from.clone(),
            date_to: entry.date_to.clone(),
            status: entry.status.clone(),
            days: calculate_leave_days(&entry.date_from, &entry.date_to),
            note: entry.note.clone(),
        });
    }

    views
}

fn build_manual_holiday_views(entries: &[ManualHoliday]) -> Vec<HolidayView> {
    entries
        .iter()
        .map(|holiday| HolidayView {
            id: holiday.id.clone(),
            source: "manual".to_string(),
            editable: true,
            title: holiday.title.clone(),
            date: holiday.date.clone(),
            note: holiday.note.clone(),
        })
        .collect()
}

async fn build_team_snapshot_from_cache(
    pool: &sqlx::SqlitePool,
    huly_error: Option<String>,
) -> Result<TeamSnapshotView, String> {
    let ignored_emails = load_ignored_clockify_emails(pool).await?;
    let ignored_employee_ids = load_ignored_clockify_employee_ids(pool).await?;
    let db_employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let departments = queries::get_huly_departments_cache(pool).await?;
    let persons = queries::get_huly_people_cache(pool).await?;
    let huly_employees = queries::get_huly_employees_cache(pool).await?;
    let leave_requests = queries::get_huly_leave_requests_cache(pool).await?;
    let holidays = queries::get_huly_holidays_cache(pool).await?;
    let manual_leave_entries = queries::get_manual_leave_entries(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;
    let manual_holidays = queries::get_manual_holidays(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;
    let cache_updated_at = queries::get_sync_state(pool, "huly", "team_snapshot")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .map(|state| state.last_sync_at);

    let department_views = build_department_views(
        pool,
        &departments,
        &db_employees,
        &ignored_emails,
        &ignored_employee_ids,
    )
    .await;

    let org_chart = if departments.is_empty() && persons.is_empty() && huly_employees.is_empty() {
        None
    } else {
        Some(build_org_chart_view(
            departments,
            persons,
            huly_employees,
            db_employees.clone(),
            &ignored_emails,
            &ignored_employee_ids,
        ))
    };

    let mut leave_views = build_leave_views(
        &leave_requests,
        &db_employees,
        &ignored_emails,
        &ignored_employee_ids,
    );
    leave_views.extend(build_manual_leave_views(
        &manual_leave_entries,
        &db_employees,
        &ignored_emails,
        &ignored_employee_ids,
    ));
    sort_leave_views(&mut leave_views);

    let mut holiday_views = build_holiday_views(&holidays);
    holiday_views.extend(build_manual_holiday_views(&manual_holidays));
    sort_holiday_views(&mut holiday_views);

    Ok(TeamSnapshotView {
        departments: department_views,
        org_chart,
        leaves: leave_views,
        holidays: holiday_views,
        cache_updated_at,
        huly_error,
    })
}

#[tauri::command]
pub async fn get_team_snapshot(db: State<'_, DbPool>) -> Result<TeamSnapshotView, String> {
    build_team_snapshot_from_cache(&db.0, None).await
}

#[tauri::command]
pub async fn refresh_team_snapshot(db: State<'_, DbPool>) -> Result<TeamSnapshotView, String> {
    let pool = &db.0;
    let token = queries::get_setting(pool, "huly_token")
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let refresh_error = match token {
        Some(token) if !token.trim().is_empty() => match HulyClient::connect(None, &token).await {
            Ok(client) => {
                let engine = HulySyncEngine::new(Arc::new(client), pool.clone());
                engine.sync_team_cache().await.err()
            }
            Err(error) => Some(error),
        },
        _ => Some("Huly token not configured".to_string()),
    };

    build_team_snapshot_from_cache(pool, refresh_error).await
}

#[tauri::command]
pub async fn get_org_chart(db: State<'_, DbPool>) -> Result<OrgChartView, String> {
    let pool = &db.0;
    let client = get_huly_client(pool).await?;

    let (departments, persons, huly_employees) = tokio::join!(
        client.get_departments(),
        client.get_persons(),
        client.get_employees(),
    );

    let departments = departments?;
    let persons = persons?;
    let huly_employees = huly_employees?;
    let db_employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;
    let ignored_emails = load_ignored_clockify_emails(pool).await?;
    let ignored_employee_ids = load_ignored_clockify_employee_ids(pool).await?;

    Ok(build_org_chart_view(
        departments,
        persons,
        huly_employees,
        db_employees,
        &ignored_emails,
        &ignored_employee_ids,
    ))
}

#[tauri::command]
pub async fn apply_org_chart_mapping(
    db: State<'_, DbPool>,
    mappings: Vec<OrgDepartmentUpdateInput>,
) -> Result<String, String> {
    if mappings.is_empty() {
        return Err("No department mappings were provided".to_string());
    }

    let pool = &db.0;
    let client = get_huly_client(pool).await?;
    let account = client.get_account_info().await?;
    let actor_social_id = resolve_huly_actor_social_id(&account)
        .ok_or_else(|| "Current Huly account is missing a usable social id".to_string())?;

    let current_departments = client.get_departments().await?;
    let known_department_ids: HashSet<String> = current_departments
        .iter()
        .map(|department| department.id.clone())
        .collect();

    let sanitized_mappings: Vec<OrgDepartmentUpdateInput> = mappings
        .iter()
        .map(sanitize_org_department_update)
        .collect();

    validate_unique_department_membership(&sanitized_mappings)?;

    for mapping in &sanitized_mappings {
        if !known_department_ids.contains(&mapping.department_id) {
            return Err(format!("Unknown department id: {}", mapping.department_id));
        }
    }

    for mapping in &sanitized_mappings {
        client
            .update_doc(
                &actor_social_id,
                HULY_DEPARTMENT_CLASS,
                CORE_SPACE_WORKSPACE,
                &mapping.department_id,
                json!({
                    "members": mapping.member_person_ids,
                    "head": mapping.head_person_id,
                    "teamLead": mapping.team_lead_person_id,
                }),
                Some(false),
            )
            .await?;
    }

    let engine = HulySyncEngine::new(Arc::new(client), pool.clone());
    engine.sync_team_cache().await?;

    Ok(format!(
        "Updated {} department mappings in Huly and refreshed the Team cache",
        sanitized_mappings.len()
    ))
}

#[tauri::command]
pub async fn get_departments(db: State<'_, DbPool>) -> Result<Vec<DepartmentView>, String> {
    Ok(build_team_snapshot_from_cache(&db.0, None)
        .await?
        .departments)
}

// ─── Leave requests ────────────────────────────────────────────

#[tauri::command]
pub async fn get_leave_requests(db: State<'_, DbPool>) -> Result<Vec<LeaveView>, String> {
    Ok(build_team_snapshot_from_cache(&db.0, None).await?.leaves)
}

// ─── Holidays ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_holidays(db: State<'_, DbPool>) -> Result<Vec<HolidayView>, String> {
    Ok(build_team_snapshot_from_cache(&db.0, None).await?.holidays)
}

#[tauri::command]
pub async fn save_manual_leave(
    db: State<'_, DbPool>,
    input: ManualLeaveInput,
) -> Result<TeamSnapshotView, String> {
    let pool = &db.0;
    let id = normalize_optional_text(input.id);
    let employee_id = sanitize_required_text("Employee", &input.employee_id)?;
    let leave_type = sanitize_required_text("Leave type", &input.leave_type)?;
    let date_from = sanitize_iso_date("Leave start date", &input.date_from)?;
    let date_to = sanitize_iso_date("Leave end date", &input.date_to)?;
    let status = sanitize_required_text("Leave status", &input.status)?;
    let note = normalize_optional_text(input.note);

    validate_manual_leave_date_order(&date_from, &date_to)?;

    let employee = queries::get_employee_by_id(pool, &employee_id)
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| format!("Unknown employee id: {employee_id}"))?;

    let ignored_emails = load_ignored_clockify_emails(pool).await?;
    let ignored_employee_ids = load_ignored_clockify_employee_ids(pool).await?;
    if employee_is_ignored(&employee, &ignored_emails, &ignored_employee_ids) {
        return Err(format!(
            "{} is excluded from Team views and cannot be used for manual leave tracking.",
            employee.name
        ));
    }

    let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let created_at = if let Some(existing_id) = id.as_ref() {
        queries::get_manual_leave_entries(pool)
            .await
            .map_err(|e| format!("db error: {e}"))?
            .into_iter()
            .find(|entry| entry.id == *existing_id)
            .map(|entry| entry.created_at)
            .unwrap_or_else(|| now.clone())
    } else {
        now.clone()
    };

    let entry = ManualLeaveEntry {
        id: id.unwrap_or_else(|| generate_manual_id("manual-leave")),
        employee_id,
        leave_type,
        date_from,
        date_to,
        status,
        note,
        created_at,
        updated_at: now,
    };

    queries::upsert_manual_leave_entry(pool, &entry)
        .await
        .map_err(|e| format!("save manual leave entry: {e}"))?;

    build_team_snapshot_from_cache(pool, None).await
}

#[tauri::command]
pub async fn delete_manual_leave(
    db: State<'_, DbPool>,
    id: String,
) -> Result<TeamSnapshotView, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Manual leave id is required".to_string());
    }

    queries::delete_manual_leave_entry(&db.0, trimmed)
        .await
        .map_err(|e| format!("delete manual leave entry: {e}"))?;

    build_team_snapshot_from_cache(&db.0, None).await
}

#[tauri::command]
pub async fn save_manual_holiday(
    db: State<'_, DbPool>,
    input: ManualHolidayInput,
) -> Result<TeamSnapshotView, String> {
    let pool = &db.0;
    let id = normalize_optional_text(input.id);
    let title = sanitize_required_text("Holiday title", &input.title)?;
    let date = sanitize_iso_date("Holiday date", &input.date)?;
    let note = normalize_optional_text(input.note);
    let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
    let created_at = if let Some(existing_id) = id.as_ref() {
        queries::get_manual_holidays(pool)
            .await
            .map_err(|e| format!("db error: {e}"))?
            .into_iter()
            .find(|holiday| holiday.id == *existing_id)
            .map(|holiday| holiday.created_at)
            .unwrap_or_else(|| now.clone())
    } else {
        now.clone()
    };

    let holiday = ManualHoliday {
        id: id.unwrap_or_else(|| generate_manual_id("manual-holiday")),
        title,
        date,
        note,
        created_at,
        updated_at: now,
    };

    queries::upsert_manual_holiday(pool, &holiday)
        .await
        .map_err(|e| format!("save manual holiday: {e}"))?;

    build_team_snapshot_from_cache(pool, None).await
}

#[tauri::command]
pub async fn delete_manual_holiday(
    db: State<'_, DbPool>,
    id: String,
) -> Result<TeamSnapshotView, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Manual holiday id is required".to_string());
    }

    queries::delete_manual_holiday(&db.0, trimmed)
        .await
        .map_err(|e| format!("delete manual holiday: {e}"))?;

    build_team_snapshot_from_cache(&db.0, None).await
}

// ─── Chat activity ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_chat_activity(db: State<'_, DbPool>) -> Result<Vec<ChatActivityView>, String> {
    let pool = &db.0;
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let huly_person_to_employee: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    let employee_name_by_id: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .map(|employee| (employee.id.clone(), employee.name.clone()))
        .collect();

    let mut per_user: HashMap<String, ChatActivityAccum> = HashMap::new();

    if let Ok(client) = get_huly_client(pool).await {
        let seven_days_ago = Utc::now()
            .checked_sub_signed(chrono::Duration::days(7))
            .unwrap_or_else(Utc::now)
            .timestamp_millis();

        let messages = client
            .get_chat_messages(Some(seven_days_ago))
            .await
            .unwrap_or_default();

        for msg in &messages {
            let Some(creator) = &msg.created_by else {
                continue;
            };
            let Some(employee_name) = huly_person_to_employee.get(creator) else {
                continue;
            };

            add_chat_activity(
                &mut per_user,
                employee_name,
                msg.attached_to
                    .clone()
                    .unwrap_or_else(|| "huly:unknown-channel".to_string()),
                msg.created_on,
                "Huly",
            );
        }
    }

    let mut slack_live_synced = false;
    if let Some(client) = get_optional_slack_client(pool).await? {
        slack_live_synced = true;
        let channel_filters = queries::get_setting(pool, "slack_channel_filters")
            .await
            .map_err(|e| format!("read slack_channel_filters: {e}"))?
            .unwrap_or_default();

        let channels = filter_slack_channels(
            client.list_channels().await.unwrap_or_default(),
            &channel_filters,
        );
        let users = client.list_users().await.unwrap_or_default();
        let slack_user_to_employee_id =
            resolve_slack_user_employee_ids(pool, &employees, &users).await?;

        let oldest_ts = format!(
            "{}.000000",
            Utc::now()
                .checked_sub_signed(chrono::Duration::days(7))
                .unwrap_or_else(Utc::now)
                .timestamp()
        );

        for channel in channels {
            let channel_id = channel.id.clone();
            let messages = client
                .get_channel_messages_since(&channel_id, &oldest_ts)
                .await
                .unwrap_or_default();

            for message in messages {
                if message.bot_id.is_some() || message.subtype.as_deref() == Some("bot_message") {
                    continue;
                }

                let slack_user_id = message.user.as_deref();
                let mapped_employee_id = slack_user_id
                    .and_then(|id| slack_user_to_employee_id.get(id))
                    .cloned();
                let mapped_employee_name = mapped_employee_id
                    .as_ref()
                    .and_then(|id| employee_name_by_id.get(id));

                if let Err(error) = persist_slack_message_activity(
                    pool,
                    &channel_id,
                    slack_user_id,
                    mapped_employee_id.as_deref(),
                    &message,
                )
                .await
                {
                    eprintln!("[commands] warning: {error}");
                }

                let Some(employee_name) = mapped_employee_name else {
                    continue;
                };

                add_chat_activity(
                    &mut per_user,
                    employee_name,
                    channel_id.clone(),
                    slack_ts_to_millis(&message.ts),
                    "Slack",
                );
            }
        }
    }

    if !slack_live_synced {
        let seven_days_ago_ms = Utc::now()
            .checked_sub_signed(chrono::Duration::days(7))
            .unwrap_or_else(Utc::now)
            .timestamp_millis();
        if let Ok(persisted_rows) =
            queries::get_slack_message_activity_since(pool, seven_days_ago_ms).await
        {
            for row in persisted_rows {
                let Some(employee_id) = row.employee_id.as_ref() else {
                    continue;
                };
                let Some(employee_name) = employee_name_by_id.get(employee_id) else {
                    continue;
                };

                add_chat_activity(
                    &mut per_user,
                    employee_name,
                    row.slack_channel_id.clone(),
                    row.message_ts_ms,
                    "Slack",
                );
            }
        }
    }

    let mut results: Vec<ChatActivityView> = per_user
        .into_iter()
        .map(|(employee_name, data)| {
            let mut sources: Vec<String> = data.sources.into_iter().collect();
            sources.sort();
            ChatActivityView {
                employee_name,
                message_count: data.count,
                channels_active: data.channels.len() as u32,
                last_message_at: data.last_at_ms.and_then(ms_to_datetime_string),
                sources,
            }
        })
        .collect();

    results.sort_by(|a, b| b.message_count.cmp(&a.message_count));
    Ok(results)
}

// ─── Board cards ───────────────────────────────────────────────

#[tauri::command]
pub async fn get_board_cards(db: State<'_, DbPool>) -> Result<Vec<BoardCardView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let cards = client.get_board_cards().await.unwrap_or_default();
    let now_ms = Utc::now().timestamp_millis();

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let emp_map: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    Ok(cards
        .iter()
        .map(|c| {
            let status_str = c
                .status
                .as_ref()
                .map(|v| v.as_str().unwrap_or(&v.to_string()).to_string())
                .unwrap_or_else(|| "Unknown".to_string());

            let days = c
                .modified_on
                .map(|ts| ((now_ms - ts) / 86_400_000).max(0) as u32)
                .unwrap_or(0);

            let assignee_name = c.assignee.as_ref().and_then(|a| emp_map.get(a)).cloned();

            BoardCardView {
                id: c.id.clone(),
                title: c.title.clone().unwrap_or_else(|| "Untitled".to_string()),
                status: status_str,
                assignee_name,
                days_in_status: days,
                board_name: c.space.clone(),
            }
        })
        .collect())
}

// ─── Meeting load ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_meeting_load(db: State<'_, DbPool>) -> Result<Vec<MeetingLoadView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let events = client.get_calendar_events().await.unwrap_or_default();

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let emp_map: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    // Filter to this week's events
    let now = Local::now();
    let today = now.date_naive();
    let weekday_num = today.weekday().num_days_from_monday();
    let week_start = today - chrono::Duration::days(weekday_num as i64);
    let week_end = week_start + chrono::Duration::days(7);
    let week_start_ms = week_start
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();
    let week_end_ms = week_end
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();

    // Group meeting hours by participant
    struct MeetAccum {
        meetings: u32,
        total_hours: f64,
    }
    let mut per_participant: HashMap<String, MeetAccum> = HashMap::new();

    for event in &events {
        let start = match event.date {
            Some(ts) if ts >= week_start_ms && ts < week_end_ms => ts,
            _ => continue,
        };
        let end = event.due_date.unwrap_or(start);
        let duration_hours = ((end - start) as f64) / 3_600_000.0;
        let duration_hours = duration_hours.max(0.0);

        // Add to each participant
        if let Some(participants) = &event.participants {
            for p in participants {
                let entry = per_participant.entry(p.clone()).or_insert(MeetAccum {
                    meetings: 0,
                    total_hours: 0.0,
                });
                entry.meetings += 1;
                entry.total_hours += duration_hours;
            }
        }
        // Also credit the creator
        if let Some(creator) = &event.created_by {
            if event
                .participants
                .as_ref()
                .map_or(true, |ps| !ps.contains(creator))
            {
                let entry = per_participant.entry(creator.clone()).or_insert(MeetAccum {
                    meetings: 0,
                    total_hours: 0.0,
                });
                entry.meetings += 1;
                entry.total_hours += duration_hours;
            }
        }
    }

    // Cross-reference with Clockify work hours this week
    let week_start_str = week_start.format("%Y-%m-%d").to_string();
    let week_end_str = week_end.format("%Y-%m-%d").to_string();

    let mut results = Vec::new();
    for (person_ref, meet_data) in per_participant {
        let name = emp_map
            .get(&person_ref)
            .cloned()
            .unwrap_or_else(|| person_ref.clone());

        // Find employee ID for Clockify lookup
        let work_hours = employees
            .iter()
            .find(|e| e.huly_person_id.as_deref() == Some(&person_ref))
            .map(|e| e.id.clone());

        let work_h = if let Some(eid) = work_hours {
            sqlx::query_as::<_, (f64,)>(
                "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0 FROM time_entries WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
            )
            .bind(&eid)
            .bind(&week_start_str)
            .bind(&week_end_str)
            .fetch_one(pool)
            .await
            .map(|r| r.0)
            .unwrap_or(0.0)
        } else {
            0.0
        };

        let total = meet_data.total_hours + work_h;
        let ratio = if total > 0.0 {
            meet_data.total_hours / total
        } else {
            0.0
        };

        results.push(MeetingLoadView {
            employee_name: name,
            meetings_this_week: meet_data.meetings,
            total_meeting_hours: meet_data.total_hours,
            work_hours: work_h,
            meeting_ratio: ratio,
        });
    }

    results.sort_by(|a, b| {
        b.meeting_ratio
            .partial_cmp(&a.meeting_ratio)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    Ok(results)
}

#[tauri::command]
pub async fn get_employee_summary(
    db: State<'_, DbPool>,
    employee_id: String,
) -> Result<EmployeeSummaryView, String> {
    let pool = &db.0;
    let employee_id = employee_id.trim();
    if employee_id.is_empty() {
        return Err("Employee id is required".to_string());
    }

    let employee = queries::get_employee_by_id(pool, employee_id)
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| format!("Unknown employee id: {employee_id}"))?;

    let ignored_emails = load_ignored_clockify_emails(pool).await?;
    let ignored_employee_ids = load_ignored_clockify_employee_ids(pool).await?;
    if !employee.is_active || employee_is_ignored(&employee, &ignored_emails, &ignored_employee_ids)
    {
        return Err(format!(
            "{} is excluded from Team views and cannot be loaded.",
            employee.name
        ));
    }
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let snapshot = build_team_snapshot_from_cache(pool, None).await?;
    let today = Local::now().date_naive();
    let weekday_num = today.weekday().num_days_from_monday();
    let week_start = today - chrono::Duration::days(weekday_num as i64);
    let week_end = week_start + chrono::Duration::days(7);
    let month_start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();
    let month_end = next_month_start(today);
    let week_start_str = week_start.format("%Y-%m-%d").to_string();
    let week_end_str = week_end.format("%Y-%m-%d").to_string();
    let month_start_str = month_start.format("%Y-%m-%d").to_string();
    let month_end_str = month_end.format("%Y-%m-%d").to_string();

    let work_hours_this_week =
        query_hours_for_range(pool, &employee.id, &week_start_str, &week_end_str).await?;
    let work_hours_this_month =
        query_hours_for_range(pool, &employee.id, &month_start_str, &month_end_str).await?;

    let mut department_names = Vec::new();
    let mut role_labels = Vec::new();
    if let (Some(org_chart), Some(person_id)) = (
        snapshot.org_chart.as_ref(),
        employee.huly_person_id.as_ref(),
    ) {
        for department in &org_chart.departments {
            if department
                .member_person_ids
                .iter()
                .any(|member_person_id| member_person_id == person_id)
            {
                department_names.push(department.name.clone());
            }
            if department.head_person_id.as_deref() == Some(person_id.as_str()) {
                role_labels.push(format!("Head · {}", department.name));
            }
            if department.team_lead_person_id.as_deref() == Some(person_id.as_str()) {
                role_labels.push(format!("Team Lead · {}", department.name));
            }
        }
    }
    department_names.sort();
    department_names.dedup();
    role_labels.sort();
    role_labels.dedup();

    let current_leave = snapshot
        .leaves
        .iter()
        .filter(|leave| leave.employee_id.as_deref() == Some(employee.id.as_str()))
        .filter(|leave| leave.status.to_lowercase() != "rejected")
        .find(|leave| leave_is_active_on(leave, today))
        .cloned();

    let mut upcoming_leaves: Vec<LeaveView> = snapshot
        .leaves
        .iter()
        .filter(|leave| leave.employee_id.as_deref() == Some(employee.id.as_str()))
        .filter(|leave| leave.status.to_lowercase() != "rejected")
        .filter(|leave| leave_starts_on_or_after(leave, today))
        .cloned()
        .collect();
    upcoming_leaves.sort_by(|left, right| left.date_from.cmp(&right.date_from));
    upcoming_leaves.truncate(3);

    let mut meetings_this_week = 0;
    let mut meeting_hours_this_week = 0.0;
    let mut upcoming_events = Vec::new();
    let mut messages_last_7_days = 0;
    let mut standups_last_7_days = 0;
    let mut last_message_at_ms: Option<i64> = None;
    let mut last_standup_at_ms: Option<i64> = None;

    if let Ok(client) = get_huly_client(pool).await {
        let seven_days_ago = Utc::now()
            .checked_sub_signed(chrono::Duration::days(7))
            .unwrap_or_else(Utc::now)
            .timestamp_millis();
        let week_start_ms = week_start
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis();
        let week_end_ms = week_end
            .and_hms_opt(0, 0, 0)
            .unwrap()
            .and_utc()
            .timestamp_millis();
        let now_ms = Utc::now().timestamp_millis();

        let (channels, messages, events) = tokio::join!(
            client.get_channels(),
            client.get_chat_messages(Some(seven_days_ago)),
            client.get_calendar_events(),
        );

        let standup_channel_ids: HashSet<String> = channels
            .unwrap_or_default()
            .into_iter()
            .filter(|channel| {
                huly_channel_display_name(channel)
                    .map(|label| is_standup_label(&label))
                    .unwrap_or(false)
            })
            .map(|channel| channel.id)
            .collect();

        if let Some(person_id) = employee.huly_person_id.as_ref() {
            for message in messages.unwrap_or_default() {
                if message.created_by.as_deref() != Some(person_id.as_str()) {
                    continue;
                }

                messages_last_7_days += 1;
                if let Some(timestamp_ms) = message.created_on.or(message.modified_on) {
                    last_message_at_ms = Some(
                        last_message_at_ms
                            .map_or(timestamp_ms, |current| current.max(timestamp_ms)),
                    );
                    if message
                        .attached_to
                        .as_ref()
                        .map(|channel_id| standup_channel_ids.contains(channel_id))
                        .unwrap_or(false)
                    {
                        standups_last_7_days += 1;
                        last_standup_at_ms = Some(
                            last_standup_at_ms
                                .map_or(timestamp_ms, |current| current.max(timestamp_ms)),
                        );
                    }
                }
            }

            for event in events
                .unwrap_or_default()
                .into_iter()
                .filter(|event| employee_matches_calendar_event(event, person_id))
            {
                let Some(start_ms) = event.date else {
                    continue;
                };

                let end_ms = event.due_date.unwrap_or(start_ms);
                let duration_hours = ((end_ms - start_ms) as f64 / 3_600_000.0).max(0.0);

                if start_ms >= week_start_ms && start_ms < week_end_ms {
                    meetings_this_week += 1;
                    meeting_hours_this_week += duration_hours;
                }

                if end_ms >= now_ms {
                    let Some(starts_at) = ms_to_datetime_string(start_ms) else {
                        continue;
                    };

                    upcoming_events.push(EmployeeScheduleEventView {
                        id: event.id,
                        title: event.title.unwrap_or_else(|| "Untitled event".to_string()),
                        starts_at,
                        ends_at: event.due_date.and_then(ms_to_datetime_string),
                        source: "Huly".to_string(),
                        space: event.space,
                    });
                }
            }
        }
    }

    if let Some(client) = get_optional_slack_client(pool).await? {
        let channel_filters = queries::get_setting(pool, "slack_channel_filters")
            .await
            .map_err(|e| format!("read slack_channel_filters: {e}"))?
            .unwrap_or_default();
        let channels = filter_slack_channels(
            client.list_channels().await.unwrap_or_default(),
            &channel_filters,
        );
        let standup_channel_ids: HashSet<String> = channels
            .iter()
            .filter(|channel| {
                channel
                    .name
                    .as_deref()
                    .map(is_standup_label)
                    .unwrap_or(false)
            })
            .map(|channel| channel.id.clone())
            .collect();
        let users = client.list_users().await.unwrap_or_default();
        let mut slack_user_ids: HashSet<String> =
            queries::get_identity_external_ids_for_employee(pool, "slack", &employee.id)
                .await
                .map_err(|e| format!("load slack identity ids: {e}"))?
                .into_iter()
                .collect();
        if slack_user_ids.is_empty() {
            let slack_user_to_employee_id =
                resolve_slack_user_employee_ids(pool, &employees, &users).await?;
            slack_user_ids = slack_user_to_employee_id
                .iter()
                .filter_map(|(user_id, employee_id)| {
                    if employee_id == &employee.id {
                        Some(user_id.clone())
                    } else {
                        None
                    }
                })
                .collect();
        }

        if !slack_user_ids.is_empty() {
            let oldest_ts = format!(
                "{}.000000",
                Utc::now()
                    .checked_sub_signed(chrono::Duration::days(7))
                    .unwrap_or_else(Utc::now)
                    .timestamp()
            );

            for channel in channels {
                let is_standup_channel = standup_channel_ids.contains(&channel.id);
                for message in client
                    .get_channel_messages_since(&channel.id, &oldest_ts)
                    .await
                    .unwrap_or_default()
                {
                    if message.bot_id.is_some() || message.subtype.as_deref() == Some("bot_message")
                    {
                        continue;
                    }

                    let slack_user_id = message.user.as_deref();
                    let mapped_employee_id = slack_user_id
                        .filter(|user_id| slack_user_ids.contains(*user_id))
                        .map(|_| employee.id.clone());
                    if let Err(error) = persist_slack_message_activity(
                        pool,
                        &channel.id,
                        slack_user_id,
                        mapped_employee_id.as_deref(),
                        &message,
                    )
                    .await
                    {
                        eprintln!("[commands] warning: {error}");
                    }
                    if mapped_employee_id.is_none() {
                        continue;
                    }

                    messages_last_7_days += 1;
                    if let Some(timestamp_ms) = slack_ts_to_millis(&message.ts) {
                        last_message_at_ms = Some(
                            last_message_at_ms
                                .map_or(timestamp_ms, |current| current.max(timestamp_ms)),
                        );
                        if is_standup_channel {
                            standups_last_7_days += 1;
                            last_standup_at_ms = Some(
                                last_standup_at_ms
                                    .map_or(timestamp_ms, |current| current.max(timestamp_ms)),
                            );
                        }
                    }
                }
            }
        }
    }

    upcoming_events.sort_by(|left, right| left.starts_at.cmp(&right.starts_at));
    upcoming_events.truncate(5);

    Ok(EmployeeSummaryView {
        employee,
        department_names,
        role_labels,
        work_hours_this_week,
        work_hours_this_month,
        meetings_this_week,
        meeting_hours_this_week,
        standups_last_7_days,
        last_standup_at: last_standup_at_ms.and_then(ms_to_datetime_string),
        messages_last_7_days,
        last_message_at: last_message_at_ms.and_then(ms_to_datetime_string),
        current_leave,
        upcoming_leaves,
        upcoming_events,
    })
}

// ─── Naming convention (#13) ──────────────────────────────────

use crate::huly::naming::{compute_compliance_stats, parse_task_name, NamingComplianceStats};

#[tauri::command]
pub async fn get_naming_compliance(db: State<'_, DbPool>) -> Result<NamingComplianceStats, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(compute_compliance_stats(&[])),
    };

    let issues = client.get_issues(None).await.unwrap_or_default();
    let titles: Vec<String> = issues.iter().filter_map(|i| i.title.clone()).collect();

    Ok(compute_compliance_stats(&titles))
}

#[tauri::command]
pub async fn get_issues_with_naming(
    db: State<'_, DbPool>,
) -> Result<Vec<serde_json::Value>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let issues = client.get_issues(None).await.unwrap_or_default();
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let emp_map: HashMap<String, String> = employees
        .iter()
        .filter(|e| e.is_active)
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    let results = issues
        .iter()
        .map(|issue| {
            let title = issue.title.as_deref().unwrap_or("");
            let parsed = parse_task_name(title);
            let assignee_name = issue
                .assignee
                .as_ref()
                .and_then(|a| emp_map.get(a))
                .cloned();
            json!({
                "id": issue.id,
                "identifier": issue.identifier,
                "title": title,
                "naming": parsed,
                "assignee_name": assignee_name,
                "space": issue.space,
                "priority": issue.priority,
                "status": issue.status,
            })
        })
        .collect();

    Ok(results)
}

// ─── Standup system (#10) ──────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandupEntry {
    pub employee_name: String,
    pub posted_at: Option<String>,
    pub channel: String,
    pub source: String,
    pub content_preview: Option<String>,
    pub status: String, // "posted" | "missing"
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StandupReport {
    pub date: String,
    pub total_team: u32,
    pub posted_count: u32,
    pub missing_count: u32,
    pub compliance_percent: f64,
    pub entries: Vec<StandupEntry>,
}

#[tauri::command]
pub async fn get_standup_report(db: State<'_, DbPool>) -> Result<StandupReport, String> {
    let pool = &db.0;
    let today = Local::now().date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;
    let active_employees: Vec<&Employee> = employees.iter().filter(|e| e.is_active).collect();
    let total_team = active_employees.len() as u32;

    // Map huly person id → employee name
    let huly_person_to_name: HashMap<String, String> = active_employees
        .iter()
        .filter_map(|e| {
            e.huly_person_id
                .as_ref()
                .map(|pid| (pid.clone(), e.name.clone()))
        })
        .collect();

    // Map employee name → posted entry
    let mut posted: HashMap<String, StandupEntry> = HashMap::new();

    // Today's start in ms
    let today_start_ms = today
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();

    // Query Huly Chunter standup channels
    if let Ok(client) = get_huly_client(pool).await {
        let channels = client.get_channels().await.unwrap_or_default();
        let standup_channels: Vec<_> = channels
            .iter()
            .filter(|c| {
                huly_channel_display_name(c)
                    .map(|label| is_standup_label(&label))
                    .unwrap_or(false)
            })
            .collect();

        let messages = client
            .get_chat_messages(Some(today_start_ms))
            .await
            .unwrap_or_default();

        for msg in &messages {
            let Some(creator) = &msg.created_by else {
                continue;
            };
            let Some(name) = huly_person_to_name.get(creator) else {
                continue;
            };

            let in_standup = msg
                .attached_to
                .as_ref()
                .map(|ch_id| standup_channels.iter().any(|c| &c.id == ch_id))
                .unwrap_or(false);

            if !in_standup {
                continue;
            }

            let channel_name = msg
                .attached_to
                .as_ref()
                .and_then(|ch_id| standup_channels.iter().find(|c| &c.id == ch_id))
                .and_then(|c| huly_channel_display_name(c))
                .unwrap_or_else(|| "standup".to_string());

            posted.entry(name.clone()).or_insert_with(|| StandupEntry {
                employee_name: name.clone(),
                posted_at: msg
                    .created_on
                    .or(msg.modified_on)
                    .and_then(ms_to_datetime_string),
                channel: channel_name,
                source: "huly".to_string(),
                content_preview: msg.content.as_ref().map(|c| c.chars().take(120).collect()),
                status: "posted".to_string(),
            });
        }
    }

    // Query Slack standup channels
    if let Ok(Some(slack_client)) = get_optional_slack_client(pool).await {
        let channel_filters = queries::get_setting(pool, "slack_channel_filters")
            .await
            .unwrap_or_default()
            .unwrap_or_default();
        let channels = filter_slack_channels(
            slack_client.list_channels().await.unwrap_or_default(),
            &channel_filters,
        );
        let standup_channels: Vec<_> = channels
            .iter()
            .filter(|c| c.name.as_deref().map(is_standup_label).unwrap_or(false))
            .collect();

        let oldest_ts = format!(
            "{}.000000",
            today.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp()
        );
        let users = slack_client.list_users().await.unwrap_or_default();
        let slack_user_to_employee_id = resolve_slack_user_employee_ids(pool, &employees, &users)
            .await
            .unwrap_or_default();
        let active_employee_name_by_id: HashMap<String, String> = active_employees
            .iter()
            .map(|employee| (employee.id.clone(), employee.name.clone()))
            .collect();

        for channel in &standup_channels {
            let channel_name = channel
                .name
                .clone()
                .unwrap_or_else(|| "standup".to_string());
            for msg in slack_client
                .get_channel_messages_since(&channel.id, &oldest_ts)
                .await
                .unwrap_or_default()
            {
                if msg.bot_id.is_some() {
                    continue;
                }
                let slack_user_id = msg.user.as_deref();
                let mapped_employee_id = slack_user_id
                    .and_then(|uid| slack_user_to_employee_id.get(uid))
                    .cloned();
                let mapped_name = mapped_employee_id
                    .as_ref()
                    .and_then(|employee_id| active_employee_name_by_id.get(employee_id));
                if let Err(error) = persist_slack_message_activity(
                    pool,
                    &channel.id,
                    slack_user_id,
                    mapped_employee_id.as_deref(),
                    &msg,
                )
                .await
                {
                    eprintln!("[commands] warning: {error}");
                }
                let Some(name) = mapped_name else {
                    continue;
                };

                posted.entry(name.clone()).or_insert_with(|| StandupEntry {
                    employee_name: name.clone(),
                    posted_at: slack_ts_to_millis(&msg.ts).and_then(ms_to_datetime_string),
                    channel: channel_name.clone(),
                    source: "slack".to_string(),
                    content_preview: msg.text.as_ref().map(|t| t.chars().take(120).collect()),
                    status: "posted".to_string(),
                });
            }
        }
    }

    // Build full entries including missing
    let mut entries: Vec<StandupEntry> = active_employees
        .iter()
        .map(|e| {
            posted
                .get(&e.name)
                .cloned()
                .unwrap_or_else(|| StandupEntry {
                    employee_name: e.name.clone(),
                    posted_at: None,
                    channel: String::new(),
                    source: String::new(),
                    content_preview: None,
                    status: "missing".to_string(),
                })
        })
        .collect();

    entries.sort_by(|a, b| {
        let a_order = if a.status == "posted" { 0 } else { 1 };
        let b_order = if b.status == "posted" { 0 } else { 1 };
        a_order
            .cmp(&b_order)
            .then(a.employee_name.cmp(&b.employee_name))
    });

    let posted_count = entries.iter().filter(|e| e.status == "posted").count() as u32;
    let missing_count = total_team - posted_count;
    let compliance_percent = if total_team > 0 {
        (posted_count as f64 / total_team as f64) * 100.0
    } else {
        0.0
    };

    Ok(StandupReport {
        date: today_str,
        total_team,
        posted_count,
        missing_count,
        compliance_percent,
        entries,
    })
}

// ── P2 Dashboard Command Stubs ───────────────────────────────────

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientView {
    pub id: String,
    pub name: String,
    pub tier: String,
    pub industry: Option<String>,
    pub month_billable_hours: f64,
    pub active_projects: u32,
    pub planning_source: String,
    pub github_projects: u32,
    pub github_open_issues: u32,
    pub github_total_issues: u32,
    pub primary_contact: Option<String>,
    pub contract_status: String,
    pub contract_end_date: Option<String>,
    pub days_remaining: Option<i32>,
    pub latest_activity_at: Option<String>,
    pub tech_stack: Vec<String>,
    pub drive_link: Option<String>,
    pub chrome_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetailView {
    pub client: ClientView,
    pub linked_projects: Vec<ClientLinkedProjectView>,
    pub linked_devices: Vec<ClientLinkedDeviceView>,
    pub resources: Vec<ClientResourceView>,
    pub recent_activity: Vec<ActivityItem>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientLinkedProjectView {
    pub id: String,
    pub name: String,
    pub status: String,
    pub source: String,
    pub repo: Option<String>,
    pub open_issues: u32,
    pub total_issues: u32,
    pub source_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientLinkedDeviceView {
    pub id: String,
    pub name: String,
    pub platform: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientResourceView {
    pub name: String,
    pub r#type: String,
    pub url: Option<String>,
}

fn slugify_client_name(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut previous_was_separator = false;

    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
            previous_was_separator = false;
        } else if !previous_was_separator {
            slug.push('_');
            previous_was_separator = true;
        }
    }

    let trimmed = slug.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "client".to_string()
    } else {
        trimmed
    }
}

fn parse_csv_values(csv: Option<String>) -> Vec<String> {
    csv.unwrap_or_default()
        .split(',')
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| value.to_string())
        .collect()
}

fn parse_datetime_flexible(value: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|dt| dt.with_timezone(&Utc))
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .map(|dt| chrono::DateTime::from_naive_utc_and_offset(dt, Utc))
        })
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
                .map(|dt| chrono::DateTime::from_naive_utc_and_offset(dt, Utc))
        })
        .ok()
}

fn most_recent_datetime(left: Option<String>, right: Option<String>) -> Option<String> {
    match (left, right) {
        (None, None) => None,
        (Some(value), None) | (None, Some(value)) => Some(value),
        (Some(left), Some(right)) => {
            let left_parsed = parse_datetime_flexible(&left);
            let right_parsed = parse_datetime_flexible(&right);
            match (left_parsed, right_parsed) {
                (Some(left_dt), Some(right_dt)) if right_dt > left_dt => Some(right),
                (Some(_), Some(_)) => Some(left),
                _ if right > left => Some(right),
                _ => Some(left),
            }
        }
    }
}

fn merge_planning_source(existing: &str, incoming: &str) -> String {
    if existing == incoming {
        return existing.to_string();
    }
    if existing.contains(incoming) {
        return existing.to_string();
    }
    if incoming.contains(existing) {
        return incoming.to_string();
    }
    format!("{existing}+{incoming}")
}

fn push_unique_tag(tags: &mut Vec<String>, tag: &str) {
    if !tags.iter().any(|item| item.eq_ignore_ascii_case(tag)) {
        tags.push(tag.to_string());
    }
}

fn github_milestone_url(repo: &str, milestone_number: Option<i64>) -> String {
    match milestone_number {
        Some(number) if number > 0 => format!("https://github.com/{repo}/milestone/{number}"),
        _ => format!("https://github.com/{repo}"),
    }
}

fn infer_client_tier(month_billable_hours: f64, active_projects: u32) -> String {
    if month_billable_hours >= 200.0 {
        "Tier 1".to_string()
    } else if month_billable_hours >= 100.0 {
        "Tier 2".to_string()
    } else if month_billable_hours >= 50.0 {
        "Tier 3".to_string()
    } else if active_projects >= 3 {
        "Tier 4".to_string()
    } else {
        "R&D".to_string()
    }
}

fn infer_client_industry(client_name: &str, project_names: &[String]) -> Option<String> {
    let haystack = format!("{} {}", client_name, project_names.join(" ")).to_lowercase();
    if haystack.contains("erp") {
        return Some("Enterprise Software".to_string());
    }
    if haystack.contains("retail") || haystack.contains("commerce") {
        return Some("Retail".to_string());
    }
    if haystack.contains("health") || haystack.contains("med") {
        return Some("Healthcare".to_string());
    }
    if haystack.contains("bank") || haystack.contains("finance") || haystack.contains("fintech") {
        return Some("Financial Services".to_string());
    }
    if haystack.contains("edu") || haystack.contains("learning") {
        return Some("Education".to_string());
    }
    None
}

fn infer_client_tech_stack(project_names: &[String]) -> Vec<String> {
    let haystack = project_names.join(" ").to_lowercase();
    let mut tags = Vec::new();

    let checks = [
        ("rust", "Rust"),
        ("tauri", "Tauri"),
        ("react", "React"),
        ("next", "Next.js"),
        ("api", "API"),
        ("erp", "ERP"),
        ("mobile", "Mobile"),
        ("ios", "iOS"),
        ("android", "Android"),
        ("infra", "Infra"),
    ];

    for (needle, label) in checks {
        if haystack.contains(needle) {
            tags.push(label.to_string());
        }
    }

    if tags.is_empty() {
        tags.push("General Delivery".to_string());
    }

    tags.truncate(4);
    tags
}

fn infer_contract_health(last_activity_at: Option<&str>) -> (String, Option<String>, Option<i32>) {
    let Some(last_activity_raw) = last_activity_at else {
        return ("pending".to_string(), None, None);
    };

    let Some(last_activity) = parse_datetime_flexible(last_activity_raw) else {
        return ("active".to_string(), None, None);
    };

    let now = Utc::now();
    let days_since = now.signed_duration_since(last_activity).num_days().max(0);

    if days_since <= 30 {
        return ("active".to_string(), None, None);
    }

    let renewal_window_days = 60;
    let contract_end = (last_activity + chrono::Duration::days(renewal_window_days))
        .format("%Y-%m-%d")
        .to_string();

    if days_since < renewal_window_days {
        return (
            "renewal".to_string(),
            Some(contract_end),
            Some((renewal_window_days - days_since) as i32),
        );
    }

    ("expired".to_string(), Some(contract_end), Some(0))
}

fn infer_project_status(is_archived: bool, last_activity_at: Option<&str>) -> String {
    if is_archived {
        return "archived".to_string();
    }

    let Some(last_activity_raw) = last_activity_at else {
        return "planned".to_string();
    };
    let Some(last_activity) = parse_datetime_flexible(last_activity_raw) else {
        return "active".to_string();
    };

    let days_since = Utc::now()
        .signed_duration_since(last_activity)
        .num_days()
        .max(0);
    if days_since <= 30 {
        "active".to_string()
    } else {
        "idle".to_string()
    }
}

async fn get_client_setting_value(
    pool: &sqlx::SqlitePool,
    client_slug: &str,
    suffix: &str,
) -> Result<Option<String>, String> {
    let key = format!("client_{}_{}", client_slug, suffix);
    let value = queries::get_setting(pool, &key)
        .await
        .map_err(|e| format!("read {key}: {e}"))?
        .and_then(|item| {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

    if value.is_some() {
        return Ok(value);
    }

    let legacy_key = format!("client.{}.{}", client_slug, suffix);
    let legacy_value = queries::get_setting(pool, &legacy_key)
        .await
        .map_err(|e| format!("read {legacy_key}: {e}"))?
        .and_then(|item| {
            let trimmed = item.trim();
            if trimmed.is_empty() {
                None
            } else {
                Some(trimmed.to_string())
            }
        });

    Ok(legacy_value)
}

async fn load_clients(pool: &sqlx::SqlitePool) -> Result<Vec<ClientView>, String> {
    #[derive(sqlx::FromRow)]
    struct ClientAggregateRow {
        client_name: String,
        active_projects: i64,
        month_billable_seconds: i64,
        last_activity_at: Option<String>,
        project_names_csv: Option<String>,
    }

    #[derive(sqlx::FromRow)]
    struct ClientContactRow {
        client_name: String,
        employee_name: String,
        month_seconds: i64,
    }

    #[derive(sqlx::FromRow)]
    struct GithubClientAggregateRow {
        client_name: String,
        github_projects: i64,
        open_issues: i64,
        total_issues: i64,
        latest_activity_at: Option<String>,
        project_names_csv: Option<String>,
    }

    let now = Local::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .format("%Y-%m-%d")
        .to_string();
    let next_month = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1).unwrap()
    }
    .format("%Y-%m-%d")
    .to_string();

    let rows: Vec<ClientAggregateRow> = sqlx::query_as::<_, ClientAggregateRow>(
        "SELECT
            TRIM(p.client_name) AS client_name,
            COUNT(DISTINCT CASE WHEN p.is_archived = 0 THEN p.id ELSE NULL END) AS active_projects,
            COALESCE(
                SUM(
                    CASE
                        WHEN te.start_time >= ?1
                             AND te.start_time < ?2
                             AND te.is_billable = 1
                        THEN COALESCE(te.duration_seconds, 0)
                        ELSE 0
                    END
                ),
                0
            ) AS month_billable_seconds,
            MAX(te.start_time) AS last_activity_at,
            GROUP_CONCAT(DISTINCT p.name) AS project_names_csv
         FROM projects p
         LEFT JOIN time_entries te ON te.project_id = p.id
         WHERE p.client_name IS NOT NULL AND TRIM(p.client_name) <> ''
         GROUP BY TRIM(p.client_name)
         ORDER BY TRIM(p.client_name) COLLATE NOCASE",
    )
    .bind(&month_start)
    .bind(&next_month)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query clients: {e}"))?;

    let contact_rows: Vec<ClientContactRow> = sqlx::query_as::<_, ClientContactRow>(
        "SELECT
            TRIM(p.client_name) AS client_name,
            e.name AS employee_name,
            COALESCE(SUM(COALESCE(te.duration_seconds, 0)), 0) AS month_seconds
         FROM projects p
         JOIN time_entries te ON te.project_id = p.id
         JOIN employees e ON e.id = te.employee_id
         WHERE p.client_name IS NOT NULL
           AND TRIM(p.client_name) <> ''
           AND e.is_active = 1
           AND te.start_time >= ?1
           AND te.start_time < ?2
         GROUP BY TRIM(p.client_name), e.name
         ORDER BY TRIM(p.client_name) COLLATE NOCASE, month_seconds DESC, e.name COLLATE NOCASE",
    )
    .bind(&month_start)
    .bind(&next_month)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client contacts: {e}"))?;

    let mut primary_contact_by_client: HashMap<String, String> = HashMap::new();
    for row in contact_rows {
        if row.month_seconds > 0 {
            primary_contact_by_client
                .entry(row.client_name)
                .or_insert(row.employee_name);
        }
    }

    let mut clients = Vec::with_capacity(rows.len());
    for row in rows {
        let client_name = row.client_name.trim().to_string();
        let client_slug = slugify_client_name(&client_name);
        let project_names = parse_csv_values(row.project_names_csv);
        let active_projects = row.active_projects.max(0) as u32;
        let month_billable_hours = row.month_billable_seconds as f64 / 3600.0;
        let tier = infer_client_tier(month_billable_hours, active_projects);
        let industry = infer_client_industry(&client_name, &project_names);
        let tech_stack = infer_client_tech_stack(&project_names);
        let (contract_status, contract_end_date, days_remaining) =
            infer_contract_health(row.last_activity_at.as_deref());

        clients.push(ClientView {
            id: format!("client-{client_slug}"),
            name: client_name.clone(),
            tier,
            industry,
            month_billable_hours,
            active_projects,
            planning_source: "clockify".to_string(),
            github_projects: 0,
            github_open_issues: 0,
            github_total_issues: 0,
            primary_contact: primary_contact_by_client.get(&client_name).cloned(),
            contract_status,
            contract_end_date,
            days_remaining,
            latest_activity_at: row.last_activity_at,
            tech_stack,
            drive_link: get_client_setting_value(pool, &client_slug, "drive_link").await?,
            chrome_profile: get_client_setting_value(pool, &client_slug, "chrome_profile").await?,
        });
    }

    let github_rows: Vec<GithubClientAggregateRow> = sqlx::query_as::<_, GithubClientAggregateRow>(
        "SELECT
            TRIM(c.client_name) AS client_name,
            COUNT(DISTINCT c.repo || ':' || COALESCE(c.default_milestone_number, 0)) AS github_projects,
            COALESCE(SUM(CASE WHEN LOWER(i.state) = 'open' THEN 1 ELSE 0 END), 0) AS open_issues,
            COUNT(i.number) AS total_issues,
            MAX(COALESCE(i.updated_at, m.updated_at, c.updated_at)) AS latest_activity_at,
            GROUP_CONCAT(DISTINCT COALESCE(m.title, c.display_name)) AS project_names_csv
         FROM github_repo_configs c
         LEFT JOIN github_milestones m
           ON m.repo = c.repo AND m.number = c.default_milestone_number
         LEFT JOIN github_issues i
           ON i.repo = c.repo AND (
             (c.default_milestone_number IS NOT NULL AND i.milestone_number = c.default_milestone_number)
             OR (c.default_milestone_number IS NULL AND i.milestone_number IS NULL)
           )
         WHERE c.enabled = 1
           AND c.client_name IS NOT NULL
           AND TRIM(c.client_name) <> ''
         GROUP BY TRIM(c.client_name)",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query github clients: {e}"))?;

    let mut client_index_by_name: HashMap<String, usize> = clients
        .iter()
        .enumerate()
        .map(|(index, client)| (client.name.to_lowercase(), index))
        .collect();

    for row in github_rows {
        let client_name = row.client_name.trim().to_string();
        if client_name.is_empty() {
            continue;
        }
        let project_names = parse_csv_values(row.project_names_csv);
        let github_projects = row.github_projects.max(0) as u32;
        let open_issues = row.open_issues.max(0) as u32;
        let total_issues = row.total_issues.max(0) as u32;

        if let Some(index) = client_index_by_name
            .get(&client_name.to_lowercase())
            .copied()
        {
            let client = &mut clients[index];
            client.planning_source = merge_planning_source(&client.planning_source, "github");
            client.github_projects = client.github_projects.saturating_add(github_projects);
            client.github_open_issues = client.github_open_issues.saturating_add(open_issues);
            client.github_total_issues = client.github_total_issues.saturating_add(total_issues);
            client.active_projects = client.active_projects.max(client.github_projects);
            client.latest_activity_at =
                most_recent_datetime(client.latest_activity_at.clone(), row.latest_activity_at);
            let (contract_status, contract_end_date, days_remaining) =
                infer_contract_health(client.latest_activity_at.as_deref());
            client.contract_status = contract_status;
            client.contract_end_date = contract_end_date;
            client.days_remaining = days_remaining;
            push_unique_tag(&mut client.tech_stack, "GitHub Plans");
            if client.industry.is_none() {
                client.industry = infer_client_industry(&client.name, &project_names);
            }
        } else {
            let client_slug = slugify_client_name(&client_name);
            let mut tech_stack = infer_client_tech_stack(&project_names);
            push_unique_tag(&mut tech_stack, "GitHub Plans");
            let active_projects = github_projects;
            let (contract_status, contract_end_date, days_remaining) =
                infer_contract_health(row.latest_activity_at.as_deref());
            let client = ClientView {
                id: format!("client-{client_slug}"),
                name: client_name.clone(),
                tier: infer_client_tier(0.0, active_projects),
                industry: infer_client_industry(&client_name, &project_names),
                month_billable_hours: 0.0,
                active_projects,
                planning_source: "github".to_string(),
                github_projects,
                github_open_issues: open_issues,
                github_total_issues: total_issues,
                primary_contact: None,
                contract_status,
                contract_end_date,
                days_remaining,
                latest_activity_at: row.latest_activity_at,
                tech_stack,
                drive_link: get_client_setting_value(pool, &client_slug, "drive_link").await?,
                chrome_profile: get_client_setting_value(pool, &client_slug, "chrome_profile")
                    .await?,
            };
            client_index_by_name.insert(client.name.to_lowercase(), clients.len());
            clients.push(client);
        }
    }

    clients.sort_by(|left, right| {
        right
            .month_billable_hours
            .partial_cmp(&left.month_billable_hours)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(right.active_projects.cmp(&left.active_projects))
            .then(left.name.cmp(&right.name))
    });

    Ok(clients)
}

#[tauri::command]
pub async fn get_clients(db: State<'_, DbPool>) -> Result<Vec<ClientView>, String> {
    load_clients(&db.0).await
}

#[tauri::command]
pub async fn get_client_detail(
    db: State<'_, DbPool>,
    client_id: String,
) -> Result<ClientDetailView, String> {
    let pool = &db.0;
    let clients = load_clients(pool).await?;
    let client = clients
        .into_iter()
        .find(|item| item.id == client_id)
        .ok_or_else(|| "Client not found".to_string())?;

    #[derive(sqlx::FromRow)]
    struct LinkedProjectRow {
        id: String,
        name: String,
        is_archived: bool,
        last_activity_at: Option<String>,
    }

    #[derive(sqlx::FromRow)]
    struct GithubLinkedProjectRow {
        repo: String,
        display_name: String,
        default_milestone_number: Option<i64>,
        milestone_title: Option<String>,
        milestone_state: Option<String>,
        open_issues: i64,
        total_issues: i64,
    }

    let linked_project_rows: Vec<LinkedProjectRow> = sqlx::query_as::<_, LinkedProjectRow>(
        "SELECT
            p.id AS id,
            p.name AS name,
            p.is_archived AS is_archived,
            MAX(te.start_time) AS last_activity_at
         FROM projects p
         LEFT JOIN time_entries te ON te.project_id = p.id
         WHERE p.client_name IS NOT NULL
           AND LOWER(TRIM(p.client_name)) = LOWER(TRIM(?1))
         GROUP BY p.id, p.name, p.is_archived
         ORDER BY p.is_archived ASC, p.name COLLATE NOCASE",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query linked projects: {e}"))?;

    let mut linked_projects: Vec<ClientLinkedProjectView> = linked_project_rows
        .into_iter()
        .map(|project| ClientLinkedProjectView {
            id: project.id,
            name: project.name,
            status: infer_project_status(project.is_archived, project.last_activity_at.as_deref()),
            source: "clockify".to_string(),
            repo: None,
            open_issues: 0,
            total_issues: 0,
            source_url: None,
        })
        .collect();

    let github_linked_rows: Vec<GithubLinkedProjectRow> = sqlx::query_as(
        "SELECT
            c.repo,
            c.display_name,
            c.default_milestone_number,
            m.title AS milestone_title,
            m.state AS milestone_state,
            COALESCE(SUM(CASE WHEN LOWER(i.state) = 'open' THEN 1 ELSE 0 END), 0) AS open_issues,
            COUNT(i.number) AS total_issues
         FROM github_repo_configs c
         LEFT JOIN github_milestones m
           ON m.repo = c.repo AND m.number = c.default_milestone_number
         LEFT JOIN github_issues i
           ON i.repo = c.repo AND (
             (c.default_milestone_number IS NOT NULL AND i.milestone_number = c.default_milestone_number)
             OR (c.default_milestone_number IS NULL AND i.milestone_number IS NULL)
           )
         WHERE c.enabled = 1
           AND c.client_name IS NOT NULL
           AND LOWER(TRIM(c.client_name)) = LOWER(TRIM(?1))
         GROUP BY c.repo, c.display_name, c.default_milestone_number, m.title, m.state
         ORDER BY COALESCE(m.title, c.display_name) COLLATE NOCASE",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client github projects: {e}"))?;

    for project in github_linked_rows {
        let milestone_number = project.default_milestone_number.unwrap_or(0);
        let open_issues = project.open_issues.max(0) as u32;
        let total_issues = project.total_issues.max(0) as u32;
        let status = if total_issues > 0 && open_issues == 0 {
            "done".to_string()
        } else if project
            .milestone_state
            .as_deref()
            .unwrap_or_default()
            .eq_ignore_ascii_case("closed")
        {
            "done".to_string()
        } else {
            "active".to_string()
        };
        linked_projects.push(ClientLinkedProjectView {
            id: github_project_id(&project.repo, milestone_number),
            name: project.milestone_title.unwrap_or(project.display_name),
            status,
            source: "github".to_string(),
            repo: Some(project.repo.clone()),
            open_issues,
            total_issues,
            source_url: Some(github_milestone_url(
                &project.repo,
                project.default_milestone_number,
            )),
        });
    }

    let mut resources = Vec::new();
    if let Some(link) = &client.drive_link {
        resources.push(ClientResourceView {
            name: "Client Drive".to_string(),
            r#type: "drive".to_string(),
            url: Some(link.clone()),
        });
    }
    if let Some(profile) = &client.chrome_profile {
        resources.push(ClientResourceView {
            name: format!("Chrome Profile: {profile}"),
            r#type: "chrome-profile".to_string(),
            url: None,
        });
    }

    let doc_rows: Vec<(Option<String>,)> = sqlx::query_as(
        "SELECT DISTINCT doc_title
         FROM huly_document_activity
         WHERE doc_title IS NOT NULL
           AND LOWER(doc_title) LIKE '%' || LOWER(?1) || '%'
         ORDER BY occurred_at DESC
         LIMIT 6",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client resources: {e}"))?;

    for (doc_title,) in doc_rows {
        if let Some(title) = doc_title.map(|value| value.trim().to_string()) {
            if !title.is_empty() {
                resources.push(ClientResourceView {
                    name: title,
                    r#type: "huly-doc".to_string(),
                    url: None,
                });
            }
        }
    }

    let mut recent_activity: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(
        "SELECT
            'clockify' AS source,
            e.name AS employee_name,
            'logged time' AS action,
            COALESCE(te.description, p.name) AS detail,
            te.start_time AS occurred_at,
            te.project_id AS project_id,
            NULL AS source_url,
            'clockify_time_entry' AS entity_type,
            NULL AS status
         FROM time_entries te
         JOIN projects p ON p.id = te.project_id
         JOIN employees e ON e.id = te.employee_id
         WHERE e.is_active = 1
           AND p.client_name IS NOT NULL
           AND LOWER(TRIM(p.client_name)) = LOWER(TRIM(?1))
         ORDER BY te.start_time DESC
         LIMIT 14",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client clockify activity: {e}"))?;

    let issue_activity: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(
        "SELECT
            'huly' AS source,
            e.name AS employee_name,
            h.action AS action,
            COALESCE(h.issue_identifier || ': ' || h.issue_title, h.issue_title, h.huly_issue_id) AS detail,
            h.occurred_at AS occurred_at,
            NULL AS project_id,
            NULL AS source_url,
            'huly_issue' AS entity_type,
            h.new_status AS status
         FROM huly_issue_activity h
         JOIN employees e ON e.id = h.employee_id
         WHERE e.is_active = 1
           AND (
                LOWER(COALESCE(h.issue_title, '')) LIKE '%' || LOWER(?1) || '%'
                OR LOWER(COALESCE(h.issue_identifier, '')) LIKE '%' || LOWER(?1) || '%'
           )
         ORDER BY h.occurred_at DESC
         LIMIT 8",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client issue activity: {e}"))?;

    let doc_activity: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(
        "SELECT
            'huly' AS source,
            e.name AS employee_name,
            h.action AS action,
            h.doc_title AS detail,
            h.occurred_at AS occurred_at,
            NULL AS project_id,
            NULL AS source_url,
            'huly_document' AS entity_type,
            NULL AS status
         FROM huly_document_activity h
         JOIN employees e ON e.id = h.employee_id
         WHERE e.is_active = 1
           AND LOWER(COALESCE(h.doc_title, '')) LIKE '%' || LOWER(?1) || '%'
         ORDER BY h.occurred_at DESC
         LIMIT 8",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client document activity: {e}"))?;

    let github_activity: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(
        "SELECT
            'github' AS source,
            'GitHub' AS employee_name,
            CASE o.event_type
                WHEN 'github.issue.opened' THEN 'opened issue'
                WHEN 'github.issue.updated' THEN 'updated issue'
                WHEN 'github.issue.closed' THEN 'closed issue'
                WHEN 'github.issue.reopened' THEN 'reopened issue'
                WHEN 'github.issue.labels_changed' THEN 'changed issue labels'
                WHEN 'github.issue.assignees_changed' THEN 'changed issue assignees'
                ELSE REPLACE(o.event_type, 'github.issue.', '')
            END AS action,
            '#' || json_extract(o.payload_json, '$.number') || ': ' || json_extract(o.payload_json, '$.title') AS detail,
            o.occurred_at AS occurred_at,
            json_extract(o.payload_json, '$.project_id') AS project_id,
            json_extract(o.payload_json, '$.url') AS source_url,
            o.entity_type AS entity_type,
            json_extract(o.payload_json, '$.state') AS status
         FROM ops_events o
         JOIN github_repo_configs c
           ON c.repo = json_extract(o.payload_json, '$.repo')
         WHERE o.source = 'github'
           AND c.enabled = 1
           AND c.client_name IS NOT NULL
           AND LOWER(TRIM(c.client_name)) = LOWER(TRIM(?1))
         ORDER BY o.occurred_at DESC
         LIMIT 12",
    )
    .bind(&client.name)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("query client github activity: {e}"))?;

    recent_activity.extend(issue_activity);
    recent_activity.extend(doc_activity);
    recent_activity.extend(github_activity);
    recent_activity.sort_by(|left, right| right.occurred_at.cmp(&left.occurred_at));
    recent_activity.truncate(20);

    Ok(ClientDetailView {
        client,
        linked_projects,
        linked_devices: vec![],
        resources,
        recent_activity,
    })
}

fn is_device_candidate(text: &str) -> bool {
    let haystack = text.to_lowercase();
    [
        "device",
        "iot",
        "tuya",
        "firmware",
        "hardware",
        "sensor",
        "gateway",
        "bridge",
        "thermostat",
        "camera",
        "ble",
        "bluetooth",
        "zigbee",
        "esp32",
        "esp8266",
        "rfid",
        "mqtt",
        "modbus",
        "nfc",
    ]
    .iter()
    .any(|keyword| haystack.contains(keyword))
}

fn status_priority(status: &str) -> u8 {
    match status {
        "issue" => 5,
        "in progress" => 4,
        "testing" => 3,
        "not started" => 2,
        "deployed" => 1,
        _ => 0,
    }
}

fn normalize_device_status(status_text: &str, context: &str) -> String {
    let raw = format!("{status_text} {context}").to_lowercase();

    if [
        "blocked",
        "bug",
        "issue",
        "error",
        "failed",
        "failure",
        "regression",
    ]
    .iter()
    .any(|keyword| raw.contains(keyword))
    {
        return "issue".to_string();
    }

    if [
        "deployed",
        "released",
        "done",
        "closed",
        "resolved",
        "production",
        "live",
    ]
    .iter()
    .any(|keyword| raw.contains(keyword))
    {
        return "deployed".to_string();
    }

    if ["testing", "test", "qa", "uat", "staging"]
        .iter()
        .any(|keyword| raw.contains(keyword))
    {
        return "testing".to_string();
    }

    if ["in progress", "progress", "doing", "wip", "active"]
        .iter()
        .any(|keyword| raw.contains(keyword))
    {
        return "in progress".to_string();
    }

    if [
        "todo",
        "to do",
        "backlog",
        "open",
        "new",
        "planned",
        "not started",
    ]
    .iter()
    .any(|keyword| raw.contains(keyword))
    {
        return "not started".to_string();
    }

    "in progress".to_string()
}

fn infer_device_platform(text: &str) -> String {
    let haystack = text.to_lowercase();
    if ["ios", "iphone", "ipad"]
        .iter()
        .any(|keyword| haystack.contains(keyword))
    {
        return "iOS".to_string();
    }
    if ["android", "apk", "play store"]
        .iter()
        .any(|keyword| haystack.contains(keyword))
    {
        return "Android".to_string();
    }
    if [
        "firmware",
        "embedded",
        "hardware",
        "esp32",
        "esp8266",
        "mcu",
        "microcontroller",
        "zigbee",
        "rfid",
        "nfc",
    ]
    .iter()
    .any(|keyword| haystack.contains(keyword))
    {
        return "Firmware".to_string();
    }
    if ["api", "backend", "server", "cloud"]
        .iter()
        .any(|keyword| haystack.contains(keyword))
    {
        return "Backend".to_string();
    }
    if ["web", "dashboard", "portal", "frontend"]
        .iter()
        .any(|keyword| haystack.contains(keyword))
    {
        return "Web".to_string();
    }
    "Cross-platform".to_string()
}

fn normalize_device_key(value: &str) -> String {
    let mut key = String::with_capacity(value.len());
    let mut previous_was_separator = false;

    for ch in value.trim().chars() {
        if ch.is_ascii_alphanumeric() {
            key.push(ch.to_ascii_lowercase());
            previous_was_separator = false;
        } else if !previous_was_separator {
            key.push('_');
            previous_was_separator = true;
        }
    }

    key.trim_matches('_').to_string()
}

fn derive_device_name(title: Option<&str>, identifier: Option<&str>) -> Option<String> {
    if let Some(raw_title) = title.map(str::trim).filter(|value| !value.is_empty()) {
        let candidate = raw_title
            .replace('\n', " ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if !candidate.is_empty() {
            return Some(candidate.chars().take(80).collect());
        }
    }

    identifier
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(|value| format!("Device {value}"))
}

fn extract_first_url(text: &str) -> Option<String> {
    for token in text.split_whitespace() {
        if token.starts_with("http://") || token.starts_with("https://") {
            let trimmed = token.trim_matches(|ch: char| {
                matches!(ch, ',' | '.' | ';' | ')' | '(' | ']' | '[' | '"' | '\'')
            });
            if !trimmed.is_empty() {
                return Some(trimmed.to_string());
            }
        }
    }
    None
}

fn extract_firmware_version(text: &str) -> Option<String> {
    for token in text.split_whitespace() {
        let candidate = token.trim_matches(|ch: char| !ch.is_ascii_alphanumeric() && ch != '.');
        let lower = candidate.to_lowercase();
        if lower.starts_with('v')
            && lower.len() >= 3
            && lower.chars().any(|ch| ch.is_ascii_digit())
            && lower.contains('.')
        {
            return Some(candidate.to_string());
        }
    }
    None
}

#[derive(Debug, Clone)]
struct DeviceAccum {
    key: String,
    name: String,
    model: Option<String>,
    platform: String,
    client_name: Option<String>,
    status: String,
    status_rank: u8,
    responsible_dev: Option<String>,
    issue_count: u32,
    technical_notes: Option<String>,
    api_docs_link: Option<String>,
    firmware_version: Option<String>,
    latest_activity_ms: i64,
}

impl DeviceAccum {
    fn new(
        key: String,
        name: String,
        platform: String,
        status: String,
        latest_activity_ms: i64,
    ) -> Self {
        let status_rank = status_priority(&status);
        Self {
            key,
            name,
            model: None,
            platform,
            client_name: None,
            status,
            status_rank,
            responsible_dev: None,
            issue_count: 0,
            technical_notes: None,
            api_docs_link: None,
            firmware_version: None,
            latest_activity_ms,
        }
    }

    fn merge_status(&mut self, status: String) {
        let rank = status_priority(&status);
        if rank > self.status_rank {
            self.status = status;
            self.status_rank = rank;
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceView {
    pub id: String,
    pub name: String,
    pub model: Option<String>,
    pub platform: String,
    pub client_name: Option<String>,
    pub status: String,
    pub responsible_dev: Option<String>,
    pub issue_count: u32,
    pub technical_notes: Option<String>,
    pub api_docs_link: Option<String>,
    pub firmware_version: Option<String>,
}

#[tauri::command]
pub async fn get_devices(db: State<'_, DbPool>) -> Result<Vec<DeviceView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let (issues, cards, huly_projects, huly_people) = tokio::join!(
        client.get_issues(None),
        client.get_board_cards(),
        client.get_projects(),
        client.get_persons(),
    );
    let issues = issues.unwrap_or_default();
    let cards = cards.unwrap_or_default();
    let huly_projects = huly_projects.unwrap_or_default();
    let huly_people = huly_people.unwrap_or_default();

    let people_name_by_id: HashMap<String, String> = huly_people
        .into_iter()
        .filter_map(|person| {
            person
                .name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|name| (person.id, name.to_string()))
        })
        .collect();

    let local_projects = queries::get_projects(pool)
        .await
        .map_err(|e| format!("load projects for devices: {e}"))?;

    let mut client_by_huly_project_id: HashMap<String, String> = HashMap::new();
    let mut client_by_project_name: HashMap<String, String> = HashMap::new();
    for project in local_projects {
        let Some(client_name) = project.client_name.map(|value| value.trim().to_string()) else {
            continue;
        };
        if client_name.is_empty() {
            continue;
        }

        if let Some(huly_project_id) = project
            .huly_project_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            client_by_huly_project_id
                .entry(huly_project_id.to_string())
                .or_insert(client_name.clone());
        }

        client_by_project_name
            .entry(project.name.to_lowercase())
            .or_insert(client_name);
    }

    let huly_project_name_by_id: HashMap<String, String> = huly_projects
        .into_iter()
        .filter_map(|project| {
            project
                .name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|name| (project.id, name.to_string()))
        })
        .collect();

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("load employees for devices: {e}"))?;
    let assignee_name_by_person: HashMap<String, String> = employees
        .into_iter()
        .filter(|employee| employee.is_active)
        .filter_map(|employee| {
            employee
                .huly_person_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|person_id| (person_id.to_string(), employee.name))
        })
        .collect();

    let resolve_client_name = |space: Option<&str>| -> Option<String> {
        let project_id = space
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())?;

        if let Some(client_name) = client_by_huly_project_id.get(&project_id) {
            return Some(client_name.clone());
        }

        let project_name = huly_project_name_by_id.get(&project_id)?;
        client_by_project_name
            .get(&project_name.to_lowercase())
            .cloned()
    };

    let mut devices_by_key: HashMap<String, DeviceAccum> = HashMap::new();

    for issue in issues {
        let title = issue
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let description = issue
            .description
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let identifier = issue
            .identifier
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());

        let project_name = issue
            .space
            .as_deref()
            .and_then(|space| huly_project_name_by_id.get(space))
            .cloned();

        let combined_text = format!(
            "{} {} {} {}",
            title.unwrap_or_default(),
            description.unwrap_or_default(),
            identifier.unwrap_or_default(),
            project_name.as_deref().unwrap_or_default()
        );

        if !is_device_candidate(&combined_text) {
            continue;
        }

        let Some(device_name) = derive_device_name(title, identifier) else {
            continue;
        };
        let key = normalize_device_key(&device_name);
        if key.is_empty() {
            continue;
        }

        let status_text = issue
            .status
            .as_ref()
            .map(|value| value.as_str().unwrap_or(&value.to_string()).to_string())
            .unwrap_or_default();
        let normalized_status = normalize_device_status(&status_text, &combined_text);
        let platform = infer_device_platform(&combined_text);
        let latest_activity_ms = issue.modified_on.or(issue.created_on).unwrap_or_default();

        let entry = devices_by_key.entry(key.clone()).or_insert_with(|| {
            DeviceAccum::new(
                key.clone(),
                device_name.clone(),
                platform.clone(),
                normalized_status.clone(),
                latest_activity_ms,
            )
        });

        entry.platform = platform;
        entry.merge_status(normalized_status);
        entry.issue_count = entry.issue_count.saturating_add(1);
        entry.latest_activity_ms = entry.latest_activity_ms.max(latest_activity_ms);

        if entry.client_name.is_none() {
            entry.client_name = resolve_client_name(issue.space.as_deref());
        }
        if entry.responsible_dev.is_none() {
            if let Some(assignee) = issue.assignee.as_deref() {
                entry.responsible_dev = assignee_name_by_person
                    .get(assignee)
                    .cloned()
                    .or_else(|| people_name_by_id.get(assignee).cloned());
            }
        }
        if entry.technical_notes.is_none() {
            entry.technical_notes = description.map(|value| value.chars().take(220).collect());
        }
        if entry.api_docs_link.is_none() {
            if let Some(description_text) = description {
                entry.api_docs_link = extract_first_url(description_text);
            }
        }
        if entry.firmware_version.is_none() {
            entry.firmware_version = extract_firmware_version(&combined_text);
        }
    }

    for card in cards {
        let title = card
            .title
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty());
        let combined_text = format!(
            "{} {}",
            title.unwrap_or_default(),
            card.space
                .as_deref()
                .and_then(|space| huly_project_name_by_id.get(space))
                .map(|value| value.as_str())
                .unwrap_or_default()
        );

        if !is_device_candidate(&combined_text) {
            continue;
        }

        let Some(device_name) = derive_device_name(title, None) else {
            continue;
        };
        let key = normalize_device_key(&device_name);
        if key.is_empty() {
            continue;
        }

        let status_text = card
            .status
            .as_ref()
            .map(|value| value.as_str().unwrap_or(&value.to_string()).to_string())
            .unwrap_or_default();
        let normalized_status = normalize_device_status(&status_text, &combined_text);
        let platform = infer_device_platform(&combined_text);
        let latest_activity_ms = card.modified_on.or(card.created_on).unwrap_or_default();

        let entry = devices_by_key.entry(key.clone()).or_insert_with(|| {
            DeviceAccum::new(
                key.clone(),
                device_name.clone(),
                platform.clone(),
                normalized_status.clone(),
                latest_activity_ms,
            )
        });

        entry.platform = platform;
        entry.merge_status(normalized_status);
        entry.issue_count = entry.issue_count.saturating_add(1);
        entry.latest_activity_ms = entry.latest_activity_ms.max(latest_activity_ms);

        if entry.client_name.is_none() {
            entry.client_name = resolve_client_name(card.space.as_deref());
        }
        if entry.responsible_dev.is_none() {
            if let Some(assignee) = card.assignee.as_deref() {
                entry.responsible_dev = assignee_name_by_person
                    .get(assignee)
                    .cloned()
                    .or_else(|| people_name_by_id.get(assignee).cloned());
            }
        }
    }

    let mut rows: Vec<DeviceView> = devices_by_key
        .into_values()
        .map(|device| DeviceView {
            id: format!("device-{}", device.key),
            name: device.name,
            model: device.model,
            platform: device.platform,
            client_name: device.client_name,
            status: device.status,
            responsible_dev: device.responsible_dev,
            issue_count: device.issue_count,
            technical_notes: device.technical_notes,
            api_docs_link: device.api_docs_link,
            firmware_version: device.firmware_version,
        })
        .collect();

    rows.sort_by(|left, right| {
        right
            .issue_count
            .cmp(&left.issue_count)
            .then(left.name.cmp(&right.name))
    });
    Ok(rows)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeArticleView {
    pub id: String,
    pub title: String,
    pub category: String,
    pub author: Option<String>,
    pub updated_at: String,
    pub tags: Vec<String>,
    pub content_preview: String,
    pub content: Option<String>,
}

#[tauri::command]
pub async fn get_knowledge_articles(
    db: State<'_, DbPool>,
) -> Result<Vec<KnowledgeArticleView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let people = client.get_persons().await.unwrap_or_default();
    let person_name_by_id: HashMap<String, String> = people
        .into_iter()
        .map(|person| {
            (
                person.id,
                person
                    .name
                    .unwrap_or_else(|| "Unknown".to_string())
                    .trim()
                    .to_string(),
            )
        })
        .collect();

    let documents = client.get_documents().await.unwrap_or_default();
    let mut rows: Vec<KnowledgeArticleView> = documents
        .into_iter()
        .map(|document| {
            let title = document
                .title
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .unwrap_or("Untitled")
                .to_string();
            let content = document
                .content
                .as_deref()
                .map(str::trim)
                .unwrap_or("")
                .to_string();
            let preview = if content.is_empty() {
                "No preview available.".to_string()
            } else {
                let snippet = content
                    .split_whitespace()
                    .take(28)
                    .collect::<Vec<_>>()
                    .join(" ");
                if content.split_whitespace().count() > 28 {
                    format!("{snippet}...")
                } else {
                    snippet
                }
            };
            let category = infer_knowledge_category(document.space.as_deref(), &content);
            let mut tags = Vec::new();
            if let Some(space) = document
                .space
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                tags.push(space.to_string());
            }
            if let Some(class) = document
                .class
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                tags.push(class.replace(':', "-"));
            }
            tags.sort();
            tags.dedup();

            let updated_at = document
                .modified_on
                .and_then(ms_to_datetime_string)
                .unwrap_or_else(|| Utc::now().to_rfc3339());

            KnowledgeArticleView {
                id: document.id,
                title,
                category,
                author: document
                    .created_by
                    .as_deref()
                    .and_then(|id| person_name_by_id.get(id))
                    .cloned(),
                updated_at,
                tags,
                content_preview: preview,
                content: if content.is_empty() {
                    None
                } else {
                    Some(content)
                },
            }
        })
        .collect();

    rows.sort_by(|left, right| right.updated_at.cmp(&left.updated_at));
    Ok(rows)
}

fn infer_knowledge_category(space: Option<&str>, content: &str) -> String {
    let haystack = format!(
        "{} {}",
        space.unwrap_or_default().to_lowercase(),
        content.to_lowercase()
    );
    if haystack.contains("faq") {
        return "FAQ".to_string();
    }
    if haystack.contains("client") {
        return "Client Doc".to_string();
    }
    if haystack.contains("sop") || haystack.contains("runbook") {
        return "SOP".to_string();
    }
    if haystack.contains("tool") || haystack.contains("integration") {
        return "Tool Discovery".to_string();
    }
    if haystack.contains("training") || haystack.contains("onboarding") {
        return "Training".to_string();
    }
    if haystack.contains("guide") || haystack.contains("api") || haystack.contains("architecture") {
        return "Technical Guide".to_string();
    }
    if haystack.contains("http://") || haystack.contains("https://") {
        return "Resource Link".to_string();
    }
    "Technical Guide".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprintBurndownPoint {
    pub day: u32,
    pub remaining: u32,
    pub ideal: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprintCapacityView {
    pub employee_name: String,
    pub scheduled_hours: f64,
    pub available_hours: f64,
    pub utilization: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprintComparisonView {
    pub current_velocity: u32,
    pub previous_velocity: u32,
    pub current_completion: f64,
    pub previous_completion: f64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SprintDetailView {
    pub id: String,
    pub label: String,
    pub goal: Option<String>,
    pub retro_notes: Option<String>,
    pub burndown: Vec<SprintBurndownPoint>,
    pub capacity: Vec<SprintCapacityView>,
    pub comparison: Option<SprintComparisonView>,
}

#[tauri::command]
pub async fn get_sprint_detail(
    db: State<'_, DbPool>,
    sprint_id: String,
) -> Result<SprintDetailView, String> {
    let pool = &db.0;
    let client = get_huly_client(pool).await?;

    let (milestones, issues, time_reports, projects, persons, employees) = tokio::join!(
        client.get_milestones(),
        client.get_issues(None),
        client.get_time_reports(None),
        client.get_projects(),
        client.get_persons(),
        queries::get_employees(pool),
    );

    let milestones = milestones.unwrap_or_default();
    let issues = issues.unwrap_or_default();
    let time_reports = time_reports.unwrap_or_default();
    let projects = projects.unwrap_or_default();
    let persons = persons.unwrap_or_default();
    let employees = employees.map_err(|e| format!("load employees for sprint detail: {e}"))?;

    let milestone = milestones
        .iter()
        .find(|item| item.id == sprint_id)
        .ok_or_else(|| "Sprint not found".to_string())?;

    let project_name_by_id: HashMap<String, String> = projects
        .into_iter()
        .filter_map(|project| {
            project
                .name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|name| (project.id, name.to_string()))
        })
        .collect();

    let person_name_by_id: HashMap<String, String> = persons
        .into_iter()
        .filter_map(|person| {
            person
                .name
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|name| (person.id, name.to_string()))
        })
        .collect();

    let employee_name_by_person: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .filter_map(|employee| {
            employee
                .huly_person_id
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|person_id| (person_id.to_string(), employee.name.clone()))
        })
        .collect();

    let sprint_issues: Vec<&HulyIssue> = issues
        .iter()
        .filter(|issue| {
            milestone.space.is_some()
                && issue.space.as_deref().map(str::trim)
                    == milestone.space.as_deref().map(str::trim)
        })
        .collect();

    let total_issues = sprint_issues.len() as u32;
    let completed_issues = sprint_issues
        .iter()
        .filter(|issue| issue_is_completed(issue))
        .count() as u32;

    let now_ms = Utc::now().timestamp_millis();
    let day_ms = 86_400_000_i64;
    let target_ms = milestone.target_date.unwrap_or(now_ms + 13 * day_ms);
    let earliest_issue_ms = sprint_issues
        .iter()
        .filter_map(|issue| issue.created_on.or(issue.modified_on))
        .min();
    let start_ms = milestone
        .created_on
        .or(earliest_issue_ms)
        .unwrap_or(target_ms - 13 * day_ms);

    let day_count = (((target_ms - start_ms).max(day_ms) / day_ms) + 1).clamp(7, 14) as u32;
    let burndown: Vec<SprintBurndownPoint> = (0..day_count)
        .map(|index| {
            let cutoff_ms = start_ms + ((index as i64 + 1) * day_ms) - 1;
            let remaining = sprint_issues
                .iter()
                .filter(|issue| match issue_completed_at(issue) {
                    Some(completed_at) => completed_at > cutoff_ms,
                    None => true,
                })
                .count() as u32;
            let ideal = if day_count > 1 {
                (((day_count - 1 - index) as f64 / (day_count - 1) as f64) * total_issues as f64)
                    .round() as u32
            } else {
                0
            };

            SprintBurndownPoint {
                day: index + 1,
                remaining,
                ideal,
            }
        })
        .collect();

    let issue_ids: HashSet<&str> = sprint_issues
        .iter()
        .map(|issue| issue.id.as_str())
        .collect();
    let mut est_hours_by_person: HashMap<String, f64> = HashMap::new();
    for issue in &sprint_issues {
        if let (Some(assignee), Some(estimation_ms)) = (issue.assignee.as_ref(), issue.estimation) {
            if estimation_ms > 0 {
                *est_hours_by_person.entry(assignee.clone()).or_default() +=
                    estimation_ms as f64 / 3_600_000.0;
            }
        }
    }

    let mut actual_hours_by_person: HashMap<String, f64> = HashMap::new();
    for report in &time_reports {
        let Some(issue_ref) = report.attached_to.as_deref() else {
            continue;
        };
        if !issue_ids.contains(issue_ref) {
            continue;
        }
        let Some(person_id) = report.employee.as_ref() else {
            continue;
        };
        *actual_hours_by_person.entry(person_id.clone()).or_default() +=
            report.value.unwrap_or(0.0);
    }

    let mut person_ids: HashSet<String> = est_hours_by_person.keys().cloned().collect();
    person_ids.extend(actual_hours_by_person.keys().cloned());

    let mut capacity: Vec<SprintCapacityView> = person_ids
        .into_iter()
        .map(|person_id| {
            let estimated = est_hours_by_person.get(&person_id).copied().unwrap_or(0.0);
            let actual = actual_hours_by_person
                .get(&person_id)
                .copied()
                .unwrap_or(0.0);
            let scheduled_hours = if estimated > 0.0 { estimated } else { actual };
            let available_hours = 40.0;
            let utilization = if available_hours > 0.0 {
                scheduled_hours / available_hours
            } else {
                0.0
            };
            let employee_name = employee_name_by_person
                .get(&person_id)
                .cloned()
                .or_else(|| person_name_by_id.get(&person_id).cloned())
                .unwrap_or(person_id);

            SprintCapacityView {
                employee_name,
                scheduled_hours,
                available_hours,
                utilization,
            }
        })
        .collect();
    capacity.sort_by(|left, right| {
        right
            .scheduled_hours
            .partial_cmp(&left.scheduled_hours)
            .unwrap_or(std::cmp::Ordering::Equal)
            .then(left.employee_name.cmp(&right.employee_name))
    });

    let window_end = now_ms.min(target_ms.max(now_ms));
    let current_window_start = window_end - (14 * day_ms);
    let previous_window_start = current_window_start - (14 * day_ms);

    let current_velocity = sprint_issues
        .iter()
        .filter_map(|issue| issue_completed_at(issue))
        .filter(|completed_at| *completed_at >= current_window_start && *completed_at <= window_end)
        .count() as u32;
    let previous_velocity = sprint_issues
        .iter()
        .filter_map(|issue| issue_completed_at(issue))
        .filter(|completed_at| {
            *completed_at >= previous_window_start && *completed_at < current_window_start
        })
        .count() as u32;
    let previous_completed = sprint_issues
        .iter()
        .filter_map(|issue| issue_completed_at(issue))
        .filter(|completed_at| *completed_at < current_window_start)
        .count() as u32;

    let comparison = if total_issues > 0 {
        Some(SprintComparisonView {
            current_velocity,
            previous_velocity,
            current_completion: ((completed_issues as f64 / total_issues as f64) * 100.0).round(),
            previous_completion: ((previous_completed as f64 / total_issues as f64) * 100.0)
                .round(),
        })
    } else {
        None
    };

    let sprint_label = milestone
        .label
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Sprint")
        .to_string();
    let goal = Some(
        milestone
            .space
            .as_deref()
            .and_then(|space| project_name_by_id.get(space))
            .map(|project_name| format!("Deliver {sprint_label} outcomes for {project_name}."))
            .unwrap_or_else(|| format!("Deliver planned outcomes for {sprint_label}.")),
    );
    let retro_notes = if total_issues == 0 {
        None
    } else {
        let open_issues = total_issues.saturating_sub(completed_issues);
        Some(format!(
            "{total_issues} linked issues tracked. {completed_issues} completed and {open_issues} still open."
        ))
    };

    Ok(SprintDetailView {
        id: sprint_id,
        label: sprint_label,
        goal,
        retro_notes,
        burndown,
        capacity,
        comparison,
    })
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyHoursView {
    pub employee_name: String,
    pub actual_hours: f64,
    pub expected_hours: f64,
    pub status: String,
    pub is_remote: bool,
    pub timezone: Option<String>,
    pub on_leave: bool,
}

#[tauri::command]
pub async fn get_monthly_hours(db: State<'_, DbPool>) -> Result<Vec<MonthlyHoursView>, String> {
    let pool = &db.0;
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let now = Local::now();
    let month_start = now
        .with_day(1)
        .unwrap_or(now)
        .format("%Y-%m-%dT00:00:00Z")
        .to_string();
    let month_end = now.format("%Y-%m-%dT23:59:59Z").to_string();

    let mut result = Vec::new();
    for emp in employees.iter().filter(|e| e.is_active) {
        let entries = queries::get_time_entries(pool, &emp.id, &month_start, &month_end)
            .await
            .unwrap_or_default();
        let actual: f64 = entries
            .iter()
            .filter_map(|e| e.duration_seconds)
            .sum::<i64>() as f64
            / 3600.0;
        let expected = emp.monthly_quota_hours as f64;
        let status = if actual < 120.0 {
            "under"
        } else if actual > 180.0 {
            "over"
        } else {
            "normal"
        };
        result.push(MonthlyHoursView {
            employee_name: emp.name.clone(),
            actual_hours: actual,
            expected_hours: expected,
            status: status.to_string(),
            is_remote: false,
            timezone: None,
            on_leave: false,
        });
    }
    Ok(result)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingTrackView {
    pub id: String,
    pub name: String,
    pub total_modules: u32,
    pub completion_rate: f64,
    pub overdue_count: u32,
}

#[tauri::command]
pub async fn get_training_tracks(db: State<'_, DbPool>) -> Result<Vec<TrainingTrackView>, String> {
    let pool = &db.0;
    let signals = load_training_signals(pool).await?;
    let rows = build_training_status_rows(&signals);

    let mut by_track: HashMap<String, (f64, u32, u32)> = HashMap::new();
    for row in &rows {
        let entry = by_track.entry(row.track.clone()).or_insert((0.0, 0, 0));
        entry.0 += row.progress;
        entry.1 += 1;
        if row.status.eq_ignore_ascii_case("overdue") {
            entry.2 += 1;
        }
    }

    let mut tracks: Vec<TrainingTrackView> = training_track_catalog()
        .iter()
        .map(|track| {
            let (sum_progress, count, overdue) =
                by_track.get(track.name).copied().unwrap_or((0.0, 0, 0));
            let completion_rate = if count > 0 {
                (sum_progress / count as f64).clamp(0.0, 100.0)
            } else {
                0.0
            };

            TrainingTrackView {
                id: track.id.to_string(),
                name: track.name.to_string(),
                total_modules: track.total_modules,
                completion_rate,
                overdue_count: overdue,
            }
        })
        .collect();

    tracks.sort_by(|left, right| left.name.cmp(&right.name));
    Ok(tracks)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrainingStatusRow {
    pub employee_name: String,
    pub track: String,
    pub progress: f64,
    pub modules_done: u32,
    pub total_modules: u32,
    pub next_module: Option<String>,
    pub deadline: Option<String>,
    pub status: String,
}

#[tauri::command]
pub async fn get_training_status(db: State<'_, DbPool>) -> Result<Vec<TrainingStatusRow>, String> {
    let pool = &db.0;
    let signals = load_training_signals(pool).await?;
    Ok(build_training_status_rows(&signals))
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsMatrixCell {
    pub employee_name: String,
    pub skill: String,
    pub level: u32,
}

#[tauri::command]
pub async fn get_skills_matrix(db: State<'_, DbPool>) -> Result<Vec<SkillsMatrixCell>, String> {
    let pool = &db.0;
    let signals = load_training_signals(pool).await?;

    let mut cells = Vec::new();
    for signal in &signals {
        let total = signal.hours_month.max(1.0);
        let hours_ratio = (signal.hours_month / 160.0).clamp(0.0, 1.0);
        let projects_ratio = (signal.distinct_projects as f64 / 4.0).clamp(0.0, 1.0);
        let device_ratio = (signal.device_hours / total).clamp(0.0, 1.0);
        let docs_ratio = (signal.documentation_hours / total).clamp(0.0, 1.0);
        let coordination_ratio = (signal.coordination_hours / total).clamp(0.0, 1.0);
        let experimentation_ratio = (signal.experimentation_hours / total).clamp(0.0, 1.0);

        let scored_skills: Vec<(&str, f64)> = vec![
            (
                "Clockify Discipline",
                (0.7 * hours_ratio + 0.3 * projects_ratio).clamp(0.0, 1.0),
            ),
            (
                "Huly Workflow",
                (0.5 * projects_ratio + 0.5 * coordination_ratio).clamp(0.0, 1.0),
            ),
            (
                "Client Delivery",
                (0.4 * hours_ratio + 0.4 * projects_ratio + 0.2 * coordination_ratio)
                    .clamp(0.0, 1.0),
            ),
            ("IoT Integration", device_ratio),
            ("Documentation", docs_ratio),
            ("R&D Execution", experimentation_ratio),
        ];

        for (skill, score) in scored_skills {
            cells.push(SkillsMatrixCell {
                employee_name: signal.employee_name.clone(),
                skill: skill.to_string(),
                level: score_to_skill_level(score),
            });
        }
    }

    cells.sort_by(|left, right| {
        left.employee_name
            .cmp(&right.employee_name)
            .then(left.skill.cmp(&right.skill))
    });
    Ok(cells)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingTaskView {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub completed_at: Option<String>,
    pub resource_created: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OnboardingFlowView {
    pub client_id: String,
    pub client_name: String,
    pub start_date: String,
    pub completed_tasks: u32,
    pub total_tasks: u32,
    pub progress_percent: f64,
    pub status: String,
    pub tasks: Vec<OnboardingTaskView>,
    pub days_elapsed: u32,
}

#[tauri::command]
pub async fn get_onboarding_flows(
    db: State<'_, DbPool>,
) -> Result<Vec<OnboardingFlowView>, String> {
    let pool = &db.0;
    let projects = queries::get_projects(pool)
        .await
        .map_err(|e| format!("load projects for onboarding: {e}"))?;

    let client = get_huly_client(pool).await.ok();
    let (huly_docs, huly_issues, huly_cards) = if let Some(client) = client.as_ref() {
        let (docs, issues, cards) = tokio::join!(
            client.get_documents(),
            client.get_issues(None),
            client.get_board_cards(),
        );
        (
            docs.unwrap_or_default(),
            issues.unwrap_or_default(),
            cards.unwrap_or_default(),
        )
    } else {
        (vec![], vec![], vec![])
    };

    let mut projects_by_client: HashMap<String, Vec<Project>> = HashMap::new();
    for project in projects {
        let Some(client_name) = project
            .client_name
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(|value| value.to_string())
        else {
            continue;
        };
        projects_by_client
            .entry(client_name)
            .or_default()
            .push(project);
    }

    let mut flows = Vec::new();
    for (client_name, client_projects) in projects_by_client {
        let client_key = client_name.to_lowercase();
        let huly_project_ids: HashSet<String> = client_projects
            .iter()
            .filter_map(|project| {
                project
                    .huly_project_id
                    .as_deref()
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.to_string())
            })
            .collect();

        let primary_project = client_projects
            .iter()
            .map(|project| project.name.trim())
            .find(|name| !name.is_empty())
            .map(|name| name.to_string());
        let first_project_created = client_projects
            .iter()
            .filter_map(|project| {
                if project.created_at.trim().is_empty() {
                    None
                } else {
                    Some(project.created_at.clone())
                }
            })
            .min();

        let client_stats: (Option<String>, Option<String>, f64) = sqlx::query_as(
            "SELECT
                MIN(te.start_time) AS first_entry,
                MAX(te.start_time) AS latest_entry,
                COALESCE(SUM(COALESCE(te.duration_seconds, 0)) / 3600.0, 0) AS total_hours
             FROM time_entries te
             JOIN projects p ON p.id = te.project_id
             WHERE p.client_name IS NOT NULL
               AND LOWER(TRIM(p.client_name)) = LOWER(TRIM(?1))",
        )
        .bind(&client_name)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("query onboarding stats for {client_name}: {e}"))?;

        let (first_time_entry, _latest_time_entry, logged_hours) = client_stats;

        let matching_docs: Vec<&HulyDocument> = huly_docs
            .iter()
            .filter(|doc| {
                doc.space
                    .as_deref()
                    .map(|space| huly_project_ids.contains(space))
                    .unwrap_or(false)
                    || doc
                        .title
                        .as_deref()
                        .map(|title| title.to_lowercase().contains(&client_key))
                        .unwrap_or(false)
                    || doc
                        .content
                        .as_deref()
                        .map(|content| content.to_lowercase().contains(&client_key))
                        .unwrap_or(false)
            })
            .collect();

        let matching_issues = huly_issues
            .iter()
            .filter(|issue| {
                issue
                    .space
                    .as_deref()
                    .map(|space| huly_project_ids.contains(space))
                    .unwrap_or(false)
                    || issue
                        .title
                        .as_deref()
                        .map(|title| title.to_lowercase().contains(&client_key))
                        .unwrap_or(false)
            })
            .count() as u32;

        let matching_cards = huly_cards
            .iter()
            .filter(|card| {
                card.space
                    .as_deref()
                    .map(|space| huly_project_ids.contains(space))
                    .unwrap_or(false)
                    || card
                        .title
                        .as_deref()
                        .map(|title| title.to_lowercase().contains(&client_key))
                        .unwrap_or(false)
            })
            .count() as u32;

        let mut tasks = Vec::new();

        let workspace_ready = !client_projects.is_empty();
        tasks.push(OnboardingTaskView {
            id: format!("{}-workspace", slugify_client_name(&client_name)),
            title: "Workspace mapped in Clockify".to_string(),
            completed: workspace_ready,
            completed_at: first_project_created.clone(),
            resource_created: primary_project.clone(),
        });

        let primary_project_created = primary_project.is_some();
        tasks.push(OnboardingTaskView {
            id: format!("{}-project", slugify_client_name(&client_name)),
            title: "Primary project created".to_string(),
            completed: primary_project_created,
            completed_at: first_project_created.clone(),
            resource_created: primary_project.clone(),
        });

        let kickoff_logged = logged_hours > 0.0;
        tasks.push(OnboardingTaskView {
            id: format!("{}-kickoff", slugify_client_name(&client_name)),
            title: "Kickoff execution logged".to_string(),
            completed: kickoff_logged,
            completed_at: first_time_entry.clone(),
            resource_created: if kickoff_logged {
                Some(format!("{logged_hours:.1}h logged"))
            } else {
                None
            },
        });

        let docs_ready = !matching_docs.is_empty();
        let first_doc_date = matching_docs
            .iter()
            .filter_map(|doc| doc.modified_on)
            .min()
            .and_then(ms_to_datetime_string);
        tasks.push(OnboardingTaskView {
            id: format!("{}-docs", slugify_client_name(&client_name)),
            title: "Knowledge docs linked".to_string(),
            completed: docs_ready,
            completed_at: first_doc_date,
            resource_created: if docs_ready {
                Some(format!("{} docs", matching_docs.len()))
            } else {
                None
            },
        });

        let delivery_active = matching_issues + matching_cards > 0;
        tasks.push(OnboardingTaskView {
            id: format!("{}-delivery", slugify_client_name(&client_name)),
            title: "Delivery board activity detected".to_string(),
            completed: delivery_active,
            completed_at: None,
            resource_created: if delivery_active {
                Some(format!("{} signals", matching_issues + matching_cards))
            } else {
                None
            },
        });

        let total_tasks = tasks.len() as u32;
        let completed_tasks = tasks.iter().filter(|task| task.completed).count() as u32;
        let progress_percent = if total_tasks > 0 {
            (completed_tasks as f64 / total_tasks as f64) * 100.0
        } else {
            0.0
        };

        let start_date = first_time_entry
            .clone()
            .or(first_project_created.clone())
            .unwrap_or_else(|| Utc::now().format("%Y-%m-%dT00:00:00").to_string());
        let days_elapsed = parse_datetime_flexible(&start_date)
            .map(|start| Utc::now().signed_duration_since(start).num_days().max(0) as u32)
            .unwrap_or(0);

        let status = if completed_tasks == total_tasks && total_tasks > 0 {
            "completed"
        } else if days_elapsed >= 14 && progress_percent < 60.0 {
            "stalled"
        } else {
            "in_progress"
        }
        .to_string();

        flows.push(OnboardingFlowView {
            client_id: format!("onboarding-{}", slugify_client_name(&client_name)),
            client_name,
            start_date,
            completed_tasks,
            total_tasks,
            progress_percent,
            status,
            tasks,
            days_elapsed,
        });
    }

    flows.sort_by(|left, right| {
        left.status
            .cmp(&right.status)
            .then(right.days_elapsed.cmp(&left.days_elapsed))
            .then(left.client_name.cmp(&right.client_name))
    });
    Ok(flows)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerSlotView {
    pub employee_name: String,
    pub scheduled_hours: f64,
    pub actual_hours: f64,
    pub focus_blocks: u32,
    pub meeting_blocks: u32,
    pub capacity_utilization: f64,
}

#[tauri::command]
pub async fn get_planner_capacity(db: State<'_, DbPool>) -> Result<Vec<PlannerSlotView>, String> {
    let pool = &db.0;
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("load employees for planner: {e}"))?;

    let now = Local::now();
    let today = now.date_naive();
    let day_start = today
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let next_day = (today + chrono::Duration::days(1))
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .format("%Y-%m-%dT%H:%M:%SZ")
        .to_string();
    let day_start_ms = today
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();
    let day_end_ms = (today + chrono::Duration::days(1))
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_utc()
        .timestamp_millis();

    let mut meetings_by_person: HashMap<String, u32> = HashMap::new();
    let mut open_issue_load_by_person: HashMap<String, f64> = HashMap::new();

    if let Ok(client) = get_huly_client(pool).await {
        let (events, issues) = tokio::join!(client.get_calendar_events(), client.get_issues(None));
        let events = events.unwrap_or_default();
        let issues = issues.unwrap_or_default();

        for event in events {
            let Some(start_ms) = event.date else {
                continue;
            };
            if start_ms < day_start_ms || start_ms >= day_end_ms {
                continue;
            }

            if let Some(creator) = event.created_by.as_deref() {
                *meetings_by_person.entry(creator.to_string()).or_default() += 1;
            }
            if let Some(participants) = event.participants {
                for participant in participants {
                    *meetings_by_person.entry(participant).or_default() += 1;
                }
            }
        }

        for issue in issues {
            if issue_is_completed(&issue) {
                continue;
            }
            let Some(assignee) = issue.assignee.as_deref() else {
                continue;
            };
            *open_issue_load_by_person
                .entry(assignee.to_string())
                .or_default() += 0.5;
        }
    }

    let mut rows = Vec::new();
    for employee in employees.into_iter().filter(|employee| employee.is_active) {
        let actual_hours = query_hours_for_range(pool, &employee.id, &day_start, &next_day).await?;
        let meeting_blocks = employee
            .huly_person_id
            .as_deref()
            .and_then(|person_id| meetings_by_person.get(person_id))
            .copied()
            .unwrap_or(0);
        let issue_load = employee
            .huly_person_id
            .as_deref()
            .and_then(|person_id| open_issue_load_by_person.get(person_id))
            .copied()
            .unwrap_or(0.0);

        let scheduled_hours = (actual_hours + meeting_blocks as f64 + issue_load).clamp(0.0, 12.0);
        let focus_blocks = (scheduled_hours - meeting_blocks as f64).max(0.0).round() as u32;
        let capacity_utilization = (scheduled_hours / 8.0) * 100.0;

        rows.push(PlannerSlotView {
            employee_name: employee.name,
            scheduled_hours,
            actual_hours,
            focus_blocks,
            meeting_blocks,
            capacity_utilization,
        });
    }

    rows.sort_by(|left, right| left.employee_name.cmp(&right.employee_name));
    Ok(rows)
}

struct TrainingTrackBlueprint {
    id: &'static str,
    name: &'static str,
    total_modules: u32,
    modules: &'static [&'static str],
}

const TRAINING_TRACK_BLUEPRINTS: &[TrainingTrackBlueprint] = &[
    TrainingTrackBlueprint {
        id: "onboarding",
        name: "Onboarding Track",
        total_modules: 6,
        modules: &[
            "Repo Orientation",
            "Sync Pipeline Basics",
            "Operational Playbooks",
            "Alerting & Escalation",
            "Client Delivery QA",
            "Release Readiness",
        ],
    },
    TrainingTrackBlueprint {
        id: "smart-home",
        name: "Smart Home Integration Track",
        total_modules: 8,
        modules: &[
            "Device Protocol Basics",
            "Gateway Integrations",
            "Firmware Lifecycle",
            "IoT Reliability Patterns",
            "Field Diagnostics",
            "Telemetry Validation",
            "Integration Regression",
            "Production Hardening",
        ],
    },
    TrainingTrackBlueprint {
        id: "pm-dev",
        name: "PM-Developer Track",
        total_modules: 7,
        modules: &[
            "Scope Breakdown",
            "Sprint Definition",
            "Dependency Mapping",
            "Execution Coordination",
            "Risk Management",
            "Retro Synthesis",
            "Outcome Reporting",
        ],
    },
    TrainingTrackBlueprint {
        id: "rd",
        name: "R&D Contributor Track",
        total_modules: 5,
        modules: &[
            "Research Intake",
            "Spike Design",
            "Prototype Validation",
            "Evidence Capture",
            "Knowledge Transfer",
        ],
    },
];

#[derive(Debug, Clone)]
struct EmployeeTrainingSignal {
    employee_name: String,
    hours_month: f64,
    distinct_projects: u32,
    device_hours: f64,
    documentation_hours: f64,
    coordination_hours: f64,
    experimentation_hours: f64,
}

fn training_track_catalog() -> &'static [TrainingTrackBlueprint] {
    TRAINING_TRACK_BLUEPRINTS
}

fn issue_status_text(issue: &HulyIssue) -> String {
    issue
        .status
        .as_ref()
        .map(|status| {
            status
                .as_str()
                .map(|value| value.to_string())
                .unwrap_or_else(|| status.to_string())
        })
        .unwrap_or_default()
}

fn status_indicates_completion(status_text: &str) -> bool {
    let normalized = status_text.to_lowercase();
    [
        "done",
        "completed",
        "closed",
        "resolved",
        "canceled",
        "cancelled",
        "deployed",
    ]
    .iter()
    .any(|keyword| normalized.contains(keyword))
}

fn issue_is_completed(issue: &HulyIssue) -> bool {
    status_indicates_completion(&issue_status_text(issue))
}

fn issue_completed_at(issue: &HulyIssue) -> Option<i64> {
    if issue_is_completed(issue) {
        issue.modified_on.or(issue.created_on)
    } else {
        None
    }
}

fn score_to_skill_level(score: f64) -> u32 {
    if score >= 0.75 {
        3
    } else if score >= 0.45 {
        2
    } else if score >= 0.2 {
        1
    } else {
        0
    }
}

fn compute_training_progress(track_id: &str, signal: &EmployeeTrainingSignal) -> f64 {
    let hours_ratio = (signal.hours_month / 160.0).clamp(0.0, 1.0);
    let project_ratio = (signal.distinct_projects as f64 / 4.0).clamp(0.0, 1.0);
    let total_hours = signal.hours_month.max(1.0);
    let device_ratio = (signal.device_hours / total_hours).clamp(0.0, 1.0);
    let docs_ratio = (signal.documentation_hours / total_hours).clamp(0.0, 1.0);
    let coordination_ratio = (signal.coordination_hours / total_hours).clamp(0.0, 1.0);
    let experimentation_ratio = (signal.experimentation_hours / total_hours).clamp(0.0, 1.0);

    let weighted = match track_id {
        "onboarding" => 0.35 * hours_ratio + 0.35 * project_ratio + 0.30 * docs_ratio,
        "smart-home" => 0.25 * hours_ratio + 0.55 * device_ratio + 0.20 * project_ratio,
        "pm-dev" => 0.40 * hours_ratio + 0.30 * coordination_ratio + 0.30 * project_ratio,
        "rd" => 0.25 * hours_ratio + 0.45 * experimentation_ratio + 0.30 * docs_ratio,
        _ => 0.0,
    };
    (weighted * 100.0).clamp(0.0, 100.0)
}

fn build_training_status_rows(signals: &[EmployeeTrainingSignal]) -> Vec<TrainingStatusRow> {
    let now = Local::now();
    let deadline = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1)
            .unwrap()
            .pred_opt()
            .unwrap()
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1)
            .unwrap()
            .pred_opt()
            .unwrap()
    }
    .format("%Y-%m-%d")
    .to_string();

    let mut rows = Vec::new();
    for signal in signals {
        for track in training_track_catalog() {
            let progress = compute_training_progress(track.id, signal);
            let mut modules_done = ((progress / 100.0) * track.total_modules as f64).floor() as u32;
            if progress >= 99.5 {
                modules_done = track.total_modules;
            }
            modules_done = modules_done.min(track.total_modules);

            let next_module = if modules_done < track.total_modules {
                track
                    .modules
                    .get(modules_done as usize)
                    .map(|module| module.to_string())
            } else {
                None
            };

            let status = if modules_done >= track.total_modules {
                "completed"
            } else if now.day() >= 25 && progress < 60.0 {
                "overdue"
            } else {
                "in progress"
            }
            .to_string();

            rows.push(TrainingStatusRow {
                employee_name: signal.employee_name.clone(),
                track: track.name.to_string(),
                progress,
                modules_done,
                total_modules: track.total_modules,
                next_module,
                deadline: Some(deadline.clone()),
                status,
            });
        }
    }

    rows.sort_by(|left, right| {
        left.employee_name
            .cmp(&right.employee_name)
            .then(left.track.cmp(&right.track))
    });
    rows
}

async fn load_training_signals(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<EmployeeTrainingSignal>, String> {
    #[derive(sqlx::FromRow)]
    struct TrainingSignalRow {
        total_hours: f64,
        distinct_projects: i64,
        device_hours: f64,
        documentation_hours: f64,
        coordination_hours: f64,
        experimentation_hours: f64,
    }

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("load employees for training: {e}"))?;

    let now = Local::now();
    let month_start = NaiveDate::from_ymd_opt(now.year(), now.month(), 1)
        .unwrap()
        .format("%Y-%m-%dT00:00:00Z")
        .to_string();
    let month_end = if now.month() == 12 {
        NaiveDate::from_ymd_opt(now.year() + 1, 1, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(now.year(), now.month() + 1, 1).unwrap()
    }
    .format("%Y-%m-%dT00:00:00Z")
    .to_string();

    let mut signals = Vec::new();
    for employee in employees.into_iter().filter(|employee| employee.is_active) {
        let row: TrainingSignalRow = sqlx::query_as(
            "SELECT
                COALESCE(SUM(COALESCE(te.duration_seconds, 0)) / 3600.0, 0) AS total_hours,
                COUNT(DISTINCT te.project_id) AS distinct_projects,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(COALESCE(te.description, '')) LIKE '%device%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%iot%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%firmware%'
                          OR LOWER(COALESCE(p.name, '')) LIKE '%device%'
                          OR LOWER(COALESCE(p.name, '')) LIKE '%iot%'
                          OR LOWER(COALESCE(p.name, '')) LIKE '%firmware%'
                        THEN COALESCE(te.duration_seconds, 0)
                        ELSE 0
                    END
                ) / 3600.0, 0) AS device_hours,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(COALESCE(te.description, '')) LIKE '%doc%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%guide%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%runbook%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%sop%'
                        THEN COALESCE(te.duration_seconds, 0)
                        ELSE 0
                    END
                ) / 3600.0, 0) AS documentation_hours,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(COALESCE(te.description, '')) LIKE '%meeting%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%sync%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%planning%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%review%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%retro%'
                        THEN COALESCE(te.duration_seconds, 0)
                        ELSE 0
                    END
                ) / 3600.0, 0) AS coordination_hours,
                COALESCE(SUM(
                    CASE
                        WHEN LOWER(COALESCE(te.description, '')) LIKE '%research%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%spike%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%prototype%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%experiment%'
                          OR LOWER(COALESCE(te.description, '')) LIKE '%r&d%'
                        THEN COALESCE(te.duration_seconds, 0)
                        ELSE 0
                    END
                ) / 3600.0, 0) AS experimentation_hours
             FROM time_entries te
             LEFT JOIN projects p ON p.id = te.project_id
             WHERE te.employee_id = ?1
               AND te.start_time >= ?2
               AND te.start_time < ?3",
        )
        .bind(&employee.id)
        .bind(&month_start)
        .bind(&month_end)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("query training signals for {}: {e}", employee.name))?;

        signals.push(EmployeeTrainingSignal {
            employee_name: employee.name,
            hours_month: row.total_hours,
            distinct_projects: row.distinct_projects.max(0) as u32,
            device_hours: row.device_hours,
            documentation_hours: row.documentation_hours,
            coordination_hours: row.coordination_hours,
            experimentation_hours: row.experimentation_hours,
        });
    }

    signals.sort_by(|left, right| left.employee_name.cmp(&right.employee_name));
    Ok(signals)
}

// ── Cloud credential sync ────────────────────────────────────────

const DEFAULT_WORKER_BASE_URL: &str = "https://teamforge-api.sheshnarayan-iyer.workers.dev";
const DEFAULT_CREDENTIALS_AUDIENCE: &str = "teamforge-desktop";

#[derive(Debug, Clone, Deserialize)]
struct CloudCredential {
    available: bool,
    token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CloudCredentials {
    clockify: Option<CloudCredential>,
    huly: Option<CloudCredential>,
    slack: Option<CloudCredential>,
    github: Option<CloudCredential>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudIntegrationConfig {
    clockify: Option<CloudClockifyIntegration>,
    huly: Option<CloudHulyIntegration>,
    slack: Option<CloudSlackIntegration>,
    github: Option<CloudGithubIntegration>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudClockifyIntegration {
    workspace_id: Option<String>,
    ignored_emails: Option<Vec<String>>,
    ignored_employee_ids: Option<Vec<String>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudHulyIntegration {
    mirror_mode: Option<String>,
    mirror_enabled: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudSlackIntegration {
    channel_filters: Option<Vec<String>>,
    backfill_days: Option<i64>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudGithubIntegration {
    repos: Option<Vec<CloudGithubRepoConfig>>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CloudGithubRepoConfig {
    repo: String,
    display_name: Option<String>,
    client_name: Option<String>,
    default_milestone_number: Option<i64>,
    huly_project_id: Option<String>,
    clockify_project_id: Option<String>,
    enabled: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
struct CloudCredentialResponse {
    ok: bool,
    data: Option<CloudCredentialData>,
}

#[derive(Debug, Clone, Deserialize)]
struct CloudCredentialData {
    credentials: CloudCredentials,
    integrations: Option<CloudIntegrationConfig>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CredentialSyncResult {
    pub synced: Vec<String>,
    pub skipped: Vec<String>,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudIntegrationSyncResult {
    pub cloud: CredentialSyncResult,
    pub clockify: Option<String>,
    pub huly: Option<String>,
    pub slack: Option<String>,
    pub github: Vec<GithubSyncReport>,
    pub errors: Vec<String>,
}

#[tauri::command]
pub async fn sync_cloud_credentials(db: State<'_, DbPool>) -> Result<CredentialSyncResult, String> {
    sync_cloud_credentials_for_pool(&db.0).await
}

#[tauri::command]
pub async fn sync_cloud_integrations(
    db: State<'_, DbPool>,
) -> Result<CloudIntegrationSyncResult, String> {
    let pool = &db.0;
    let cloud = sync_cloud_credentials_for_pool(pool).await?;
    let mut errors = Vec::new();

    let clockify = match run_clockify_full_sync_from_settings(pool).await {
        Ok(value) => value,
        Err(error) => {
            errors.push(format!("clockify: {error}"));
            None
        }
    };

    let huly = match run_huly_full_sync_from_settings(pool).await {
        Ok(value) => value,
        Err(error) => {
            errors.push(format!("huly: {error}"));
            None
        }
    };

    let slack = match run_slack_delta_sync_from_settings(pool).await {
        Ok(value) => value,
        Err(error) => {
            errors.push(format!("slack: {error}"));
            None
        }
    };

    let github = match run_github_sync_from_settings(pool).await {
        Ok(value) => value,
        Err(error) => {
            errors.push(format!("github: {error}"));
            Vec::new()
        }
    };

    if let Err(error) = queries::refresh_agent_feed_projection(pool).await {
        errors.push(format!("agent_feed: {error}"));
    }

    Ok(CloudIntegrationSyncResult {
        cloud,
        clockify,
        huly,
        slack,
        github,
        errors,
    })
}

async fn sync_cloud_credentials_for_pool(
    pool: &sqlx::SqlitePool,
) -> Result<CredentialSyncResult, String> {
    let base_url = queries::get_setting(pool, "cloud_credentials_base_url")
        .await
        .map_err(|e| format!("read cloud_credentials_base_url: {e}"))?
        .unwrap_or_else(|| DEFAULT_WORKER_BASE_URL.to_string());
    let audience = queries::get_setting(pool, "cloud_credentials_audience")
        .await
        .map_err(|e| format!("read cloud_credentials_audience: {e}"))?
        .unwrap_or_else(|| DEFAULT_CREDENTIALS_AUDIENCE.to_string());
    let access_token = queries::get_setting(pool, "cloud_credentials_access_token")
        .await
        .map_err(|e| format!("read cloud_credentials_access_token: {e}"))?
        .ok_or("cloud credential access token is not configured")?;

    let access_token = access_token.trim();
    if access_token.is_empty() {
        return Err("cloud credential access token is not configured".to_string());
    }

    let mut url =
        reqwest::Url::parse(&(base_url.trim_end_matches('/').to_string() + "/v1/credentials"))
            .map_err(|e| format!("invalid cloud base url: {e}"))?;
    url.query_pairs_mut()
        .append_pair("audience", audience.trim());

    let client = reqwest::Client::new();
    let resp = client
        .get(url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("cloud request failed: {e}"))?;

    if !resp.status().is_success() {
        return Err(format!("cloud returned status {}", resp.status()));
    }

    let body: CloudCredentialResponse =
        resp.json().await.map_err(|e| format!("parse error: {e}"))?;
    if !body.ok {
        return Err("cloud returned ok=false".to_string());
    }

    let data = body.data.ok_or("no credential data in response")?;
    let creds = data.credentials;

    let mut synced = Vec::new();
    let mut skipped = Vec::new();
    let mut errors = Vec::new();

    let pairs: Vec<(&str, Option<&CloudCredential>)> = vec![
        ("clockify_api_key", creds.clockify.as_ref()),
        ("huly_token", creds.huly.as_ref()),
        ("slack_bot_token", creds.slack.as_ref()),
        ("github_token", creds.github.as_ref()),
    ];

    for (key, cred) in pairs {
        match cred {
            Some(c) if c.available && c.token.is_some() => {
                let token = c.token.as_ref().unwrap();
                if let Err(e) = queries::set_setting(pool, key, token).await {
                    errors.push(format!("{key}: {e}"));
                } else {
                    synced.push(key.to_string());
                }
            }
            _ => {
                skipped.push(key.to_string());
            }
        }
    }

    apply_cloud_integration_config(
        pool,
        data.integrations,
        &mut synced,
        &mut skipped,
        &mut errors,
    )
    .await;

    Ok(CredentialSyncResult {
        synced,
        skipped,
        errors,
    })
}

fn clean_optional_string(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let trimmed = item.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn clean_string_list(values: Option<Vec<String>>) -> Option<String> {
    let joined = values
        .unwrap_or_default()
        .into_iter()
        .filter_map(|item| clean_optional_string(Some(item)))
        .collect::<Vec<_>>()
        .join(", ");

    if joined.is_empty() {
        None
    } else {
        Some(joined)
    }
}

async fn set_cloud_setting_if_present(
    pool: &sqlx::SqlitePool,
    key: &str,
    value: Option<String>,
    synced: &mut Vec<String>,
    skipped: &mut Vec<String>,
    errors: &mut Vec<String>,
) {
    let Some(value) = clean_optional_string(value) else {
        skipped.push(key.to_string());
        return;
    };

    if let Err(error) = queries::set_setting(pool, key, &value).await {
        errors.push(format!("{key}: {error}"));
    } else {
        synced.push(key.to_string());
    }
}

async fn apply_cloud_integration_config(
    pool: &sqlx::SqlitePool,
    integrations: Option<CloudIntegrationConfig>,
    synced: &mut Vec<String>,
    skipped: &mut Vec<String>,
    errors: &mut Vec<String>,
) {
    let Some(integrations) = integrations else {
        skipped.push("integration_config".to_string());
        return;
    };

    if let Some(clockify) = integrations.clockify {
        set_cloud_setting_if_present(
            pool,
            "clockify_workspace_id",
            clockify.workspace_id,
            synced,
            skipped,
            errors,
        )
        .await;
        set_cloud_setting_if_present(
            pool,
            "clockify_ignored_emails",
            clean_string_list(clockify.ignored_emails),
            synced,
            skipped,
            errors,
        )
        .await;
        set_cloud_setting_if_present(
            pool,
            "clockify_ignored_employee_ids",
            clean_string_list(clockify.ignored_employee_ids),
            synced,
            skipped,
            errors,
        )
        .await;
    } else {
        skipped.push("integration_config.clockify".to_string());
    }

    if let Some(huly) = integrations.huly {
        set_cloud_setting_if_present(
            pool,
            "huly_mirror_mode",
            huly.mirror_mode,
            synced,
            skipped,
            errors,
        )
        .await;
        if let Some(enabled) = huly.mirror_enabled {
            if let Err(error) = queries::set_setting(
                pool,
                "huly_mirror_enabled",
                if enabled { "true" } else { "false" },
            )
            .await
            {
                errors.push(format!("huly_mirror_enabled: {error}"));
            } else {
                synced.push("huly_mirror_enabled".to_string());
            }
        } else {
            skipped.push("huly_mirror_enabled".to_string());
        }
    } else {
        skipped.push("integration_config.huly".to_string());
    }

    if let Some(slack) = integrations.slack {
        set_cloud_setting_if_present(
            pool,
            "slack_channel_filters",
            clean_string_list(slack.channel_filters),
            synced,
            skipped,
            errors,
        )
        .await;
        set_cloud_setting_if_present(
            pool,
            "slack_sync_backfill_days",
            slack
                .backfill_days
                .filter(|days| *days > 0)
                .map(|days| days.to_string()),
            synced,
            skipped,
            errors,
        )
        .await;
    } else {
        skipped.push("integration_config.slack".to_string());
    }

    if let Some(github) = integrations.github {
        let repos = github.repos.unwrap_or_default();
        if repos.is_empty() {
            skipped.push("github_repo_configs".to_string());
        } else {
            if let Err(error) = sqlx::query(
                "UPDATE github_repo_configs SET enabled = 0, updated_at = datetime('now')",
            )
            .execute(pool)
            .await
            {
                errors.push(format!("github_repo_configs.disable_old: {error}"));
            }

            let now = Utc::now().to_rfc3339();
            let mut configured_repos = Vec::new();
            for cloud_repo in repos {
                let repo = cloud_repo.repo.trim().to_string();
                if repo.is_empty() || !repo.contains('/') {
                    errors.push(format!(
                        "github_repo_configs: invalid repo '{}'",
                        cloud_repo.repo
                    ));
                    continue;
                }
                configured_repos.push(repo.clone());
                let config = GithubRepoConfig {
                    display_name: clean_optional_string(cloud_repo.display_name)
                        .unwrap_or_else(|| repo.clone()),
                    client_name: clean_optional_string(cloud_repo.client_name),
                    repo,
                    default_milestone_number: cloud_repo.default_milestone_number,
                    huly_project_id: clean_optional_string(cloud_repo.huly_project_id),
                    clockify_project_id: clean_optional_string(cloud_repo.clockify_project_id),
                    enabled: cloud_repo.enabled.unwrap_or(true),
                    created_at: now.clone(),
                    updated_at: now.clone(),
                };

                if let Err(error) = queries::upsert_github_repo_config(pool, &config).await {
                    errors.push(format!("github_repo_configs.{}: {error}", config.repo));
                }
            }

            if configured_repos.is_empty() {
                skipped.push("github_repos".to_string());
            } else if let Err(error) =
                queries::set_setting(pool, "github_repos", &configured_repos.join(", ")).await
            {
                errors.push(format!("github_repos: {error}"));
            } else {
                synced.push("github_repo_configs".to_string());
                synced.push("github_repos".to_string());
            }
        }
    } else {
        skipped.push("integration_config.github".to_string());
    }
}

async fn run_clockify_full_sync_from_settings(
    pool: &sqlx::SqlitePool,
) -> Result<Option<String>, String> {
    let api_key = queries::get_setting(pool, "clockify_api_key")
        .await
        .map_err(|e| format!("read clockify api key: {e}"))?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let workspace_id = queries::get_setting(pool, "clockify_workspace_id")
        .await
        .map_err(|e| format!("read clockify workspace: {e}"))?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let (Some(api_key), Some(workspace_id)) = (api_key, workspace_id) else {
        return Ok(None);
    };

    let engine = ClockifySyncEngine::new(
        Arc::new(ClockifyClient::new(api_key)),
        pool.clone(),
        workspace_id,
    );
    let report = engine.full_sync().await?;
    Ok(Some(format!(
        "Sync complete: {} users, {} projects, {} time entries",
        report.users_synced, report.projects_synced, report.time_entries_synced
    )))
}

async fn run_huly_full_sync_from_settings(
    pool: &sqlx::SqlitePool,
) -> Result<Option<String>, String> {
    let token = queries::get_setting(pool, "huly_token")
        .await
        .map_err(|e| format!("read huly token: {e}"))?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(token) = token else {
        return Ok(None);
    };

    let client = HulyClient::connect(None, &token).await?;
    let engine = HulySyncEngine::new(Arc::new(client), pool.clone());
    let report = engine.full_sync().await?;
    Ok(Some(format!(
        "Huly sync complete: {} issue activities, {} presence updates, {} cached Team records",
        report.issues_synced, report.presence_updated, report.team_cache_items
    )))
}

async fn run_slack_delta_sync_from_settings(
    pool: &sqlx::SqlitePool,
) -> Result<Option<String>, String> {
    let token = queries::get_setting(pool, "slack_bot_token")
        .await
        .map_err(|e| format!("read slack token: {e}"))?
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let Some(token) = token else {
        return Ok(None);
    };

    let engine = SlackSyncEngine::new(Arc::new(SlackClient::new(token)), pool.clone());
    engine.sync_message_deltas().await?;
    Ok(Some("Slack delta sync complete".to_string()))
}

async fn run_github_sync_from_settings(
    pool: &sqlx::SqlitePool,
) -> Result<Vec<GithubSyncReport>, String> {
    seed_configured_github_repos(pool).await?;

    let Some(token) = queries::get_setting(pool, "github_token")
        .await
        .map_err(|e| format!("read github token: {e}"))?
        .or_else(|| std::env::var("GITHUB_TOKEN").ok())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    else {
        return Ok(Vec::new());
    };

    let engine = GithubSyncEngine::new(GithubClient::new(token), pool.clone());
    engine.sync_all().await
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn test_snapshot() -> WorkspaceNormalizationSnapshotData {
        WorkspaceNormalizationSnapshotData {
            account: HulyAccountInfo {
                uuid: Some("acc-1".to_string()),
                email: Some("test@example.com".to_string()),
                ..HulyAccountInfo::default()
            },
            projects: vec![
                HulyProject {
                    id: "project-heyza".to_string(),
                    name: Some("HEYZA".to_string()),
                    description: Some(String::new()),
                    private: Some(false),
                    members: Some(vec![]),
                    owners: Some(vec!["acc-1".to_string()]),
                    archived: Some(false),
                    auto_join: Some(false),
                    r#type: Some("tracker:project-type:default".to_string()),
                    identifier: Some("HEYZA".to_string()),
                    sequence: Some(0),
                    default_issue_status: Some("tracker:status:todo".to_string()),
                    default_assignee: None,
                    default_time_report_day: Some(json!("PreviousWorkDay")),
                    icon: None,
                    color: None,
                    class: Some(HULY_PROJECT_CLASS.to_string()),
                },
                HulyProject {
                    id: "project-vibra".to_string(),
                    name: Some("VIBRA".to_string()),
                    description: Some(String::new()),
                    private: Some(false),
                    members: Some(vec![]),
                    owners: Some(vec!["acc-1".to_string()]),
                    archived: Some(false),
                    auto_join: Some(false),
                    r#type: Some("tracker:project-type:default".to_string()),
                    identifier: Some("VIBRA".to_string()),
                    sequence: Some(0),
                    default_issue_status: Some("tracker:status:todo".to_string()),
                    default_assignee: None,
                    default_time_report_day: Some(json!("PreviousWorkDay")),
                    icon: None,
                    color: None,
                    class: Some(HULY_PROJECT_CLASS.to_string()),
                },
                HulyProject {
                    id: "unknown-project".to_string(),
                    name: Some("Misc".to_string()),
                    description: Some(String::new()),
                    private: Some(false),
                    members: Some(vec![]),
                    owners: Some(vec!["acc-1".to_string()]),
                    archived: Some(false),
                    auto_join: Some(false),
                    r#type: Some("tracker:project-type:default".to_string()),
                    identifier: Some("MISC".to_string()),
                    sequence: Some(0),
                    default_issue_status: Some("tracker:status:todo".to_string()),
                    default_assignee: None,
                    default_time_report_day: Some(json!("PreviousWorkDay")),
                    icon: None,
                    color: None,
                    class: Some(HULY_PROJECT_CLASS.to_string()),
                },
            ],
            issues: vec![HulyIssue {
                id: "issue-1".to_string(),
                identifier: Some("TSK-1".to_string()),
                title: Some("Integrate Tuya thermostat".to_string()),
                description: Some("Need Tuya API support for the new device".to_string()),
                status: None,
                priority: None,
                assignee: None,
                created_by: None,
                modified_by: None,
                modified_on: None,
                created_on: None,
                number: Some(1),
                space: Some("unknown-project".to_string()),
                estimation: None,
                remaining_time: None,
                class: Some(HULY_ISSUE_CLASS.to_string()),
            }],
            departments: vec![HulyDepartment {
                id: "dept-org".to_string(),
                name: Some("Organization".to_string()),
                description: Some(String::new()),
                parent: None,
                team_lead: None,
                managers: Some(vec![]),
                head: None,
                members: Some(vec![]),
                class: Some(HULY_DEPARTMENT_CLASS.to_string()),
            }],
            channels: vec![HulyChannel {
                id: "channel-general".to_string(),
                name: Some("general".to_string()),
                title: None,
                description: Some("General".to_string()),
                topic: Some("General".to_string()),
                private: Some(false),
                archived: Some(false),
                owners: Some(vec!["acc-1".to_string()]),
                auto_join: Some(true),
                members: Some(vec!["acc-1".to_string()]),
                class: Some(HULY_CHANNEL_CLASS.to_string()),
            }],
            employees: vec![HulyEmployee {
                id: "employee-1".to_string(),
                name: Some("Someone".to_string()),
                active: Some(true),
                position: Some("Developer".to_string()),
                person_uuid: Some("acc-1".to_string()),
                class: Some("contact:mixin:Employee".to_string()),
            }],
            persons: vec![
                HulyPerson {
                    id: "person-akshay-1".to_string(),
                    name: Some("Akshay Balraj".to_string()),
                    channels: None,
                    city: None,
                    class: Some("contact:class:Person".to_string()),
                },
                HulyPerson {
                    id: "person-akshay-2".to_string(),
                    name: Some("Akshay Balraj".to_string()),
                    channels: None,
                    city: None,
                    class: Some("contact:class:Person".to_string()),
                },
            ],
            documents: vec![HulyDocument {
                id: "doc-1".to_string(),
                title: Some("Untitled".to_string()),
                content: None,
                parent: None,
                space: None,
                created_by: None,
                modified_on: None,
                class: Some("document:class:Document".to_string()),
            }],
            boards: vec![HulyBoard {
                id: "board-default".to_string(),
                name: Some("Default".to_string()),
                description: Some("Default board".to_string()),
                private: Some(false),
                archived: Some(false),
                members: Some(vec![]),
                owners: Some(vec!["acc-1".to_string()]),
                r#type: Some("board:type:default".to_string()),
                class: Some("board:class:Board".to_string()),
            }],
            board_cards: vec![],
        }
    }

    #[test]
    fn normalization_plan_captures_safe_actions_and_manual_reviews() {
        let snapshot = test_snapshot();
        let (operations, warnings) = build_workspace_normalization_plan(&snapshot);
        let actions: Vec<_> = operations
            .iter()
            .map(WorkspaceNormalizationOperation::to_action)
            .collect();

        assert!(warnings.is_empty());
        assert!(actions.iter().any(|action| {
            action.kind == "rename"
                && action.current_value.as_deref() == Some("HEYZA")
                && action.desired_value.as_deref() == Some("Axtech")
        }));
        assert!(actions.iter().any(|action| {
            action.kind == "create" && action.desired_value.as_deref() == Some("Tuya clients")
        }));
        assert!(actions.iter().any(|action| {
            action.kind == "move" && action.desired_value.as_deref() == Some("Tuya clients")
        }));
        assert!(actions
            .iter()
            .any(|action| { action.category == "people" && action.kind == "manualReview" }));
        assert!(actions
            .iter()
            .any(|action| { action.category == "documents" && action.kind == "manualReview" }));
        assert!(actions
            .iter()
            .any(|action| { action.category == "board" && action.kind == "archive" }));
    }

    #[test]
    fn slack_missing_scope_error_names_exact_scope() {
        let message = humanize_slack_connection_error(
            "Slack API rejected conversations.list: missing_scope | needed=groups:read | provided=channels:read,users:read"
                .to_string(),
        );

        assert!(message.contains("missing scope `groups:read`"));
        assert!(message.contains("Reinstall to Workspace"));
        assert!(message.contains("TeamForge expects"));
    }

    #[test]
    fn org_chart_omits_people_from_ignored_email_list() {
        let departments = vec![HulyDepartment {
            id: "dept-eng".to_string(),
            name: Some("Engineering".to_string()),
            description: Some(String::new()),
            parent: None,
            team_lead: Some("person-ignored".to_string()),
            managers: Some(vec![]),
            head: Some("person-ignored".to_string()),
            members: Some(vec![
                "person-ignored".to_string(),
                "person-kept".to_string(),
            ]),
            class: Some(HULY_DEPARTMENT_CLASS.to_string()),
        }];
        let persons = vec![
            HulyPerson {
                id: "person-ignored".to_string(),
                name: Some("Admin".to_string()),
                channels: None,
                city: None,
                class: Some("contact:class:Person".to_string()),
            },
            HulyPerson {
                id: "person-kept".to_string(),
                name: Some("Builder".to_string()),
                channels: None,
                city: None,
                class: Some("contact:class:Person".to_string()),
            },
        ];
        let huly_employees = vec![
            HulyEmployee {
                id: "huly-ignored".to_string(),
                name: Some("Admin".to_string()),
                active: Some(true),
                position: Some("Ops".to_string()),
                person_uuid: Some("person-ignored".to_string()),
                class: Some("contact:mixin:Employee".to_string()),
            },
            HulyEmployee {
                id: "huly-kept".to_string(),
                name: Some("Builder".to_string()),
                active: Some(true),
                position: Some("Engineer".to_string()),
                person_uuid: Some("person-kept".to_string()),
                class: Some("contact:mixin:Employee".to_string()),
            },
        ];
        let db_employees = vec![
            Employee {
                id: "db-ignored".to_string(),
                clockify_user_id: "clockify-ignored".to_string(),
                huly_person_id: Some("person-ignored".to_string()),
                name: "Admin".to_string(),
                email: "thoughtseedlabs@gmail.com".to_string(),
                avatar_url: None,
                monthly_quota_hours: 0.0,
                is_active: false,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
            Employee {
                id: "db-kept".to_string(),
                clockify_user_id: "clockify-kept".to_string(),
                huly_person_id: Some("person-kept".to_string()),
                name: "Builder".to_string(),
                email: "builder@thoughtseedlabs.com".to_string(),
                avatar_url: None,
                monthly_quota_hours: 160.0,
                is_active: true,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
        ];
        let ignored_emails = HashSet::from([DEFAULT_CLOCKIFY_IGNORED_EMAILS.to_string()]);
        let ignored_employee_ids = HashSet::new();

        let org_chart = build_org_chart_view(
            departments,
            persons,
            huly_employees,
            db_employees,
            &ignored_emails,
            &ignored_employee_ids,
        );

        assert_eq!(org_chart.people.len(), 1);
        assert_eq!(org_chart.people[0].person_id, "person-kept");
        assert_eq!(org_chart.departments.len(), 1);
        assert_eq!(org_chart.departments[0].head_person_id, None);
        assert_eq!(org_chart.departments[0].team_lead_person_id, None);
        assert_eq!(
            org_chart.departments[0].member_person_ids,
            vec!["person-kept".to_string()]
        );
    }

    #[test]
    fn org_chart_omits_people_from_ignored_employee_id_list() {
        let departments = vec![HulyDepartment {
            id: "dept-engineering".to_string(),
            name: Some("Engineering".to_string()),
            description: None,
            parent: None,
            team_lead: Some("person-ignored".to_string()),
            managers: None,
            head: Some("person-ignored".to_string()),
            members: Some(vec![
                "person-ignored".to_string(),
                "person-kept".to_string(),
            ]),
            class: Some("hr:class:Department".to_string()),
        }];
        let persons = vec![
            HulyPerson {
                id: "person-ignored".to_string(),
                name: Some("Ghost".to_string()),
                channels: None,
                city: None,
                class: Some("contact:class:Person".to_string()),
            },
            HulyPerson {
                id: "person-kept".to_string(),
                name: Some("Builder".to_string()),
                channels: None,
                city: None,
                class: Some("contact:class:Person".to_string()),
            },
        ];
        let huly_employees = vec![
            HulyEmployee {
                id: "huly-ignored".to_string(),
                name: Some("Ghost".to_string()),
                active: Some(true),
                position: Some("Support".to_string()),
                person_uuid: Some("person-ignored".to_string()),
                class: Some("contact:mixin:Employee".to_string()),
            },
            HulyEmployee {
                id: "huly-kept".to_string(),
                name: Some("Builder".to_string()),
                active: Some(true),
                position: Some("Engineer".to_string()),
                person_uuid: Some("person-kept".to_string()),
                class: Some("contact:mixin:Employee".to_string()),
            },
        ];
        let db_employees = vec![
            Employee {
                id: "db-ignored".to_string(),
                clockify_user_id: "clockify-ignored".to_string(),
                huly_person_id: Some("person-ignored".to_string()),
                name: "Ghost".to_string(),
                email: "".to_string(),
                avatar_url: None,
                monthly_quota_hours: 160.0,
                is_active: true,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
            Employee {
                id: "db-kept".to_string(),
                clockify_user_id: "clockify-kept".to_string(),
                huly_person_id: Some("person-kept".to_string()),
                name: "Builder".to_string(),
                email: "".to_string(),
                avatar_url: None,
                monthly_quota_hours: 160.0,
                is_active: true,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                updated_at: "2026-01-01T00:00:00Z".to_string(),
            },
        ];
        let ignored_emails = HashSet::new();
        let ignored_employee_ids = HashSet::from(["db-ignored".to_string()]);

        let org_chart = build_org_chart_view(
            departments,
            persons,
            huly_employees,
            db_employees,
            &ignored_emails,
            &ignored_employee_ids,
        );

        assert_eq!(org_chart.people.len(), 1);
        assert_eq!(org_chart.people[0].person_id, "person-kept");
        assert_eq!(org_chart.departments[0].head_person_id, None);
        assert_eq!(org_chart.departments[0].team_lead_person_id, None);
        assert_eq!(
            org_chart.departments[0].member_person_ids,
            vec!["person-kept".to_string()]
        );
    }

    fn live_app_data_dir() -> Result<PathBuf, String> {
        let home = std::env::var("HOME").map_err(|e| format!("HOME not set: {e}"))?;
        Ok(PathBuf::from(home).join("Library/Application Support/com.thoughtseed.teamforge"))
    }

    async fn open_live_pool() -> Result<sqlx::SqlitePool, String> {
        let app_data_dir = live_app_data_dir()?;
        queries::init_db(&app_data_dir)
            .await
            .map_err(|e| format!("init live db: {e}"))
    }

    #[tokio::test]
    #[ignore]
    async fn inspect_live_huly_org_state() {
        let pool = open_live_pool().await.expect("live pool");
        let client = get_huly_client(&pool).await.expect("huly client");

        let (account, employees, persons, departments, boards, board_cards) = tokio::join!(
            client.get_account_info(),
            client.get_employees(),
            client.get_persons(),
            client.get_departments(),
            client.get_boards(),
            client.get_board_cards(),
        );

        let account = account.expect("account");
        let employees = employees.expect("employees");
        let persons = persons.expect("persons");
        let departments = departments.expect("departments");
        let boards = boards.expect("boards");
        let board_cards = board_cards.expect("board cards");

        let board_card_counts: HashMap<String, usize> = board_cards
            .iter()
            .filter_map(|card| card.space.as_ref().map(|space| space.clone()))
            .fold(HashMap::new(), |mut acc, board_id| {
                *acc.entry(board_id).or_default() += 1;
                acc
            });

        let summary = json!({
            "account": account,
            "employees": employees.iter().map(|employee| json!({
                "id": employee.id,
                "name": employee.name,
                "active": employee.active,
                "position": employee.position,
                "personUuid": employee.person_uuid,
            })).collect::<Vec<_>>(),
            "persons": persons.iter().map(|person| json!({
                "id": person.id,
                "name": person.name,
            })).collect::<Vec<_>>(),
            "departments": departments.iter().map(|department| json!({
                "id": department.id,
                "name": department.name,
                "parent": department.parent,
                "teamLead": department.team_lead,
                "head": department.head,
                "managers": department.managers,
                "members": department.members,
            })).collect::<Vec<_>>(),
            "boards": boards.iter().map(|board| json!({
                "id": board.id,
                "name": board.name,
                "archived": board.archived,
                "type": board.r#type,
                "owners": board.owners,
                "members": board.members,
                "cardCount": board_card_counts.get(&board.id).copied().unwrap_or_default(),
            })).collect::<Vec<_>>(),
        });

        println!("{}", serde_json::to_string_pretty(&summary).unwrap());
    }

    #[tokio::test]
    #[ignore]
    async fn preview_live_huly_workspace_normalization() {
        let pool = open_live_pool().await.expect("live pool");
        let report = run_huly_workspace_normalization(&pool, true)
            .await
            .expect("preview normalization");
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        assert!(!report.actions.is_empty());
    }

    #[tokio::test]
    #[ignore]
    async fn apply_live_huly_workspace_normalization() {
        let pool = open_live_pool().await.expect("live pool");
        let report = run_huly_workspace_normalization(&pool, false)
            .await
            .expect("apply normalization");
        println!("{}", serde_json::to_string_pretty(&report).unwrap());
        assert!(!report.actions.is_empty());
    }
}
