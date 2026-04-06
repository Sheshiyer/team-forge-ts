use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;

use super::client::ClockifyClient;
use super::types::SyncReport;
use crate::db::models::{Employee, Presence, Project, TimeEntry, SyncState};
use crate::db::queries;

/// Coordinates fetching from Clockify and persisting into SQLite.
pub struct ClockifySyncEngine {
    client: Arc<ClockifyClient>,
    pool: SqlitePool,
    workspace_id: String,
}

impl ClockifySyncEngine {
    pub fn new(client: Arc<ClockifyClient>, pool: SqlitePool, workspace_id: String) -> Self {
        Self {
            client,
            pool,
            workspace_id,
        }
    }

    // ── Sync users ──────────────────────────────────────────────

    pub async fn sync_users(&self) -> Result<u32, String> {
        let users = self.client.get_users(&self.workspace_id).await?;
        let now = Utc::now().to_rfc3339();
        let mut count = 0u32;

        for u in &users {
            let emp = Employee {
                id: u.id.clone(),
                clockify_user_id: u.id.clone(),
                huly_person_id: None,
                name: u.name.clone(),
                email: u.email.clone(),
                avatar_url: u.profile_picture.clone(),
                monthly_quota_hours: 160.0, // default
                is_active: true,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            queries::upsert_employee(&self.pool, &emp)
                .await
                .map_err(|e| format!("upsert employee failed: {e}"))?;
            count += 1;
        }

        eprintln!("[clockify-sync] synced {count} users");
        Ok(count)
    }

    // ── Sync projects ───────────────────────────────────────────

    pub async fn sync_projects(&self) -> Result<u32, String> {
        let projects = self.client.get_projects(&self.workspace_id).await?;
        let now = Utc::now().to_rfc3339();
        let mut count = 0u32;

        for p in &projects {
            let proj = Project {
                id: p.id.clone(),
                clockify_project_id: p.id.clone(),
                huly_project_id: None,
                name: p.name.clone(),
                client_name: p.client_name.clone(),
                color: p.color.clone(),
                is_billable: p.billable,
                is_archived: p.archived,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            queries::upsert_project(&self.pool, &proj)
                .await
                .map_err(|e| format!("upsert project failed: {e}"))?;
            count += 1;
        }

        eprintln!("[clockify-sync] synced {count} projects");
        Ok(count)
    }

    // ── Incremental time entry sync ─────────────────────────────

    pub async fn sync_time_entries(&self) -> Result<u32, String> {
        let state = queries::get_sync_state(&self.pool, "clockify", "time_entries")
            .await
            .map_err(|e| format!("read sync state failed: {e}"))?;

        let since = match &state {
            Some(s) => s.last_sync_at.clone(),
            None => {
                // Default: 90 days ago.
                let dt = Utc::now() - chrono::Duration::days(90);
                dt.to_rfc3339()
            }
        };

        let end = Utc::now().to_rfc3339();
        let now_str = end.clone();

        // Get all active employees.
        let employees = queries::get_employees(&self.pool)
            .await
            .map_err(|e| format!("get employees failed: {e}"))?;

        let mut count = 0u32;

        for emp in &employees {
            if !emp.is_active {
                continue;
            }

            let entries = self
                .client
                .get_time_entries(&self.workspace_id, &emp.clockify_user_id, &since, &end)
                .await?;

            for entry in &entries {
                let duration_secs = entry
                    .time_interval
                    .duration
                    .as_deref()
                    .and_then(parse_iso_duration);

                let project_id = entry
                    .project
                    .as_ref()
                    .and_then(|p| p.id.clone());

                let te = TimeEntry {
                    id: entry.id.clone(),
                    employee_id: emp.id.clone(),
                    project_id,
                    description: entry.description.clone(),
                    start_time: entry.time_interval.start.clone(),
                    end_time: entry.time_interval.end.clone(),
                    duration_seconds: duration_secs,
                    is_billable: entry.billable,
                    synced_at: now_str.clone(),
                };
                queries::upsert_time_entry(&self.pool, &te)
                    .await
                    .map_err(|e| format!("upsert time entry failed: {e}"))?;
                count += 1;
            }
        }

        // Update sync state.
        let new_state = SyncState {
            source: "clockify".to_string(),
            entity: "time_entries".to_string(),
            last_sync_at: now_str,
            last_cursor: None,
        };
        queries::set_sync_state(&self.pool, &new_state)
            .await
            .map_err(|e| format!("set sync state failed: {e}"))?;

        eprintln!("[clockify-sync] synced {count} time entries (since {since})");
        Ok(count)
    }

    // ── Presence sync ───────────────────────────────────────────

    pub async fn sync_presence(&self) -> Result<(), String> {
        let employees = queries::get_employees(&self.pool)
            .await
            .map_err(|e| format!("get employees failed: {e}"))?;

        let user_ids: Vec<String> = employees
            .iter()
            .filter(|e| e.is_active)
            .map(|e| e.clockify_user_id.clone())
            .collect();

        let active_timers = self
            .client
            .get_active_timers(&self.workspace_id, &user_ids)
            .await?;

        let now = Utc::now().to_rfc3339();

        // First, mark everyone as inactive.
        for uid in &user_ids {
            let p = Presence {
                employee_id: uid.clone(),
                clockify_timer_active: false,
                clockify_timer_project: None,
                clockify_timer_start: None,
                huly_last_seen: None,
                updated_at: now.clone(),
            };
            queries::update_presence(&self.pool, &p)
                .await
                .map_err(|e| format!("update presence failed: {e}"))?;
        }

        // Then set active timers.
        for (uid, entry) in &active_timers {
            let project_name = entry
                .project
                .as_ref()
                .and_then(|p| p.name.clone());

            let p = Presence {
                employee_id: uid.clone(),
                clockify_timer_active: true,
                clockify_timer_project: project_name,
                clockify_timer_start: Some(entry.time_interval.start.clone()),
                huly_last_seen: None,
                updated_at: now.clone(),
            };
            queries::update_presence(&self.pool, &p)
                .await
                .map_err(|e| format!("update presence failed: {e}"))?;
        }

        eprintln!(
            "[clockify-sync] presence updated, {} active timers",
            active_timers.len()
        );
        Ok(())
    }

    // ── Full sync ───────────────────────────────────────────────

    pub async fn full_sync(&self) -> Result<SyncReport, String> {
        let users_synced = self.sync_users().await?;
        let projects_synced = self.sync_projects().await?;
        let time_entries_synced = self.sync_time_entries().await?;

        Ok(SyncReport {
            users_synced,
            projects_synced,
            time_entries_synced,
        })
    }
}

// ─── ISO 8601 duration parser ───────────────────────────────────

/// Parse an ISO 8601 duration like "PT1H30M15S" into total seconds.
pub fn parse_iso_duration(iso: &str) -> Option<i64> {
    let s = iso.strip_prefix("PT")?;
    let mut total: i64 = 0;
    let mut num_buf = String::new();

    for ch in s.chars() {
        match ch {
            '0'..='9' => num_buf.push(ch),
            'H' => {
                total += num_buf.parse::<i64>().ok()? * 3600;
                num_buf.clear();
            }
            'M' => {
                total += num_buf.parse::<i64>().ok()? * 60;
                num_buf.clear();
            }
            'S' => {
                total += num_buf.parse::<i64>().ok()?;
                num_buf.clear();
            }
            _ => return None,
        }
    }

    Some(total)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_iso_duration() {
        assert_eq!(parse_iso_duration("PT1H30M15S"), Some(5415));
        assert_eq!(parse_iso_duration("PT2H"), Some(7200));
        assert_eq!(parse_iso_duration("PT45M"), Some(2700));
        assert_eq!(parse_iso_duration("PT30S"), Some(30));
        assert_eq!(parse_iso_duration("PT0S"), Some(0));
        assert_eq!(parse_iso_duration("PT1H0M0S"), Some(3600));
        assert_eq!(parse_iso_duration("invalid"), None);
    }
}
