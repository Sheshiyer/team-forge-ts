use std::sync::Arc;

use chrono::{Local, Utc};
use sqlx::SqlitePool;

use super::client::HulyClient;
use super::types::HulySyncReport;
use crate::db::models::{HulyIssueActivity, SyncState};
use crate::db::queries;

/// Sync engine that pulls data from Huly and persists it locally.
pub struct HulySyncEngine {
    client: Arc<HulyClient>,
    pool: SqlitePool,
}

impl HulySyncEngine {
    pub fn new(client: Arc<HulyClient>, pool: SqlitePool) -> Self {
        Self { client, pool }
    }

    /// Sync issues from Huly. Returns the count of activities created.
    pub async fn sync_issues(&self) -> Result<u32, String> {
        // Get last sync timestamp
        let last_sync = queries::get_sync_state(&self.pool, "huly", "issues")
            .await
            .map_err(|e| format!("db error: {e}"))?;

        let modified_since = last_sync.as_ref().and_then(|s| {
            // Parse the stored ISO timestamp to epoch millis
            chrono::NaiveDateTime::parse_from_str(&s.last_sync_at, "%Y-%m-%dT%H:%M:%S")
                .or_else(|_| {
                    chrono::NaiveDateTime::parse_from_str(&s.last_sync_at, "%Y-%m-%d %H:%M:%S")
                })
                .ok()
                .map(|dt| dt.and_utc().timestamp_millis())
        });

        eprintln!(
            "[huly-sync] syncing issues, modified_since={:?}",
            modified_since
        );

        let issues = self.client.get_issues(modified_since).await?;

        eprintln!("[huly-sync] fetched {} issues", issues.len());

        let mut count = 0u32;

        for issue in &issues {
            // Each issue that was modified counts as an activity record.
            // Map modified_by to an employee if possible.
            let employee_id = match &issue.modified_by {
                Some(person_ref) => self
                    .resolve_employee_id(person_ref)
                    .await
                    .unwrap_or_default(),
                None => String::new(),
            };

            if employee_id.is_empty() {
                // Cannot link to an employee; skip
                continue;
            }

            let occurred_at = issue
                .modified_on
                .map(|ts| {
                    chrono::DateTime::from_timestamp_millis(ts)
                        .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S").to_string())
                        .unwrap_or_default()
                })
                .unwrap_or_else(|| Local::now().format("%Y-%m-%dT%H:%M:%S").to_string());

            let activity = HulyIssueActivity {
                id: None,
                employee_id,
                huly_issue_id: issue.id.clone(),
                issue_identifier: issue.identifier.clone(),
                issue_title: issue.title.clone(),
                action: "modified".to_string(),
                old_status: None,
                new_status: issue.status.as_ref().map(|v| v.to_string()),
                occurred_at,
                synced_at: Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string(),
            };

            if let Err(e) = queries::insert_huly_issue_activity(&self.pool, &activity).await {
                eprintln!("[huly-sync] warning: failed to insert activity: {e}");
                continue;
            }
            count += 1;
        }

        // Update sync state
        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        let state = SyncState {
            source: "huly".to_string(),
            entity: "issues".to_string(),
            last_sync_at: now,
            last_cursor: None,
        };
        queries::set_sync_state(&self.pool, &state)
            .await
            .map_err(|e| format!("db error setting sync state: {e}"))?;

        eprintln!("[huly-sync] synced {count} issue activities");
        Ok(count)
    }

    /// Update presence based on recently modified issues.
    pub async fn sync_presence(&self) -> Result<u32, String> {
        // Fetch issues modified in the last 15 minutes
        let fifteen_min_ago = Utc::now()
            .checked_sub_signed(chrono::Duration::minutes(15))
            .unwrap_or_else(Utc::now)
            .timestamp_millis();

        let issues = self.client.get_issues(Some(fifteen_min_ago)).await?;

        // Collect unique modified_by person refs
        let mut seen = std::collections::HashSet::new();
        let mut updated = 0u32;

        for issue in &issues {
            if let Some(person_ref) = &issue.modified_by {
                if seen.contains(person_ref) {
                    continue;
                }
                seen.insert(person_ref.clone());

                let employee_id = match self.resolve_employee_id(person_ref).await {
                    Some(id) => id,
                    None => continue,
                };

                let now = Local::now().format("%Y-%m-%dT%H:%M:%S").to_string();
                // Update just the huly_last_seen via raw query
                let res = sqlx::query(
                    "UPDATE presence SET huly_last_seen = ?1, updated_at = datetime('now') WHERE employee_id = ?2",
                )
                .bind(&now)
                .bind(&employee_id)
                .execute(&self.pool)
                .await;

                if let Err(e) = res {
                    eprintln!(
                        "[huly-sync] warning: failed to update presence for {employee_id}: {e}"
                    );
                } else {
                    updated += 1;
                }
            }
        }

        eprintln!("[huly-sync] presence updated for {updated} employees");
        Ok(updated)
    }

    /// Run both issue sync and presence update.
    pub async fn full_sync(&self) -> Result<HulySyncReport, String> {
        let issues_synced = self.sync_issues().await?;
        let presence_updated = self.sync_presence().await?;
        Ok(HulySyncReport {
            issues_synced,
            presence_updated,
        })
    }

    /// Look up the local employee ID for a given Huly person reference.
    async fn resolve_employee_id(&self, huly_person_ref: &str) -> Option<String> {
        // huly_person_id in the employees table stores the Huly person/member ID
        let row: Option<(String,)> =
            sqlx::query_as("SELECT id FROM employees WHERE huly_person_id = ?1 LIMIT 1")
                .bind(huly_person_ref)
                .fetch_optional(&self.pool)
                .await
                .ok()?;

        row.map(|r| r.0)
    }
}
