use std::collections::HashMap;
use std::sync::Arc;

use chrono::{Datelike, Local, NaiveDate, Utc, Weekday};
use tauri::State;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::clockify::types::{ClockifyUser, ClockifyWorkspace};
use crate::db::models::*;
use crate::db::queries;
use crate::huly::client::HulyClient;
use crate::huly::sync::HulySyncEngine;
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

// ─── Huly connection commands ──────────────────────────────────

/// Test connectivity to Huly using a user token.
#[tauri::command]
pub async fn test_huly_connection(token: String) -> Result<String, String> {
    let client = HulyClient::connect(None, &token).await?;
    client.test_connection().await
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
        "Huly sync complete: {} issue activities, {} presence updates",
        report.issues_synced, report.presence_updated
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
        let mut guard = scheduler_state.0.lock().map_err(|e| format!("lock error: {e}"))?;
        if let Some(old) = guard.take() {
            old.stop();
        }
    }

    match SyncScheduler::start(pool, app_handle).await {
        Some(scheduler) => {
            let mut guard = scheduler_state.0.lock().map_err(|e| format!("lock error: {e}"))?;
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

/// Format a millisecond epoch timestamp to ISO date string.
fn ms_to_date_string(ms: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|dt| dt.format("%Y-%m-%d").to_string())
}

/// Format a millisecond epoch timestamp to ISO datetime string.
fn ms_to_datetime_string(ms: i64) -> Option<String> {
    chrono::DateTime::from_timestamp_millis(ms)
        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
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
                    .map(|s| s.contains("Done") || s.contains("Canceled") || s.contains("Cancelled"))
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

    let reports = client.get_time_reports(Some(month_start)).await.unwrap_or_default();

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
        let num = val.as_i64().or_else(|| val.as_str().and_then(|s| s.parse().ok()));
        match num {
            Some(0) => "Urgent".to_string(),
            Some(1) => "High".to_string(),
            Some(2) => "Medium".to_string(),
            Some(3) => "Low".to_string(),
            _ => val.as_str().map(|s| s.to_string()).unwrap_or_else(|| "Unknown".to_string()),
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

    results.sort_by_key(|p| {
        order
            .iter()
            .position(|&o| o == p.priority)
            .unwrap_or(99)
    });

    Ok(results)
}

// ─── Departments ───────────────────────────────────────────────

#[tauri::command]
pub async fn get_departments(db: State<'_, DbPool>) -> Result<Vec<DepartmentView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let departments = client.get_departments().await.unwrap_or_default();
    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    let emp_map: HashMap<String, &Employee> = employees
        .iter()
        .filter_map(|e| {
            e.huly_person_id.as_ref().map(|pid| (pid.clone(), e))
        })
        .collect();

    let mut views = Vec::with_capacity(departments.len());
    for dept in &departments {
        let members = dept.members.as_deref().unwrap_or(&[]);
        let member_count = members.len() as u32;

        let head_name = dept
            .head
            .as_ref()
            .and_then(|h| emp_map.get(h))
            .map(|e| e.name.clone());

        let mut total_hours = 0.0;
        let mut quota_total = 0.0;
        for mid in members {
            if let Some(emp) = emp_map.get(mid) {
                quota_total += emp.monthly_quota_hours;
                // Sum hours from DB for this employee this month
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

                if let Ok((h,)) = sqlx::query_as::<_, (f64,)>(
                    "SELECT COALESCE(SUM(duration_seconds), 0) / 3600.0 FROM time_entries WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3",
                )
                .bind(&emp.id)
                .bind(&month_start)
                .bind(&month_end)
                .fetch_one(pool)
                .await
                {
                    total_hours += h;
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
    Ok(views)
}

// ─── Leave requests ────────────────────────────────────────────

#[tauri::command]
pub async fn get_leave_requests(db: State<'_, DbPool>) -> Result<Vec<LeaveView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let requests = client.get_leave_requests().await.unwrap_or_default();

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

    let mut views = Vec::with_capacity(requests.len());
    for req in &requests {
        let emp_name = req
            .employee
            .as_ref()
            .and_then(|e| emp_map.get(e))
            .cloned()
            .unwrap_or_else(|| req.employee.clone().unwrap_or_else(|| "Unknown".to_string()));

        let from_str = req
            .date_from
            .and_then(ms_to_date_string)
            .unwrap_or_default();
        let to_str = req
            .date_to
            .and_then(ms_to_date_string)
            .unwrap_or_default();

        // Calculate days between from and to
        let days = match (req.date_from, req.date_to) {
            (Some(f), Some(t)) => ((t - f) / 86_400_000).max(1) as u32,
            _ => 0,
        };

        views.push(LeaveView {
            employee_name: emp_name,
            leave_type: req.r#type.clone().unwrap_or_else(|| "Unknown".to_string()),
            date_from: from_str,
            date_to: to_str,
            status: req.status.clone().unwrap_or_else(|| "Unknown".to_string()),
            days,
        });
    }
    Ok(views)
}

// ─── Holidays ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_holidays(db: State<'_, DbPool>) -> Result<Vec<HolidayView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    let holidays = client.get_holidays().await.unwrap_or_default();

    Ok(holidays
        .iter()
        .map(|h| HolidayView {
            title: h.title.clone().unwrap_or_else(|| "Untitled".to_string()),
            date: h.date.and_then(ms_to_date_string).unwrap_or_default(),
        })
        .collect())
}

// ─── Chat activity ─────────────────────────────────────────────

#[tauri::command]
pub async fn get_chat_activity(db: State<'_, DbPool>) -> Result<Vec<ChatActivityView>, String> {
    let pool = &db.0;
    let client = match get_huly_client(pool).await {
        Ok(c) => c,
        Err(_) => return Ok(vec![]),
    };

    // Messages from last 7 days
    let seven_days_ago = Utc::now()
        .checked_sub_signed(chrono::Duration::days(7))
        .unwrap_or_else(Utc::now)
        .timestamp_millis();

    let messages = client
        .get_chat_messages(Some(seven_days_ago))
        .await
        .unwrap_or_default();

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

    // Group by created_by
    struct ChatAccum {
        count: u32,
        channels: std::collections::HashSet<String>,
        last_at: Option<i64>,
    }

    let mut per_user: HashMap<String, ChatAccum> = HashMap::new();
    for msg in &messages {
        if let Some(creator) = &msg.created_by {
            let entry = per_user.entry(creator.clone()).or_insert(ChatAccum {
                count: 0,
                channels: std::collections::HashSet::new(),
                last_at: None,
            });
            entry.count += 1;
            if let Some(ch) = &msg.attached_to {
                entry.channels.insert(ch.clone());
            }
            if let Some(ts) = msg.created_on {
                entry.last_at = Some(entry.last_at.map_or(ts, |prev: i64| prev.max(ts)));
            }
        }
    }

    let mut results: Vec<ChatActivityView> = per_user
        .into_iter()
        .map(|(creator, data)| {
            let name = emp_map
                .get(&creator)
                .cloned()
                .unwrap_or_else(|| creator.clone());
            ChatActivityView {
                employee_name: name,
                message_count: data.count,
                channels_active: data.channels.len() as u32,
                last_message_at: data.last_at.and_then(ms_to_datetime_string),
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

            let assignee_name = c
                .assignee
                .as_ref()
                .and_then(|a| emp_map.get(a))
                .cloned();

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
            if event.participants.as_ref().map_or(true, |ps| !ps.contains(creator)) {
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

    results.sort_by(|a, b| b.meeting_ratio.partial_cmp(&a.meeting_ratio).unwrap_or(std::cmp::Ordering::Equal));
    Ok(results)
}
