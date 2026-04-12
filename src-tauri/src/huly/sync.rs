use std::sync::Arc;

use chrono::{Local, Utc};
use sqlx::SqlitePool;

use super::client::HulyClient;
use super::types::HulySyncReport;
use crate::db::models::{HulyIssueActivity, IdentityMapEntry, OpsEvent, SyncState};
use crate::db::queries;
use crate::ops::{build_sync_key, OpsSyncKeyInput, OPS_EVENT_SCHEMA_VERSION};

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
        queries::seed_identity_map_from_employees(&self.pool)
            .await
            .map_err(|e| format!("seed identity map from employees: {e}"))?;

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
            let occurred_at = issue
                .modified_on
                .map(|ts| {
                    chrono::DateTime::from_timestamp_millis(ts)
                        .map(|dt| dt.to_rfc3339())
                        .unwrap_or_else(|| Utc::now().to_rfc3339())
                })
                .unwrap_or_else(|| Utc::now().to_rfc3339());
            let actor_huly_person_id = issue.modified_by.clone();
            let actor_employee_id = match actor_huly_person_id.as_deref() {
                Some(person_ref) => self.resolve_employee_id(person_ref).await,
                None => None,
            };
            if let Some(person_ref) = actor_huly_person_id.as_deref() {
                let (resolution_status, confidence, match_method) = if actor_employee_id.is_some() {
                    ("linked", 1.0, "huly.issue.activity")
                } else {
                    ("orphaned", 0.0, "huly.issue.unmatched")
                };
                if let Err(error) = self
                    .upsert_huly_identity(
                        person_ref,
                        actor_employee_id.as_deref(),
                        confidence,
                        resolution_status,
                        match_method,
                    )
                    .await
                {
                    eprintln!(
                        "[huly-sync] warning: failed to track huly identity {person_ref}: {error}"
                    );
                }
            }
            let payload_json = serde_json::to_string(&serde_json::json!({
                "id": issue.id.clone(),
                "identifier": issue.identifier.clone(),
                "title": issue.title.clone(),
                "status": issue.status.clone(),
                "priority": issue.priority.clone(),
                "assignee": issue.assignee.clone(),
                "space": issue.space.clone(),
                "modified_on": issue.modified_on,
            }))
            .map_err(|e| format!("serialize huly ops payload failed: {e}"))?;
            let sync_key = build_sync_key(&OpsSyncKeyInput {
                source: "huly",
                event_type: "huly.issue.modified",
                entity_type: "huly_issue",
                entity_id: &issue.id,
                actor_employee_id: actor_employee_id.as_deref(),
                actor_clockify_user_id: None,
                actor_huly_person_id: actor_huly_person_id.as_deref(),
                actor_slack_user_id: None,
                occurred_at: &occurred_at,
            });
            let ops_event = OpsEvent {
                id: None,
                sync_key,
                schema_version: OPS_EVENT_SCHEMA_VERSION.to_string(),
                source: "huly".to_string(),
                event_type: "huly.issue.modified".to_string(),
                entity_type: "huly_issue".to_string(),
                entity_id: issue.id.clone(),
                actor_employee_id: actor_employee_id.clone(),
                actor_clockify_user_id: None,
                actor_huly_person_id: actor_huly_person_id.clone(),
                actor_slack_user_id: None,
                occurred_at: occurred_at.clone(),
                severity: "info".to_string(),
                payload_json,
                detected_at: Utc::now().to_rfc3339(),
            };
            if let Err(e) = queries::upsert_ops_event(&self.pool, &ops_event).await {
                eprintln!("[huly-sync] warning: failed to upsert ops event: {e}");
            }

            // Each issue that was modified counts as an activity record only when we can map it
            // to a known employee.
            let Some(employee_id) = actor_employee_id else {
                continue;
            };

            let activity = HulyIssueActivity {
                id: None,
                employee_id,
                huly_issue_id: issue.id.clone(),
                issue_identifier: issue.identifier.clone(),
                issue_title: issue.title.clone(),
                action: "modified".to_string(),
                old_status: None,
                new_status: issue.status.as_ref().map(|v| v.to_string()),
                occurred_at: occurred_at.clone(),
                synced_at: Utc::now().to_rfc3339(),
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
        queries::seed_identity_map_from_employees(&self.pool)
            .await
            .map_err(|e| format!("seed identity map from employees: {e}"))?;

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
                    None => {
                        if let Err(error) = self
                            .upsert_huly_identity(
                                person_ref,
                                None,
                                0.0,
                                "orphaned",
                                "huly.presence.unmatched",
                            )
                            .await
                        {
                            eprintln!(
                                "[huly-sync] warning: failed to track unresolved huly identity {person_ref}: {error}"
                            );
                        }
                        continue;
                    }
                };

                if let Err(error) = self
                    .upsert_huly_identity(
                        person_ref,
                        Some(&employee_id),
                        1.0,
                        "linked",
                        "huly.presence.activity",
                    )
                    .await
                {
                    eprintln!(
                        "[huly-sync] warning: failed to upsert linked huly identity {person_ref}: {error}"
                    );
                }

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

    /// Refresh Team-facing Huly entities into the persistent SQLite cache.
    pub async fn sync_team_cache(&self) -> Result<u32, String> {
        let (departments, people, employees, leave_requests, holidays) = tokio::try_join!(
            self.client.get_departments(),
            self.client.get_persons(),
            self.client.get_employees(),
            self.client.get_leave_requests(),
            self.client.get_holidays(),
        )?;

        queries::replace_huly_departments_cache(&self.pool, &departments).await?;
        queries::replace_huly_people_cache(&self.pool, &people).await?;
        queries::replace_huly_employees_cache(&self.pool, &employees).await?;
        queries::replace_huly_leave_requests_cache(&self.pool, &leave_requests).await?;
        queries::replace_huly_holidays_cache(&self.pool, &holidays).await?;

        let now = Utc::now().format("%Y-%m-%dT%H:%M:%S").to_string();
        let state = SyncState {
            source: "huly".to_string(),
            entity: "team_snapshot".to_string(),
            last_sync_at: now,
            last_cursor: None,
        };
        queries::set_sync_state(&self.pool, &state)
            .await
            .map_err(|e| format!("db error setting team cache sync state: {e}"))?;

        let item_count = departments.len()
            + people.len()
            + employees.len()
            + leave_requests.len()
            + holidays.len();

        eprintln!(
            "[huly-sync] team cache refreshed: {} departments, {} people, {} employees, {} leave requests, {} holidays",
            departments.len(),
            people.len(),
            employees.len(),
            leave_requests.len(),
            holidays.len()
        );

        Ok(item_count as u32)
    }

    /// Run both issue sync and presence update.
    pub async fn full_sync(&self) -> Result<HulySyncReport, String> {
        let issues_synced = self.sync_issues().await?;
        let presence_updated = self.sync_presence().await?;
        let team_cache_items = self.sync_team_cache().await?;
        Ok(HulySyncReport {
            issues_synced,
            presence_updated,
            team_cache_items,
        })
    }

    /// Look up the local employee ID for a given Huly person reference.
    async fn resolve_employee_id(&self, huly_person_ref: &str) -> Option<String> {
        if let Ok(Some(employee_id)) =
            queries::resolve_employee_id_by_identity(&self.pool, "huly", huly_person_ref).await
        {
            return Some(employee_id);
        }

        // huly_person_id in the employees table stores the Huly person/member ID
        let row: Option<(String,)> =
            sqlx::query_as("SELECT id FROM employees WHERE huly_person_id = ?1 LIMIT 1")
                .bind(huly_person_ref)
                .fetch_optional(&self.pool)
                .await
                .ok()?;
        let employee_id = row.map(|r| r.0)?;
        let _ = self
            .upsert_huly_identity(
                huly_person_ref,
                Some(&employee_id),
                1.0,
                "linked",
                "legacy.employee_huly_person_id",
            )
            .await;
        Some(employee_id)
    }

    async fn upsert_huly_identity(
        &self,
        huly_person_ref: &str,
        employee_id: Option<&str>,
        confidence: f64,
        resolution_status: &str,
        match_method: &str,
    ) -> Result<(), String> {
        let now = Utc::now().to_rfc3339();
        let entry = IdentityMapEntry {
            id: None,
            source: "huly".to_string(),
            external_id: huly_person_ref.to_string(),
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
        queries::upsert_identity_map_entry(&self.pool, &entry)
            .await
            .map_err(|e| format!("upsert huly identity map: {e}"))
    }
}
