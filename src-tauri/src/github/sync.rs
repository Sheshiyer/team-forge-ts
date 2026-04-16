use chrono::Utc;
use sqlx::SqlitePool;

use super::client::GithubClient;
use super::types::{
    assignees_to_logins, event_type_for_check_run, event_type_for_issue,
    event_type_for_pull_request, github_branch_id, github_check_run_id, github_issue_id,
    github_project_id, github_pull_request_id, issue_body_excerpt, labels_to_names,
    priority_from_labels, track_from_issue, GithubBranch, GithubCheckRun, GithubIssue,
    GithubPullRequest,
};
use crate::db::models::{
    GithubBranchCache, GithubCheckRunCache, GithubIssueCache, GithubMilestoneCache,
    GithubPullRequestCache, GithubRepoConfig, GithubSyncReport, OpsEvent, SyncState,
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
        let pull_requests = self.client.get_pull_requests(&config.repo).await?;
        let branches = self.client.get_branches(&config.repo).await?;

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
            self.sync_issue(config, issue, &now, &mut ops_events_upserted)
                .await?;
        }

        for pr in &pull_requests {
            self.sync_pull_request(config, pr, &now, &mut ops_events_upserted)
                .await?;
        }

        let mut check_runs_synced = 0u32;
        for (index, branch) in branches.iter().enumerate() {
            self.sync_branch(config, branch, &now, &mut ops_events_upserted)
                .await?;

            if index < GithubClient::max_branch_check_refs() {
                let check_runs = self
                    .client
                    .get_check_runs_for_ref(&config.repo, &branch.name, &branch.commit.sha)
                    .await?;
                check_runs_synced += check_runs.len() as u32;
                for check_run in &check_runs {
                    self.sync_check_run(
                        config,
                        &branch.name,
                        check_run,
                        &now,
                        &mut ops_events_upserted,
                    )
                    .await?;
                }
            }
        }

        for pr in &pull_requests {
            if !branches
                .iter()
                .any(|branch| branch.name == pr.head.ref_name)
            {
                let check_runs = self
                    .client
                    .get_check_runs_for_ref(&config.repo, &pr.head.ref_name, &pr.head.sha)
                    .await?;
                check_runs_synced += check_runs.len() as u32;
                for check_run in &check_runs {
                    self.sync_check_run(
                        config,
                        &pr.head.ref_name,
                        check_run,
                        &now,
                        &mut ops_events_upserted,
                    )
                    .await?;
                }
            }
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
            pull_requests_synced: pull_requests.len() as u32,
            branches_synced: branches.len() as u32,
            check_runs_synced,
            ops_events_upserted,
            total_issues: project_issues.len() as u32,
            open_issues,
            closed_issues,
        })
    }

    async fn sync_issue(
        &self,
        config: &GithubRepoConfig,
        issue: &GithubIssue,
        now: &str,
        ops_events_upserted: &mut u32,
    ) -> Result<(), String> {
        let previous = queries::get_github_issue(&self.pool, &config.repo, issue.number)
            .await
            .map_err(|e| format!("load previous github issue #{}: {e}", issue.number))?;
        let previous_state = previous.as_ref().map(|row| row.state.as_str());
        let labels = labels_to_names(&issue.labels);
        let assignees = assignees_to_logins(&issue.assignees);
        let assignees_json = serde_json::to_string(&assignees)
            .map_err(|e| format!("serialize github assignees: {e}"))?;
        let labels_json =
            serde_json::to_string(&labels).map_err(|e| format!("serialize github labels: {e}"))?;
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
            synced_at: now.to_string(),
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

        self.upsert_github_event(
            event_type,
            "github_issue",
            issue_id,
            occurred_at,
            "info",
            payload_json,
            ops_events_upserted,
        )
        .await
    }

    async fn sync_pull_request(
        &self,
        config: &GithubRepoConfig,
        pr: &GithubPullRequest,
        now: &str,
        ops_events_upserted: &mut u32,
    ) -> Result<(), String> {
        let previous = queries::get_github_pull_request(&self.pool, &config.repo, pr.number)
            .await
            .map_err(|e| format!("load previous github pull request #{}: {e}", pr.number))?;
        let labels = labels_to_names(&pr.labels);
        let assignees = assignees_to_logins(&pr.assignees);
        let labels_json =
            serde_json::to_string(&labels).map_err(|e| format!("serialize github labels: {e}"))?;
        let assignees_json = serde_json::to_string(&assignees)
            .map_err(|e| format!("serialize github assignees: {e}"))?;
        let event_type = event_type_for_pull_request(
            previous.as_ref().map(|row| row.state.as_str()),
            previous.as_ref().and_then(|row| row.merged_at.as_deref()),
            &pr.state,
            pr.merged_at.as_deref(),
        );
        let pr_id = github_pull_request_id(&config.repo, pr.number);
        let occurred_at = pr
            .updated_at
            .clone()
            .unwrap_or_else(|| Utc::now().to_rfc3339());
        let row = GithubPullRequestCache {
            repo: config.repo.clone(),
            number: pr.number,
            node_id: pr.node_id.clone(),
            title: pr.title.clone(),
            state: pr.state.clone(),
            draft: pr.draft,
            url: pr.html_url.clone(),
            head_ref: pr.head.ref_name.clone(),
            head_sha: pr.head.sha.clone(),
            base_ref: pr.base.ref_name.clone(),
            author_login: pr.user.as_ref().map(|user| user.login.clone()),
            labels_json,
            assignee_logins_json: assignees_json,
            created_at: pr.created_at.clone(),
            updated_at: pr.updated_at.clone(),
            closed_at: pr.closed_at.clone(),
            merged_at: pr.merged_at.clone(),
            synced_at: now.to_string(),
        };

        queries::upsert_github_pull_request(&self.pool, &row)
            .await
            .map_err(|e| format!("upsert github pull request #{}: {e}", pr.number))?;

        let payload_json = serde_json::to_string(&serde_json::json!({
            "repo": &config.repo,
            "number": pr.number,
            "title": &pr.title,
            "state": &pr.state,
            "draft": pr.draft,
            "url": &pr.html_url,
            "head_ref": &pr.head.ref_name,
            "head_sha": &pr.head.sha,
            "base_ref": &pr.base.ref_name,
            "author": pr.user.as_ref().map(|user| user.login.clone()),
            "labels": &labels,
            "assignees": &assignees,
            "merged_at": &pr.merged_at,
        }))
        .map_err(|e| format!("serialize github pr ops payload: {e}"))?;

        self.upsert_github_event(
            event_type,
            "github_pull_request",
            pr_id,
            occurred_at,
            "info",
            payload_json,
            ops_events_upserted,
        )
        .await
    }

    async fn sync_branch(
        &self,
        config: &GithubRepoConfig,
        branch: &GithubBranch,
        now: &str,
        ops_events_upserted: &mut u32,
    ) -> Result<(), String> {
        let row = GithubBranchCache {
            repo: config.repo.clone(),
            name: branch.name.clone(),
            commit_sha: branch.commit.sha.clone(),
            protected: branch.protected,
            synced_at: now.to_string(),
        };
        queries::upsert_github_branch(&self.pool, &row)
            .await
            .map_err(|e| format!("upsert github branch {}: {e}", branch.name))?;

        let branch_id = github_branch_id(&config.repo, &branch.name);
        let payload_json = serde_json::to_string(&serde_json::json!({
            "repo": &config.repo,
            "name": &branch.name,
            "commit_sha": &branch.commit.sha,
            "protected": branch.protected,
        }))
        .map_err(|e| format!("serialize github branch ops payload: {e}"))?;

        self.upsert_github_event(
            "github.branch.updated",
            "github_branch",
            branch_id,
            now.to_string(),
            "info",
            payload_json,
            ops_events_upserted,
        )
        .await
    }

    async fn sync_check_run(
        &self,
        config: &GithubRepoConfig,
        branch_name: &str,
        check_run: &GithubCheckRun,
        now: &str,
        ops_events_upserted: &mut u32,
    ) -> Result<(), String> {
        let row = GithubCheckRunCache {
            repo: config.repo.clone(),
            check_run_id: check_run.id,
            branch_name: Some(branch_name.to_string()),
            head_sha: check_run.head_sha.clone(),
            name: check_run.name.clone(),
            status: check_run.status.clone(),
            conclusion: check_run.conclusion.clone(),
            url: check_run.html_url.clone(),
            details_url: check_run.details_url.clone(),
            app_slug: check_run.app.as_ref().and_then(|app| app.slug.clone()),
            started_at: check_run.started_at.clone(),
            completed_at: check_run.completed_at.clone(),
            synced_at: now.to_string(),
        };
        queries::upsert_github_check_run(&self.pool, &row)
            .await
            .map_err(|e| format!("upsert github check run {}: {e}", check_run.id))?;

        let event_type =
            event_type_for_check_run(&check_run.status, check_run.conclusion.as_deref());
        let severity = if event_type == "github.check_run.failed" {
            "warning"
        } else {
            "info"
        };
        let occurred_at = check_run
            .completed_at
            .clone()
            .or_else(|| check_run.started_at.clone())
            .unwrap_or_else(|| now.to_string());
        let check_id = github_check_run_id(&config.repo, check_run.id);
        let payload_json = serde_json::to_string(&serde_json::json!({
            "repo": &config.repo,
            "branch": branch_name,
            "head_sha": &check_run.head_sha,
            "name": &check_run.name,
            "status": &check_run.status,
            "conclusion": &check_run.conclusion,
            "url": &check_run.html_url,
            "details_url": &check_run.details_url,
            "app_slug": check_run.app.as_ref().and_then(|app| app.slug.clone()),
        }))
        .map_err(|e| format!("serialize github check ops payload: {e}"))?;

        self.upsert_github_event(
            event_type,
            "github_check_run",
            check_id,
            occurred_at,
            severity,
            payload_json,
            ops_events_upserted,
        )
        .await
    }

    async fn upsert_github_event(
        &self,
        event_type: &str,
        entity_type: &str,
        entity_id: String,
        occurred_at: String,
        severity: &str,
        payload_json: String,
        ops_events_upserted: &mut u32,
    ) -> Result<(), String> {
        let sync_key = build_sync_key(&OpsSyncKeyInput {
            source: "github",
            event_type,
            entity_type,
            entity_id: &entity_id,
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
            entity_type: entity_type.to_string(),
            entity_id,
            actor_employee_id: None,
            actor_clockify_user_id: None,
            actor_huly_person_id: None,
            actor_slack_user_id: None,
            occurred_at,
            severity: severity.to_string(),
            payload_json,
            detected_at: Utc::now().to_rfc3339(),
        };
        queries::upsert_ops_event(&self.pool, &event)
            .await
            .map_err(|e| format!("upsert github ops event: {e}"))?;
        *ops_events_upserted += 1;
        Ok(())
    }
}
