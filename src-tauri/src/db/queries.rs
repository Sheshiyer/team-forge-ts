use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::path::Path;

use super::models::*;

/// Create or open the SQLite database and run migrations.
pub async fn init_db(app_data_dir: &Path) -> Result<SqlitePool, sqlx::Error> {
    std::fs::create_dir_all(app_data_dir).ok();
    let db_path = app_data_dir.join("teamforge.db");
    let db_url = format!("sqlite:{}?mode=rwc", db_path.display());

    let pool = SqlitePoolOptions::new()
        .max_connections(5)
        .connect(&db_url)
        .await?;

    sqlx::query(include_str!("../../migrations/001_initial.sql"))
        .execute(&pool)
        .await?;

    Ok(pool)
}

// ─── Employees ───────────────────────────────────────────────────

pub async fn get_employees(pool: &SqlitePool) -> Result<Vec<Employee>, sqlx::Error> {
    sqlx::query_as::<_, Employee>("SELECT * FROM employees ORDER BY name")
        .fetch_all(pool)
        .await
}

pub async fn set_employee_active(
    pool: &SqlitePool,
    employee_id: &str,
    is_active: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE employees
         SET is_active = ?1, updated_at = datetime('now')
         WHERE id = ?2",
    )
    .bind(is_active)
    .bind(employee_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_employee(pool: &SqlitePool, e: &Employee) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO employees (id, clockify_user_id, huly_person_id, name, email, avatar_url, monthly_quota_hours, is_active, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           clockify_user_id = excluded.clockify_user_id,
           huly_person_id = excluded.huly_person_id,
           name = excluded.name,
           email = excluded.email,
           avatar_url = excluded.avatar_url,
           monthly_quota_hours = excluded.monthly_quota_hours,
           is_active = excluded.is_active,
           updated_at = datetime('now')"
    )
    .bind(&e.id)
    .bind(&e.clockify_user_id)
    .bind(&e.huly_person_id)
    .bind(&e.name)
    .bind(&e.email)
    .bind(&e.avatar_url)
    .bind(e.monthly_quota_hours)
    .bind(e.is_active)
    .bind(&e.created_at)
    .bind(&e.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

// ─── Time Entries ────────────────────────────────────────────────

pub async fn get_time_entries(
    pool: &SqlitePool,
    employee_id: &str,
    start: &str,
    end: &str,
) -> Result<Vec<TimeEntry>, sqlx::Error> {
    sqlx::query_as::<_, TimeEntry>(
        "SELECT * FROM time_entries WHERE employee_id = ?1 AND start_time >= ?2 AND start_time < ?3 ORDER BY start_time DESC"
    )
    .bind(employee_id)
    .bind(start)
    .bind(end)
    .fetch_all(pool)
    .await
}

pub async fn upsert_time_entry(pool: &SqlitePool, te: &TimeEntry) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO time_entries (id, employee_id, project_id, description, start_time, end_time, duration_seconds, is_billable, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(id) DO UPDATE SET
           employee_id = excluded.employee_id,
           project_id = excluded.project_id,
           description = excluded.description,
           start_time = excluded.start_time,
           end_time = excluded.end_time,
           duration_seconds = excluded.duration_seconds,
           is_billable = excluded.is_billable,
           synced_at = datetime('now')"
    )
    .bind(&te.id)
    .bind(&te.employee_id)
    .bind(&te.project_id)
    .bind(&te.description)
    .bind(&te.start_time)
    .bind(&te.end_time)
    .bind(te.duration_seconds)
    .bind(te.is_billable)
    .bind(&te.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_time_entries_for_employee(
    pool: &SqlitePool,
    employee_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM time_entries WHERE employee_id = ?1")
        .bind(employee_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─── Projects ────────────────────────────────────────────────────

pub async fn get_projects(pool: &SqlitePool) -> Result<Vec<Project>, sqlx::Error> {
    sqlx::query_as::<_, Project>("SELECT * FROM projects ORDER BY name")
        .fetch_all(pool)
        .await
}

pub async fn upsert_project(pool: &SqlitePool, p: &Project) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO projects (id, clockify_project_id, huly_project_id, name, client_name, color, is_billable, is_archived, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
         ON CONFLICT(id) DO UPDATE SET
           clockify_project_id = excluded.clockify_project_id,
           huly_project_id = excluded.huly_project_id,
           name = excluded.name,
           client_name = excluded.client_name,
           color = excluded.color,
           is_billable = excluded.is_billable,
           is_archived = excluded.is_archived,
           updated_at = datetime('now')"
    )
    .bind(&p.id)
    .bind(&p.clockify_project_id)
    .bind(&p.huly_project_id)
    .bind(&p.name)
    .bind(&p.client_name)
    .bind(&p.color)
    .bind(p.is_billable)
    .bind(p.is_archived)
    .bind(&p.created_at)
    .bind(&p.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

// ─── Presence ────────────────────────────────────────────────────

pub async fn get_presence(pool: &SqlitePool) -> Result<Vec<Presence>, sqlx::Error> {
    sqlx::query_as::<_, Presence>("SELECT * FROM presence")
        .fetch_all(pool)
        .await
}

pub async fn update_presence(pool: &SqlitePool, p: &Presence) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO presence (employee_id, clockify_timer_active, clockify_timer_project, clockify_timer_start, huly_last_seen, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, datetime('now'))
         ON CONFLICT(employee_id) DO UPDATE SET
           clockify_timer_active = excluded.clockify_timer_active,
           clockify_timer_project = excluded.clockify_timer_project,
           clockify_timer_start = excluded.clockify_timer_start,
           huly_last_seen = excluded.huly_last_seen,
           updated_at = datetime('now')"
    )
    .bind(&p.employee_id)
    .bind(p.clockify_timer_active)
    .bind(&p.clockify_timer_project)
    .bind(&p.clockify_timer_start)
    .bind(&p.huly_last_seen)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_presence_for_employee(
    pool: &SqlitePool,
    employee_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM presence WHERE employee_id = ?1")
        .bind(employee_id)
        .execute(pool)
        .await?;
    Ok(())
}

// ─── Settings ────────────────────────────────────────────────────

pub async fn get_setting(pool: &SqlitePool, key: &str) -> Result<Option<String>, sqlx::Error> {
    let row: Option<Setting> =
        sqlx::query_as::<_, Setting>("SELECT * FROM settings WHERE key = ?1")
            .bind(key)
            .fetch_optional(pool)
            .await?;
    Ok(row.map(|s| s.value))
}

pub async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

// ─── Sync State ──────────────────────────────────────────────────

pub async fn get_sync_state(
    pool: &SqlitePool,
    source: &str,
    entity: &str,
) -> Result<Option<SyncState>, sqlx::Error> {
    sqlx::query_as::<_, SyncState>(
        "SELECT * FROM sync_state WHERE source = ?1 AND entity = ?2"
    )
    .bind(source)
    .bind(entity)
    .fetch_optional(pool)
    .await
}

pub async fn set_sync_state(pool: &SqlitePool, state: &SyncState) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO sync_state (source, entity, last_sync_at, last_cursor)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(source, entity) DO UPDATE SET
           last_sync_at = excluded.last_sync_at,
           last_cursor = excluded.last_cursor"
    )
    .bind(&state.source)
    .bind(&state.entity)
    .bind(&state.last_sync_at)
    .bind(&state.last_cursor)
    .execute(pool)
    .await?;
    Ok(())
}

// ─── Huly Issue Activity ─────────────────────────────────────────

pub async fn insert_huly_issue_activity(
    pool: &SqlitePool,
    a: &HulyIssueActivity,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO huly_issue_activity (employee_id, huly_issue_id, issue_identifier, issue_title, action, old_status, new_status, occurred_at, synced_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, datetime('now'))"
    )
    .bind(&a.employee_id)
    .bind(&a.huly_issue_id)
    .bind(&a.issue_identifier)
    .bind(&a.issue_title)
    .bind(&a.action)
    .bind(&a.old_status)
    .bind(&a.new_status)
    .bind(&a.occurred_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_huly_issue_activities(
    pool: &SqlitePool,
    employee_id: &str,
    since: &str,
) -> Result<Vec<HulyIssueActivity>, sqlx::Error> {
    sqlx::query_as::<_, HulyIssueActivity>(
        "SELECT * FROM huly_issue_activity WHERE employee_id = ?1 AND occurred_at >= ?2 ORDER BY occurred_at DESC"
    )
    .bind(employee_id)
    .bind(since)
    .fetch_all(pool)
    .await
}
