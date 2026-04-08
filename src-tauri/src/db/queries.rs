use serde::de::DeserializeOwned;
use serde::Serialize;
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

pub async fn get_employee_by_id(
    pool: &SqlitePool,
    employee_id: &str,
) -> Result<Option<Employee>, sqlx::Error> {
    sqlx::query_as::<_, Employee>("SELECT * FROM employees WHERE id = ?1")
        .bind(employee_id)
        .fetch_optional(pool)
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
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await?;
    Ok(())
}

async fn replace_json_cache_rows<T, F>(
    pool: &SqlitePool,
    table: &str,
    items: &[T],
    id_of: F,
) -> Result<(), String>
where
    T: Serialize,
    F: Fn(&T) -> &str,
{
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("begin {table} cache tx: {e}"))?;
    let delete_sql = format!("DELETE FROM {table}");
    let insert_sql =
        format!("INSERT INTO {table} (id, payload, updated_at) VALUES (?1, ?2, datetime('now'))");

    sqlx::query(&delete_sql)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("clear {table} cache: {e}"))?;

    for item in items {
        let payload =
            serde_json::to_string(item).map_err(|e| format!("serialize {table} cache: {e}"))?;
        sqlx::query(&insert_sql)
            .bind(id_of(item))
            .bind(payload)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("write {table} cache: {e}"))?;
    }

    tx.commit()
        .await
        .map_err(|e| format!("commit {table} cache tx: {e}"))?;

    Ok(())
}

async fn load_json_cache_rows<T>(pool: &SqlitePool, table: &str) -> Result<Vec<T>, String>
where
    T: DeserializeOwned,
{
    let query = format!("SELECT id, payload, updated_at FROM {table} ORDER BY id");
    let rows = sqlx::query_as::<_, HulyCachedEntityRow>(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("read {table} cache: {e}"))?;

    let mut values = Vec::with_capacity(rows.len());
    for row in rows {
        match serde_json::from_str::<T>(&row.payload) {
            Ok(value) => values.push(value),
            Err(error) => eprintln!(
                "[db] warning: failed to deserialize {table} cache row {}: {error}",
                row.id
            ),
        }
    }

    Ok(values)
}

pub async fn replace_huly_departments_cache(
    pool: &SqlitePool,
    items: &[crate::huly::types::HulyDepartment],
) -> Result<(), String> {
    replace_json_cache_rows(pool, "huly_departments_cache", items, |item| &item.id).await
}

pub async fn get_huly_departments_cache(
    pool: &SqlitePool,
) -> Result<Vec<crate::huly::types::HulyDepartment>, String> {
    load_json_cache_rows(pool, "huly_departments_cache").await
}

pub async fn replace_huly_people_cache(
    pool: &SqlitePool,
    items: &[crate::huly::types::HulyPerson],
) -> Result<(), String> {
    replace_json_cache_rows(pool, "huly_people_cache", items, |item| &item.id).await
}

pub async fn get_huly_people_cache(
    pool: &SqlitePool,
) -> Result<Vec<crate::huly::types::HulyPerson>, String> {
    load_json_cache_rows(pool, "huly_people_cache").await
}

pub async fn replace_huly_employees_cache(
    pool: &SqlitePool,
    items: &[crate::huly::types::HulyEmployee],
) -> Result<(), String> {
    replace_json_cache_rows(pool, "huly_employees_cache", items, |item| &item.id).await
}

pub async fn get_huly_employees_cache(
    pool: &SqlitePool,
) -> Result<Vec<crate::huly::types::HulyEmployee>, String> {
    load_json_cache_rows(pool, "huly_employees_cache").await
}

pub async fn replace_huly_leave_requests_cache(
    pool: &SqlitePool,
    items: &[crate::huly::types::HulyLeaveRequest],
) -> Result<(), String> {
    replace_json_cache_rows(pool, "huly_leave_requests_cache", items, |item| &item.id).await
}

pub async fn get_huly_leave_requests_cache(
    pool: &SqlitePool,
) -> Result<Vec<crate::huly::types::HulyLeaveRequest>, String> {
    load_json_cache_rows(pool, "huly_leave_requests_cache").await
}

pub async fn replace_huly_holidays_cache(
    pool: &SqlitePool,
    items: &[crate::huly::types::HulyHoliday],
) -> Result<(), String> {
    replace_json_cache_rows(pool, "huly_holidays_cache", items, |item| &item.id).await
}

pub async fn get_huly_holidays_cache(
    pool: &SqlitePool,
) -> Result<Vec<crate::huly::types::HulyHoliday>, String> {
    load_json_cache_rows(pool, "huly_holidays_cache").await
}

// ─── Manual Team calendar data ──────────────────────────────────

