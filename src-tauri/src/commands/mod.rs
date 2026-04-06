use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Datelike, Local, NaiveDate, Weekday};
use tauri::State;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::clockify::types::{ClockifyUser, ClockifyWorkspace};
use crate::db::models::*;
use crate::db::queries;
use crate::sync::scheduler::SyncScheduler;
use crate::{DbPool, SchedulerState};

// ─── Clockify connection commands ───────────────────────────────

/// Validate a Clockify API key by fetching the authenticated user.
#[tauri::command]
pub async fn test_clockify_connection(api_key: String) -> Result<ClockifyUser, String> {
    let client = ClockifyClient::new(api_key);
    client.get_current_user().await
}

/// List workspaces accessible with the given API key.
#[tauri::command]
pub async fn get_clockify_workspaces(
    api_key: String,
) -> Result<Vec<ClockifyWorkspace>, String> {
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
pub async fn save_setting(
    db: State<'_, DbPool>,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = &db.0;
    queries::set_setting(pool, &key, &value)
        .await
        .map_err(|e| format!("db error: {e}"))
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
        "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
         FROM time_entries
         WHERE start_time >= ?1 AND start_time < ?2",
    )
    .bind(&month_start)
    .bind(&next_month)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let team_hours = hours_row.0;

    // Billable hours this month
    let billable_row: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
         FROM time_entries
         WHERE start_time >= ?1 AND start_time < ?2 AND is_billable = 1",
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
        "SELECT COUNT(*) FROM presence WHERE clockify_timer_active = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| format!("db error: {e}"))?;

    let total_row: (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM employees WHERE is_active = 1",
    )
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
            "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
             FROM time_entries
             WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
        )
        .bind(&emp.id)
        .bind(week_start.format("%Y-%m-%d").to_string())
        .bind(week_end.format("%Y-%m-%d").to_string())
        .fetch_one(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

        // Hours this month
        let month_row: (f64,) = sqlx::query_as(
            "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0
             FROM time_entries
             WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
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
         LEFT JOIN projects p ON te.project_id = p.id
         WHERE te.start_time >= ?1 AND te.start_time < ?2
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
            "SELECT * FROM time_entries
             WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3
             ORDER BY start_time DESC",
        )
        .bind(&eid)
        .bind(&start)
        .bind(&end)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, TimeEntry>(
            "SELECT * FROM time_entries
             WHERE start_time >= ?1 AND start_time < ?2
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

            UNION ALL

            SELECT
                'huly' AS source,
                e.name AS employee_name,
                h.action AS action,
                COALESCE(h.issue_identifier || ': ' || h.issue_title, h.issue_title) AS detail,
                h.occurred_at AS occurred_at
            FROM huly_issue_activity h
            JOIN employees e ON h.employee_id = e.id
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

            let combined_status = if r.clockify_timer_active
                || huly_recent.map_or(false, |mins| mins <= 15)
            {
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
    sqlx::query("UPDATE employees SET monthly_quota_hours = ?1, updated_at = datetime('now') WHERE id = ?2")
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

// ─── Background sync ───────────────────────────────────────────

#[tauri::command]
pub async fn start_background_sync(
    db: State<'_, DbPool>,
    scheduler_state: State<'_, SchedulerState>,
) -> Result<String, String> {
    let pool = db.0.clone();

    // Stop existing scheduler if running
    {
        let mut guard = scheduler_state.0.lock().map_err(|e| format!("lock error: {e}"))?;
        if let Some(old) = guard.take() {
            old.stop();
        }
    }

    match SyncScheduler::start(pool).await {
        Some(scheduler) => {
            let mut guard = scheduler_state.0.lock().map_err(|e| format!("lock error: {e}"))?;
            *guard = Some(scheduler);
            Ok("Background sync started".to_string())
        }
        None => Ok("Settings not configured, background sync not started".to_string()),
    }
}
