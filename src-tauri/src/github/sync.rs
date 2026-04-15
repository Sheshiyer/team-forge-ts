use chrono::Utc;
use sqlx::SqlitePool;

use super::client::GithubClient;
use super::types::{
    assignees_to_logins, event_type_for_issue, github_issue_id, github_project_id,
    issue_body_excerpt, labels_to_names, priority_from_labels, track_from_issue,
};
use crate::db::models::{
    GithubIssueCache, GithubMilestoneCache, GithubRepoConfig, GithubSyncReport, OpsEvent, SyncState,
};
use crate::db::queries;
use crate::ops::{build_sync_key, OpsSyncKeyInput, OPS_EVENT_SCHEMA_VERSION};

pub struct GithubSyncEngine {
    client: GithubClient,
    pool: SqlitePool,
}

impl GithubSyncEngine {
    pub fn new(client: GithubClient, pool: SqlitePool) -> Self {
        Self { client, pool }
    }

    pub async fn sync_all(&self) -> Result<Vec<GithubSyncReport>, String> {
        let configs = queries::get_enabled_github_repo_configs(&self.pool)
            .await
            .map_err(|e| format!("load github repo configs: {e}"))?;

        let mut reports = Vec::with_capacity(configs.len());
        for config in configs {
            reports.push(self.sync_repo(&config).await?);
        }

        Ok(reports)
    }

    async fn sync_repo(&self, config: &GithubRepoConfig) -> Result<GithubSyncReport, String> {
        let now = Utc::now().to_rfc3339();
        let milestones = self.client.get_milestones(&config.repo).await?;
        let issues = self.client.get_issues(&config.repo).await?;

        for milestone in &milestones {
            let row = GithubMilestoneCache {
                repo: config.repo.clone(),
                number: milestone.number,
                title: milestone.title.clone(),
                description: milestone.description.clone(),
                state: milestone.state.clone(),
                due_on: milestone.due_on.clone(),
                url: milestone.html_url.clone(),
                open_issues: milestone.open_issues,
                closed_issues: milestone.closed_issues,
                updated_at: milestone.updated_at.clone(),
                synced_at: now.clone(),
            };
            queries::upsert_github_milestone(&self.pool, &row)
                .await
                .map_err(|e| format!("upsert github milestone {}: {e}", milestone.number))?;
        }

        let mut ops_events_upserted = 0u32;
        for issue in &issues {
            let previous = queries::get_github_issue(&self.pool, &config.repo, issue.number)
                .await
                .map_err(|e| format!("load previous github issue #{}: {e}", issue.number))?;
            let previous_state = previous.as_ref().map(|row| row.state.as_str());
            let labels = labels_to_names(&issue.labels);
            let assignees = assignees_to_logins(&issue.assignees);
            let assignees_json = serde_json::to_string(&assignees)
                .map_err(|e| format!("serialize github assignees: {e}"))?;
            let labels_json = serde_json::to_string(&labels)
                .map_err(|e| format!("serialize github labels: {e}"))?;
            let state_event_type = event_type_for_issue(previous_state, &issue.state);
            let event_type = if state_event_type == "github.issue.updated" {
                previous
                    .as_ref()
                    .and_then(|row| {
                        if row.labels_json != labels_json {
                            Some("github.issue.labels_changed")
                        } else if row.assignee_logins_json != assignees_json {
                            Some("github.issue.assignees_changed")
                        } else {
                            None
                        }
                    })
                    .unwrap_or(state_event_type)
            } else {
                state_event_type
            };
            let milestone_number = issue.milestone.as_ref().map(|milestone| milestone.number);
            let project_id = milestone_number.map(|number| github_project_id(&config.repo, number));
            let issue_id = github_issue_id(&config.repo, issue.number);
            let occurred_at = issue
                .updated_at
                .clone()
                .unwrap_or_else(|| Utc::now().to_rfc3339());
            let row = GithubIssueCache {
                repo: config.repo.clone(),
                number: issue.number,
                node_id: issue.node_id.clone(),
                title: issue.title.clone(),
                body_excerpt: issue_body_excerpt(issue.body.as_deref()),
                state: issue.state.clone(),
                url: issue.html_url.clone(),
                milestone_number,
                assignee_logins_json: assignees_json,
                labels_json,
                priority: priority_from_labels(&labels),
                track: track_from_issue(&issue.title, &labels),
                created_at: issue.created_at.clone(),
                updated_at: issue.updated_at.clone(),
                closed_at: issue.closed_at.clone(),
                synced_at: now.clone(),
            };

            queries::upsert_github_issue(&self.pool, &row)
                .await
                .map_err(|e| format!("upsert github issue #{}: {e}", issue.number))?;

            let payload_json = serde_json::to_string(&serde_json::json!({
                "repo": &config.repo,
                "number": issue.number,
                "title": &issue.title,
                "state": &issue.state,
                "url": &issue.html_url,
                "milestone_number": milestone_number,
                "milestone_title": issue.milestone.as_ref().map(|milestone| milestone.title.clone()),
                "labels": &labels,
                "assignees": &assignees,
                "priority": &row.priority,
                "track": &row.track,
                "project_id": &project_id,
            }))
            .map_err(|e| format!("serialize github ops payload: {e}"))?;

            let sync_key = build_sync_key(&OpsSyncKeyInput {
                source: "github",
                event_type,
                entity_type: "github_issue",
                entity_id: &issue_id,
                actor_employee_id: None,
                actor_clockify_user_id: None,
                actor_huly_person_id: None,
                actor_slack_user_id: None,
                occurred_at: &occurred_at,
            });
            let event = OpsEvent {
                id: None,
                sync_key,
                schema_version: OPS_EVENT_SCHEMA_VERSION.to_string(),
                source: "github".to_string(),
                event_type: event_type.to_string(),
                entity_type: "github_issue".to_string(),
                entity_id: issue_id,
                actor_employee_id: None,
                actor_clockify_user_id: None,
                actor_huly_person_id: None,
                actor_slack_user_id: None,
                occurred_at,
                severity: "info".to_string(),
                payload_json,
                detected_at: Utc::now().to_rfc3339(),
            };
            queries::upsert_ops_event(&self.pool, &event)
                .await
                .map_err(|e| format!("upsert github ops event: {e}"))?;
            ops_events_upserted += 1;
        }

        let default_milestone = config
            .default_milestone_number
            .or_else(|| milestones.first().map(|milestone| milestone.number))
            .unwrap_or(0);
        let project_issues: Vec<_> = issues
            .iter()
            .filter(|issue| {
                issue
                    .milestone
                    .as_ref()
                    .map(|milestone| milestone.number == default_milestone)
                    .unwrap_or(default_milestone == 0)
            })
            .collect();
        let open_issues = project_issues
            .iter()
            .filter(|issue| issue.state.eq_ignore_ascii_case("open"))
            .count() as u32;
        let closed_issues = project_issues
            .iter()
            .filter(|issue| issue.state.eq_ignore_ascii_case("closed"))
            .count() as u32;

        let state = SyncState {
            source: "github".to_string(),
            entity: format!("issues:{}", config.repo),
            last_sync_at: now,
            last_cursor: None,
        };
        queries::set_sync_state(&self.pool, &state)
            .await
            .map_err(|e| format!("set github sync state: {e}"))?;

        Ok(GithubSyncReport {
            repo: config.repo.clone(),
            project_id: github_project_id(&config.repo, default_milestone),
            milestones_synced: milestones.len() as u32,
            issues_synced: issues.len() as u32,
            ops_events_upserted,
            total_issues: project_issues.len() as u32,
            open_issues,
            closed_issues,
        })
    }
}