pub async fn get_manual_leave_entries(
    pool: &SqlitePool,
) -> Result<Vec<ManualLeaveEntry>, sqlx::Error> {
    sqlx::query_as::<_, ManualLeaveEntry>(
        "SELECT * FROM manual_leave_entries ORDER BY date_from ASC, employee_id ASC, id ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_manual_leave_entry(
    pool: &SqlitePool,
    entry: &ManualLeaveEntry,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO manual_leave_entries (
            id,
            employee_id,
            leave_type,
            date_from,
            date_to,
            status,
            note,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(id) DO UPDATE SET
          employee_id = excluded.employee_id,
          leave_type = excluded.leave_type,
          date_from = excluded.date_from,
          date_to = excluded.date_to,
          status = excluded.status,
          note = excluded.note,
          updated_at = datetime('now')",
    )
    .bind(&entry.id)
    .bind(&entry.employee_id)
    .bind(&entry.leave_type)
    .bind(&entry.date_from)
    .bind(&entry.date_to)
    .bind(&entry.status)
    .bind(&entry.note)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_manual_leave_entry(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM manual_leave_entries WHERE id = ?1")
        .bind(id)
        .execute(pool)
        .await?;
    Ok(())
}

pub async fn get_manual_holidays(pool: &SqlitePool) -> Result<Vec<ManualHoliday>, sqlx::Error> {
    sqlx::query_as::<_, ManualHoliday>(
        "SELECT * FROM manual_holidays ORDER BY date ASC, title ASC, id ASC",
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_manual_holiday(
    pool: &SqlitePool,
    holiday: &ManualHoliday,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO manual_holidays (
            id,
            title,
            date,
            note,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          date = excluded.date,
          note = excluded.note,
          updated_at = datetime('now')",
    )
    .bind(&holiday.id)
    .bind(&holiday.title)
    .bind(&holiday.date)
    .bind(&holiday.note)
    .bind(&holiday.created_at)
    .bind(&holiday.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn delete_manual_holiday(pool: &SqlitePool, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM manual_holidays WHERE id = ?1")
        .bind(id)
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
    sqlx::query_as::<_, SyncState>("SELECT * FROM sync_state WHERE source = ?1 AND entity = ?2")
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
           last_cursor = excluded.last_cursor",
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::huly::types::HulyDepartment;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_DB_COUNTER: AtomicU64 = AtomicU64::new(0);

    fn unique_test_dir() -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|value| value.as_nanos())
            .unwrap_or_default();
        let seq = TEST_DB_COUNTER.fetch_add(1, Ordering::Relaxed);
        std::env::temp_dir().join(format!(
            "teamforge-db-test-{}-{nanos}-{seq}",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn team_department_cache_round_trips_through_sqlite() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let departments = vec![HulyDepartment {
            id: "dept-engineering".to_string(),
            name: Some("Engineering".to_string()),
            description: Some("Core product engineering".to_string()),
            parent: None,
            team_lead: Some("person-lead".to_string()),
            managers: Some(vec!["person-manager".to_string()]),
            head: Some("person-head".to_string()),
            members: Some(vec![
                "person-head".to_string(),
                "person-lead".to_string(),
                "person-crew".to_string(),
            ]),
            class: Some("hr:class:Department".to_string()),
        }];

        replace_huly_departments_cache(&pool, &departments)
            .await
            .expect("cache departments");

        let loaded = get_huly_departments_cache(&pool)
            .await
            .expect("load departments");

        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].id, "dept-engineering");
        assert_eq!(loaded[0].name.as_deref(), Some("Engineering"));
        assert_eq!(
            loaded[0].members.clone().unwrap_or_default(),
            vec![
                "person-head".to_string(),
                "person-lead".to_string(),
                "person-crew".to_string(),
            ]
        );

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn manual_team_calendar_entries_round_trip_through_sqlite() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let employee = Employee {
            id: "emp-1".to_string(),
            clockify_user_id: "clockify-1".to_string(),
            huly_person_id: Some("person-1".to_string()),
            name: "Pavun Kumar R".to_string(),
            email: "pavun@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-08T00:00:00".to_string(),
            updated_at: "2026-04-08T00:00:00".to_string(),
        };
        upsert_employee(&pool, &employee)
            .await
            .expect("upsert employee");

        let leave = ManualLeaveEntry {
            id: "manual-leave-1".to_string(),
            employee_id: employee.id.clone(),
            leave_type: "Vacation".to_string(),
            date_from: "2026-04-10".to_string(),
            date_to: "2026-04-12".to_string(),
            status: "Approved".to_string(),
            note: Some("Family trip".to_string()),
            created_at: "2026-04-08T00:00:00".to_string(),
            updated_at: "2026-04-08T00:00:00".to_string(),
        };
        upsert_manual_leave_entry(&pool, &leave)
            .await
            .expect("upsert manual leave");

        let holiday = ManualHoliday {
            id: "manual-holiday-1".to_string(),
            title: "Founders Day".to_string(),
            date: "2026-08-21".to_string(),
            note: Some("Company-wide shutdown".to_string()),
            created_at: "2026-04-08T00:00:00".to_string(),
            updated_at: "2026-04-08T00:00:00".to_string(),
        };
        upsert_manual_holiday(&pool, &holiday)
            .await
            .expect("upsert manual holiday");

        let loaded_leaves = get_manual_leave_entries(&pool)
            .await
            .expect("load manual leaves");
        let loaded_holidays = get_manual_holidays(&pool)
            .await
            .expect("load manual holidays");

        assert_eq!(loaded_leaves.len(), 1);
        assert_eq!(loaded_leaves[0].employee_id, employee.id);
        assert_eq!(loaded_leaves[0].note.as_deref(), Some("Family trip"));
        assert_eq!(loaded_holidays.len(), 1);
        assert_eq!(loaded_holidays[0].title, "Founders Day");
        assert_eq!(
            loaded_holidays[0].note.as_deref(),
            Some("Company-wide shutdown")
        );

        delete_manual_leave_entry(&pool, "manual-leave-1")
            .await
            .expect("delete manual leave");
        delete_manual_holiday(&pool, "manual-holiday-1")
            .await
            .expect("delete manual holiday");

        assert!(get_manual_leave_entries(&pool)
            .await
            .expect("reload manual leaves")
            .is_empty());
        assert!(get_manual_holidays(&pool)
            .await
            .expect("reload manual holidays")
            .is_empty());

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
