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
use crate::huly::client::HulyClient;
use crate::huly::sync::HulySyncEngine;
use crate::huly::types::{
    HulyAccountInfo, HulyBoard, HulyBoardCard, HulyCalendarEvent, HulyChannel, HulyDepartment,
    HulyDocument, HulyEmployee, HulyHoliday, HulyIssue, HulyLeaveRequest, HulyPerson,
    HulyProject, HulyWorkspaceNormalizationAction, HulyWorkspaceNormalizationReport,
    HulyWorkspaceNormalizationSnapshot,
};
use crate::slack::client::SlackClient;
use crate::slack::types::{SlackConversation, SlackUser};
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
            .map(|participants| participants.iter().any(|participant| participant == person_id))
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
        project_name: String,
        total_seconds: f64,
        billable_seconds: f64,
        member_count: i64,
    }

    let rows: Vec<Row> = sqlx::query_as(
        "SELECT
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
                project_name: r.project_name,
                total_hours,
                billable_hours,
                team_members: r.member_count as u32,
                utilization,
            }
        })
        .collect())
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

    // Union time entries and huly issue activities, join employee names
    let items: Vec<ActivityItem> = sqlx::query_as::<_, ActivityItem>(
        "SELECT * FROM (
            SELECT
                'clockify' AS source,
                e.name AS employee_name,
                'logged time' AS action,
                te.description AS detail,
                te.start_time AS occurred_at
            FROM time_entries te
            JOIN employees e ON te.employee_id = e.id
            WHERE e.is_active = 1

            UNION ALL

            SELECT
                'huly' AS source,
                e.name AS employee_name,
                h.action AS action,
                COALESCE(h.issue_identifier || ': ' || h.issue_title, h.issue_title) AS detail,
                h.occurred_at AS occurred_at
            FROM huly_issue_activity h
            JOIN employees e ON h.employee_id = e.id
            WHERE e.is_active = 1
        )
        ORDER BY occurred_at DESC
        LIMIT ?1",
    )
    .bind(limit)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    Ok(items)
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

    let employee_name_by_email: HashMap<String, String> = employees
        .iter()
        .filter(|employee| employee.is_active)
        .map(|employee| (normalize_email(&employee.email), employee.name.clone()))
        .collect();

    let mut employee_name_aliases: HashMap<String, String> = HashMap::new();
    for employee in employees.iter().filter(|employee| employee.is_active) {
        for alias in [
            normalize_person_key(&employee.name),
            person_token_signature(&employee.name),
        ] {
            if !alias.is_empty() {
                employee_name_aliases.insert(alias, employee.name.clone());
            }
        }
    }

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

    if let Some(client) = get_optional_slack_client(pool).await? {
        let channel_filters = queries::get_setting(pool, "slack_channel_filters")
            .await
            .map_err(|e| format!("read slack_channel_filters: {e}"))?
            .unwrap_or_default();

        let channels = filter_slack_channels(
            client.list_channels().await.unwrap_or_default(),
            &channel_filters,
        );
        let users = client.list_users().await.unwrap_or_default();

        let slack_user_to_employee: HashMap<String, String> = users
            .iter()
            .filter(|user| !user.deleted && !user.is_bot)
            .filter_map(|user| {
                if let Some(email) = user
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.email.as_ref())
                    .map(|email| normalize_email(email))
                {
                    if let Some(employee_name) = employee_name_by_email.get(&email) {
                        return Some((user.id.clone(), employee_name.clone()));
                    }
                }

                for display_name in slack_user_display_names(user) {
                    for alias in [
                        normalize_person_key(&display_name),
                        person_token_signature(&display_name),
                    ] {
                        if let Some(employee_name) = employee_name_aliases.get(&alias) {
                            return Some((user.id.clone(), employee_name.clone()));
                        }
                    }
                }

                None
            })
            .collect();

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

                let Some(slack_user_id) = message.user.as_ref() else {
                    continue;
                };
                let Some(employee_name) = slack_user_to_employee.get(slack_user_id) else {
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
    if let (Some(org_chart), Some(person_id)) =
        (snapshot.org_chart.as_ref(), employee.huly_person_id.as_ref())
    {
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
                        last_message_at_ms.map_or(timestamp_ms, |current| current.max(timestamp_ms)),
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

        let employee_email = normalize_email(&employee.email);
        let employee_aliases: HashSet<String> = [
            normalize_person_key(&employee.name),
            person_token_signature(&employee.name),
        ]
        .into_iter()
        .filter(|alias| !alias.is_empty())
        .collect();

        let slack_user_ids: HashSet<String> = users
            .into_iter()
            .filter(|user| !user.deleted && !user.is_bot)
            .filter(|user| {
                if user
                    .profile
                    .as_ref()
                    .and_then(|profile| profile.email.as_ref())
                    .map(|email| normalize_email(email) == employee_email)
                    .unwrap_or(false)
                {
                    return true;
                }

                slack_user_display_names(user).iter().any(|name| {
                    employee_aliases.contains(&normalize_person_key(name))
                        || employee_aliases.contains(&person_token_signature(name))
                })
            })
            .map(|user| user.id)
            .collect();

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
                    if message.bot_id.is_some()
                        || message.subtype.as_deref() == Some("bot_message")
                    {
                        continue;
                    }

                    let Some(slack_user_id) = message.user.as_ref() else {
                        continue;
                    };
                    if !slack_user_ids.contains(slack_user_id) {
                        continue;
                    }

                    messages_last_7_days += 1;
                    if let Some(timestamp_ms) = slack_ts_to_millis(&message.ts) {
                        last_message_at_ms = Some(
                            last_message_at_ms.map_or(timestamp_ms, |current| current.max(timestamp_ms)),
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

use crate::huly::naming::{compute_compliance_stats, parse_task_name, NamingComplianceStats, ParsedTaskName};

#[tauri::command]
pub async fn get_naming_compliance(db: State<'_, DbPool>) -> Result<NamingComplianceStats, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(compute_compliance_stats(&[])),
    };

    let issues = client.get_issues(None).await.unwrap_or_default();
    let titles: Vec<String> = issues
        .iter()
        .filter_map(|i| i.title.clone())
        .collect();

    Ok(compute_compliance_stats(&titles))
}

#[tauri::command]
pub async fn get_issues_with_naming(db: State<'_, DbPool>) -> Result<Vec<serde_json::Value>, String> {
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
        .filter_map(|e| e.huly_person_id.as_ref().map(|pid| (pid.clone(), e.name.clone())))
        .collect();

    let results = issues
        .iter()
        .map(|issue| {
            let title = issue.title.as_deref().unwrap_or("");
            let parsed = parse_task_name(title);
            let assignee_name = issue.assignee.as_ref().and_then(|a| emp_map.get(a)).cloned();
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
        .filter_map(|e| e.huly_person_id.as_ref().map(|pid| (pid.clone(), e.name.clone())))
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
            let Some(creator) = &msg.created_by else { continue };
            let Some(name) = huly_person_to_name.get(creator) else { continue };

            let in_standup = msg
                .attached_to
                .as_ref()
                .map(|ch_id| standup_channels.iter().any(|c| &c.id == ch_id))
                .unwrap_or(false);

            if !in_standup { continue; }

            let channel_name = msg.attached_to.as_ref()
                .and_then(|ch_id| standup_channels.iter().find(|c| &c.id == ch_id))
                .and_then(|c| huly_channel_display_name(c))
                .unwrap_or_else(|| "standup".to_string());

            posted.entry(name.clone()).or_insert_with(|| StandupEntry {
                employee_name: name.clone(),
                posted_at: msg.created_on.or(msg.modified_on).and_then(ms_to_datetime_string),
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

        let oldest_ts = format!("{}.000000", today.and_hms_opt(0, 0, 0).unwrap().and_utc().timestamp());
        let users = slack_client.list_users().await.unwrap_or_default();

        // Build slack user id → employee name map
        let slack_user_to_name: HashMap<String, String> = users
            .iter()
            .filter(|u| !u.deleted && !u.is_bot)
            .filter_map(|user| {
                let email = user.profile.as_ref()?.email.as_ref().map(|e| normalize_email(e))?;
                active_employees
                    .iter()
                    .find(|e| normalize_email(&e.email) == email)
                    .map(|e| (user.id.clone(), e.name.clone()))
            })
            .collect();

        for channel in &standup_channels {
            let channel_name = channel.name.clone().unwrap_or_else(|| "standup".to_string());
            for msg in slack_client
                .get_channel_messages_since(&channel.id, &oldest_ts)
                .await
                .unwrap_or_default()
            {
                if msg.bot_id.is_some() { continue; }
                let Some(uid) = &msg.user else { continue };
                let Some(name) = slack_user_to_name.get(uid) else { continue };

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
            posted.get(&e.name).cloned().unwrap_or_else(|| StandupEntry {
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
        a_order.cmp(&b_order).then(a.employee_name.cmp(&b.employee_name))
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
    pub monthly_value: f64,
    pub active_projects: u32,
    pub primary_contact: Option<String>,
    pub contract_status: String,
    pub contract_end_date: Option<String>,
    pub days_remaining: Option<i32>,
    pub tech_stack: Vec<String>,
    pub drive_link: Option<String>,
    pub chrome_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientDetailView {
    pub client: ClientView,
    pub linked_projects: Vec<serde_json::Value>,
    pub linked_devices: Vec<serde_json::Value>,
    pub resources: Vec<serde_json::Value>,
    pub recent_activity: Vec<serde_json::Value>,
}

#[tauri::command]
pub async fn get_clients(_db: State<'_, DbPool>) -> Result<Vec<ClientView>, String> {
    Ok(vec![])
}

#[tauri::command]
pub async fn get_client_detail(
    _db: State<'_, DbPool>,
    _client_id: String,
) -> Result<ClientDetailView, String> {
    Err("Client not found".to_string())
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
pub async fn get_devices(_db: State<'_, DbPool>) -> Result<Vec<DeviceView>, String> {
    Ok(vec![])
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
    _db: State<'_, DbPool>,
) -> Result<Vec<KnowledgeArticleView>, String> {
    Ok(vec![])
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
    _db: State<'_, DbPool>,
    _sprint_id: String,
) -> Result<SprintDetailView, String> {
    Err("Sprint detail not available yet".to_string())
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
pub async fn get_training_tracks(
    _db: State<'_, DbPool>,
) -> Result<Vec<TrainingTrackView>, String> {
    Ok(vec![])
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
pub async fn get_training_status(
    _db: State<'_, DbPool>,
) -> Result<Vec<TrainingStatusRow>, String> {
    Ok(vec![])
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillsMatrixCell {
    pub employee_name: String,
    pub skill: String,
    pub level: u32,
}

#[tauri::command]
pub async fn get_skills_matrix(_db: State<'_, DbPool>) -> Result<Vec<SkillsMatrixCell>, String> {
    Ok(vec![])
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
    _db: State<'_, DbPool>,
) -> Result<Vec<OnboardingFlowView>, String> {
    Ok(vec![])
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
pub async fn get_planner_capacity(
    _db: State<'_, DbPool>,
) -> Result<Vec<PlannerSlotView>, String> {
    Ok(vec![])
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
