use chrono::{Datelike, Local, NaiveDate, Weekday};
use sqlx::SqlitePool;
use tauri_plugin_notification::NotificationExt;

use crate::db::queries;

/// Check quota compliance for all employees and send macOS notifications
/// for anyone in "critical" status (below 75% of expected hours).
/// Only alerts once per employee per day (stores flag in settings table).
pub async fn check_quota_alerts(
    app_handle: &tauri::AppHandle,
    pool: &SqlitePool,
) -> Result<(), String> {
    let now = Local::now();
    let today = now.date_naive();
    let today_str = today.format("%Y-%m-%d").to_string();

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

    if total_business_days == 0 {
        return Ok(());
    }

    let employees = queries::get_employees(pool)
        .await
        .map_err(|e| format!("db error: {e}"))?;

    for emp in employees.iter().filter(|e| e.is_active) {
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

        let expected =
            (business_days_elapsed as f64 / total_business_days as f64) * emp.monthly_quota_hours;

        let ratio = if expected > 0.0 {
            month_row.0 / expected
        } else {
            1.0
        };

        // Only alert for critical status (below 75%)
        if ratio >= 0.75 {
            continue;
        }

        let percent = ratio * 100.0;

        // Check if we already sent an alert today for this employee
        let alert_key = format!("alert_sent_{}_{}", emp.id, today_str);
        let already_sent = queries::get_setting(pool, &alert_key)
            .await
            .map_err(|e| format!("db error: {e}"))?;

        if already_sent.is_some() {
            continue;
        }

        // Send notification
        if let Err(e) = app_handle
            .notification()
            .builder()
            .title("TeamForge - Quota Alert")
            .body(format!(
                "{} is at {:.0}% of expected hours this month",
                emp.name, percent
            ))
            .show()
        {
            eprintln!("[alerts] notification failed for {}: {e}", emp.name);
        }

        // Mark as sent for today
        if let Err(e) = queries::set_setting(pool, &alert_key, "1").await {
            eprintln!("[alerts] failed to store alert flag: {e}");
        }
    }

    Ok(())
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
