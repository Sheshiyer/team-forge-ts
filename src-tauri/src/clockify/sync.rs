use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use chrono::Utc;
use sqlx::SqlitePool;

/// Format a chrono DateTime as Clockify-compatible ISO 8601: `yyyy-MM-ddTHH:mm:ssZ`
fn clockify_date(dt: chrono::DateTime<Utc>) -> String {
    dt.format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

use super::client::ClockifyClient;
use super::types::SyncReport;
use crate::db::models::{Employee, OpsEvent, Presence, Project, SyncState, TimeEntry};
use crate::db::queries;
use crate::ops::{build_sync_key, OpsSyncKeyInput, OPS_EVENT_SCHEMA_VERSION};

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
        let ignored_emails = load_ignored_clockify_emails(&self.pool).await?;
        let now = Utc::now().to_rfc3339();
        let mut count = 0u32;

        for u in &users {
            let is_ignored = ignored_emails.contains(&normalize_email(&u.email));
            let emp = Employee {
                id: u.id.clone(),
                clockify_user_id: u.id.clone(),
                huly_person_id: None,
                name: u.name.clone(),
                email: u.email.clone(),
                avatar_url: u.profile_picture.clone(),
                monthly_quota_hours: 160.0, // default
                is_active: !is_ignored,
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            queries::upsert_employee(&self.pool, &emp)
                .await
                .map_err(|e| format!("upsert employee failed: {e}"))?;

            if is_ignored {
                queries::delete_time_entries_for_employee(&self.pool, &emp.id)
                    .await
                    .map_err(|e| format!("purge ignored time entries failed: {e}"))?;
                queries::delete_presence_for_employee(&self.pool, &emp.id)
                    .await
                    .map_err(|e| format!("purge ignored presence failed: {e}"))?;
            } else {
                count += 1;
            }
        }

        queries::seed_identity_map_from_employees(&self.pool)
            .await
            .map_err(|e| format!("seed identity map from employees failed: {e}"))?;

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
            Some(s) => {
                // Keep an overlap window so late updates and parser/schema fixes
                // can backfill recent entries without manual state resets.
                match chrono::DateTime::parse_from_rfc3339(&s.last_sync_at) {
                    Ok(last) => {
                        clockify_date(last.with_timezone(&Utc) - chrono::Duration::days(90))
                    }
                    Err(_) => {
                        let dt = Utc::now() - chrono::Duration::days(90);
                        clockify_date(dt)
                    }
                }
            }
            None => {
                // Default: 90 days ago.
                let dt = Utc::now() - chrono::Duration::days(90);
                clockify_date(dt)
            }
        };

        let end = clockify_date(Utc::now());
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
                    .project_id
                    .clone()
                    .or_else(|| entry.project.as_ref().and_then(|p| p.id.clone()));

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

                let occurred_at = te.start_time.clone();
                let payload_json = serde_json::to_string(&serde_json::json!({
                    "id": entry.id.clone(),
                    "description": entry.description.clone(),
                    "project_id": te.project_id.clone(),
                    "start_time": entry.time_interval.start.clone(),
                    "end_time": entry.time_interval.end.clone(),
                    "duration_seconds": duration_secs,
                    "billable": entry.billable,
                    "workspace_id": self.workspace_id.as_str(),
                }))
                .map_err(|e| format!("serialize clockify ops payload failed: {e}"))?;
                let sync_key = build_sync_key(&OpsSyncKeyInput {
                    source: "clockify",
                    event_type: "clockify.time_entry.logged",
                    entity_type: "clockify_time_entry",
                    entity_id: &entry.id,
                    actor_employee_id: Some(&emp.id),
                    actor_clockify_user_id: Some(&emp.clockify_user_id),
                    actor_huly_person_id: emp.huly_person_id.as_deref(),
                    actor_slack_user_id: None,
                    occurred_at: &occurred_at,
                });
                let ops_event = OpsEvent {
                    id: None,
                    sync_key,
                    schema_version: OPS_EVENT_SCHEMA_VERSION.to_string(),
                    source: "clockify".to_string(),
                    event_type: "clockify.time_entry.logged".to_string(),
                    entity_type: "clockify_time_entry".to_string(),
                    entity_id: entry.id.clone(),
                    actor_employee_id: Some(emp.id.clone()),
                    actor_clockify_user_id: Some(emp.clockify_user_id.clone()),
                    actor_huly_person_id: emp.huly_person_id.clone(),
                    actor_slack_user_id: None,
                    occurred_at,
                    severity: "info".to_string(),
                    payload_json,
                    detected_at: Utc::now().to_rfc3339(),
                };
                queries::upsert_ops_event(&self.pool, &ops_event)
                    .await
                    .map_err(|e| format!("upsert clockify ops event failed: {e}"))?;
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
        let project_name_by_id: HashMap<String, String> = queries::get_projects(&self.pool)
            .await
            .map_err(|e| format!("get projects failed: {e}"))?
            .into_iter()
            .map(|project| (project.id, project.name))
            .collect();

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
                .and_then(|p| p.name.clone())
                .or_else(|| {
                    entry
                        .project_id
                        .as_ref()
                        .and_then(|project_id| project_name_by_id.get(project_id))
                        .cloned()
                });

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

const DEFAULT_CLOCKIFY_IGNORED_EMAILS: &str = "thoughtseedlabs@gmail.com";

fn normalize_email(value: &str) -> String {
    value.trim().to_lowercase()
}

async fn load_ignored_clockify_emails(pool: &SqlitePool) -> Result<HashSet<String>, String> {
    let raw = queries::get_setting(pool, "clockify_ignored_emails")
        .await
        .map_err(|e| format!("read ignored Clockify emails failed: {e}"))?;

    let source = raw
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| DEFAULT_CLOCKIFY_IGNORED_EMAILS.to_string());

    Ok(source
        .split(|ch: char| ch == ',' || ch == '\n' || ch == ';')
        .map(normalize_email)
        .filter(|value| !value.is_empty())
        .collect())
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
