use std::collections::HashSet;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::commands::ActiveProjectIssueView;
use crate::db::models::{
    TeamforgeClientProfileView, TeamforgeOnboardingFlowDetail, TeamforgeOnboardingTaskView,
    TeamforgePolicyStateView, TeamforgeProject, TeamforgeProjectArtifact,
    TeamforgeProjectControlPlaneSummaryView, TeamforgeProjectControlPlaneView,
    TeamforgeProjectGithubRepoLink, TeamforgeProjectGraph, TeamforgeProjectHulyLink,
    TeamforgeProjectSyncPolicyView, TeamforgeSyncConflictView, TeamforgeSyncEntityMappingView,
    TeamforgeSyncJournalEntryView,
};
use crate::db::queries;

const DEFAULT_WORKER_BASE_URL: &str = "https://teamforge-api.sheshnarayan-iyer.workers.dev";

#[derive(Debug, Deserialize)]
struct WorkerEnvelope<T> {
    ok: bool,
    data: Option<T>,
}

#[derive(Debug, Deserialize)]
struct WorkerProjectListPayload {
    projects: Vec<WorkerProjectGraph>,
}

#[derive(Debug, Deserialize)]
struct WorkerProjectSavePayload {
    project: WorkerProjectGraph,
}

#[derive(Debug, Deserialize)]
struct WorkerProjectControlPlanePayload {
    detail: WorkerProjectControlPlane,
}

#[derive(Debug, Deserialize)]
struct WorkerClientProfileListPayload {
    #[serde(default, alias = "clientProfiles", alias = "profiles")]
    client_profiles: Vec<WorkerClientProfile>,
}

#[derive(Debug, Deserialize)]
struct WorkerClientProfileDetailPayload {
    #[serde(alias = "clientProfile", alias = "profile")]
    client_profile: WorkerClientProfile,
}

#[derive(Debug, Deserialize)]
struct WorkerOnboardingFlowListPayload {
    #[serde(default, alias = "onboardingFlows")]
    flows: Vec<WorkerOnboardingFlowRecord>,
}

#[derive(Debug, Deserialize)]
struct WorkerProjectIssueFeedPayload {
    issues: Vec<WorkerProjectIssueFeedItem>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerProject {
    id: String,
    workspace_id: String,
    slug: Option<String>,
    name: String,
    portfolio_name: Option<String>,
    client_id: Option<String>,
    client_name: Option<String>,
    clockify_project_id: Option<String>,
    project_type: Option<String>,
    status: String,
    sync_mode: String,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerGithubLink {
    repo: String,
    display_name: Option<String>,
    is_primary: bool,
    sync_issues: bool,
    sync_milestones: bool,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerHulyLink {
    huly_project_id: String,
    sync_issues: bool,
    sync_milestones: bool,
    sync_components: bool,
    sync_templates: bool,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerArtifact {
    id: Option<String>,
    artifact_type: String,
    title: String,
    url: String,
    source: String,
    external_id: Option<String>,
    is_primary: bool,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerClientProfile {
    workspace_id: Option<String>,
    client_id: String,
    client_name: String,
    engagement_model: Option<String>,
    industry: Option<String>,
    primary_contact: Option<String>,
    #[serde(default)]
    project_ids: Vec<String>,
    #[serde(default)]
    stakeholders: Vec<String>,
    #[serde(default)]
    strategic_fit: Vec<String>,
    #[serde(default)]
    risks: Vec<String>,
    #[serde(default)]
    resource_links: Vec<String>,
    active: bool,
    onboarded: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerOnboardingFlowRecord {
    flow: WorkerOnboardingFlow,
    #[serde(default)]
    tasks: Vec<WorkerOnboardingTask>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerOnboardingFlow {
    workspace_id: Option<String>,
    flow_id: String,
    audience: String,
    status: String,
    owner: Option<String>,
    starts_on: Option<String>,
    subject_id: Option<String>,
    subject_name: Option<String>,
    client_id: Option<String>,
    member_id: Option<String>,
    primary_contact: Option<String>,
    manager: Option<String>,
    department: Option<String>,
    joined_on: Option<String>,
    source: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerOnboardingTask {
    task_id: String,
    title: String,
    completed: bool,
    completed_at: Option<String>,
    resource_created: Option<String>,
    notes: Option<String>,
    position: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerProjectIssueFeedItem {
    id: String,
    project_id: String,
    project_name: String,
    client_id: Option<String>,
    client_name: Option<String>,
    repo: String,
    number: i64,
    title: String,
    state: String,
    url: String,
    milestone_number: Option<i64>,
    #[serde(default)]
    labels: Vec<String>,
    #[serde(default)]
    assignees: Vec<String>,
    priority: Option<String>,
    track: Option<String>,
    created_at: Option<String>,
    updated_at: Option<String>,
    closed_at: Option<String>,
    last_synced_at: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerProjectPolicy {
    issues_enabled: bool,
    milestones_enabled: bool,
    components_enabled: bool,
    templates_enabled: bool,
    issue_ownership_mode: String,
    engineering_source: String,
    execution_source: String,
    milestone_authority: String,
    issue_classification_mode: String,
    direction_mode: String,
    rule_config: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerProjectGraph {
    project: WorkerProject,
    #[serde(default)]
    github_links: Vec<WorkerGithubLink>,
    #[serde(default)]
    huly_links: Vec<WorkerHulyLink>,
    #[serde(default)]
    artifacts: Vec<WorkerArtifact>,
    policy: Option<WorkerProjectPolicy>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerPolicyState {
    sync_state: String,
    last_sync_at: Option<String>,
    last_sync_status: Option<String>,
    last_sync_job_id: Option<String>,
    paused_at: Option<String>,
    paused_by: Option<String>,
    last_error_code: Option<String>,
    last_error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerEntityMapping {
    id: String,
    entity_type: String,
    title: String,
    status: Option<String>,
    ownership_domain: String,
    classification_source: String,
    classification_reason: Option<String>,
    mapping_status: String,
    source_url: Option<String>,
    github_repo: Option<String>,
    github_number: Option<i64>,
    huly_project_id: Option<String>,
    huly_entity_id: Option<String>,
    last_source: Option<String>,
    last_source_version: Option<String>,
    created_at: String,
    updated_at: String,
    last_synced_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerJournalEntry {
    id: String,
    entity_mapping_id: Option<String>,
    entity_type: String,
    source_system: String,
    destination_system: String,
    action: String,
    status: String,
    source_ref: Option<String>,
    destination_ref: Option<String>,
    payload_hash: String,
    payload_json: Option<String>,
    retry_count: u32,
    conflict_id: Option<String>,
    job_id: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
    actor_id: Option<String>,
    created_at: String,
    updated_at: String,
    started_at: Option<String>,
    finished_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerConflict {
    id: String,
    entity_mapping_id: Option<String>,
    entity_type: String,
    conflict_type: String,
    canonical_source: String,
    detected_source: String,
    status: String,
    summary: String,
    github_payload_json: Option<String>,
    huly_payload_json: Option<String>,
    resolution_note: Option<String>,
    resolved_by: Option<String>,
    created_at: String,
    updated_at: String,
    resolved_at: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerControlSummary {
    open_conflicts: u32,
    mapped_milestones: u32,
    engineering_issues: u32,
    execution_issues: u32,
    recent_failures: u32,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WorkerProjectControlPlane {
    project: WorkerProjectGraph,
    policy_state: WorkerPolicyState,
    #[serde(default)]
    entity_mappings: Vec<WorkerEntityMapping>,
    #[serde(default)]
    journal: Vec<WorkerJournalEntry>,
    #[serde(default)]
    conflicts: Vec<WorkerConflict>,
    summary: WorkerControlSummary,
}

fn map_worker_graph(graph: WorkerProjectGraph) -> TeamforgeProjectGraph {
    let project_id = graph.project.id.clone();
    let created_at = graph.project.created_at.clone();
    let updated_at = graph.project.updated_at.clone();

    TeamforgeProjectGraph {
        project: TeamforgeProject {
            id: graph.project.id.clone(),
            slug: graph
                .project
                .slug
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(|value| value.to_string())
                .unwrap_or_else(|| graph.project.id.clone()),
            name: graph.project.name,
            portfolio_name: graph.project.portfolio_name,
            client_id: graph.project.client_id,
            client_name: graph.project.client_name,
            clockify_project_id: graph.project.clockify_project_id,
            project_type: graph.project.project_type,
            status: graph.project.status,
            sync_mode: graph.project.sync_mode,
            created_at: created_at.clone(),
            updated_at: updated_at.clone(),
        },
        github_repos: graph
            .github_links
            .into_iter()
            .map(|link| TeamforgeProjectGithubRepoLink {
                project_id: project_id.clone(),
                repo: link.repo,
                display_name: link.display_name,
                is_primary: link.is_primary,
                sync_issues: link.sync_issues,
                sync_milestones: link.sync_milestones,
                created_at: link.created_at.unwrap_or_else(|| created_at.clone()),
                updated_at: link.updated_at.unwrap_or_else(|| updated_at.clone()),
            })
            .collect(),
        huly_links: graph
            .huly_links
            .into_iter()
            .map(|link| TeamforgeProjectHulyLink {
                project_id: project_id.clone(),
                huly_project_id: link.huly_project_id,
                sync_issues: link.sync_issues,
                sync_milestones: link.sync_milestones,
                sync_components: link.sync_components,
                sync_templates: link.sync_templates,
                created_at: link.created_at.unwrap_or_else(|| created_at.clone()),
                updated_at: link.updated_at.unwrap_or_else(|| updated_at.clone()),
            })
            .collect(),
        artifacts: graph
            .artifacts
            .into_iter()
            .map(|artifact| TeamforgeProjectArtifact {
                id: artifact
                    .id
                    .unwrap_or_else(|| format!("tf-artifact-{}", artifact.title)),
                project_id: project_id.clone(),
                artifact_type: artifact.artifact_type,
                title: artifact.title,
                url: artifact.url,
                source: artifact.source,
                external_id: artifact.external_id,
                is_primary: artifact.is_primary,
                created_at: artifact.created_at.unwrap_or_else(|| created_at.clone()),
                updated_at: artifact.updated_at.unwrap_or_else(|| updated_at.clone()),
            })
            .collect(),
        client_profile: None,
    }
}

fn calculate_client_profile_completeness(profile: &TeamforgeClientProfileView) -> f64 {
    let fields = [
        profile.engagement_model.is_some(),
        profile.industry.is_some(),
        profile.primary_contact.is_some(),
        profile.onboarded.is_some(),
        !profile.project_ids.is_empty(),
        !profile.stakeholders.is_empty(),
        !profile.strategic_fit.is_empty(),
        !profile.risks.is_empty(),
        !profile.resource_links.is_empty(),
    ];
    let completed = fields.into_iter().filter(|value| *value).count() as f64;
    (completed / 9.0) * 100.0
}

fn map_worker_client_profile(profile: WorkerClientProfile) -> TeamforgeClientProfileView {
    let mut mapped = TeamforgeClientProfileView {
        workspace_id: profile.workspace_id.unwrap_or_default(),
        client_id: profile.client_id,
        client_name: profile.client_name,
        engagement_model: profile.engagement_model,
        industry: profile.industry,
        primary_contact: profile.primary_contact,
        project_ids: profile.project_ids,
        stakeholders: profile.stakeholders,
        strategic_fit: profile.strategic_fit,
        risks: profile.risks,
        resource_links: profile.resource_links,
        active: profile.active,
        onboarded: profile.onboarded,
        created_at: profile.created_at.unwrap_or_default(),
        updated_at: profile.updated_at.unwrap_or_default(),
        profile_completeness: 0.0,
    };
    mapped.profile_completeness = calculate_client_profile_completeness(&mapped);
    mapped
}

fn map_worker_onboarding_task(
    task: WorkerOnboardingTask,
    sort_order: i64,
) -> TeamforgeOnboardingTaskView {
    TeamforgeOnboardingTaskView {
        task_id: task.task_id,
        sort_order,
        title: task.title,
        completed: task.completed,
        completed_at: task.completed_at,
        resource_created: task.resource_created,
        notes: task.notes,
    }
}

fn map_worker_onboarding_flow(record: WorkerOnboardingFlowRecord) -> TeamforgeOnboardingFlowDetail {
    let flow = record.flow;
    let subject_id = flow
        .subject_id
        .clone()
        .or_else(|| {
            if flow.audience == "client" {
                flow.client_id.clone()
            } else {
                flow.member_id.clone()
            }
        })
        .unwrap_or_default();
    let subject_name = flow
        .subject_name
        .clone()
        .unwrap_or_else(|| subject_id.clone());

    TeamforgeOnboardingFlowDetail {
        workspace_id: flow.workspace_id.unwrap_or_default(),
        flow_id: flow.flow_id,
        audience: flow.audience,
        status: flow.status,
        owner: flow.owner,
        starts_on: flow.starts_on.unwrap_or_default(),
        subject_id,
        subject_name,
        primary_contact: flow.primary_contact,
        manager: flow.manager,
        department: flow.department,
        joined_on: flow.joined_on,
        source: flow.source.unwrap_or_else(|| "vault".to_string()),
        created_at: flow.created_at.unwrap_or_default(),
        updated_at: flow.updated_at.unwrap_or_default(),
        tasks: record
            .tasks
            .into_iter()
            .enumerate()
            .map(|(index, task)| {
                let sort_order = task.position.unwrap_or(index as i64);
                map_worker_onboarding_task(task, sort_order)
            })
            .collect(),
    }
}

fn map_worker_policy(policy: WorkerProjectPolicy) -> TeamforgeProjectSyncPolicyView {
    TeamforgeProjectSyncPolicyView {
        issues_enabled: policy.issues_enabled,
        milestones_enabled: policy.milestones_enabled,
        components_enabled: policy.components_enabled,
        templates_enabled: policy.templates_enabled,
        issue_ownership_mode: policy.issue_ownership_mode,
        engineering_source: policy.engineering_source,
        execution_source: policy.execution_source,
        milestone_authority: policy.milestone_authority,
        issue_classification_mode: policy.issue_classification_mode,
        direction_mode: policy.direction_mode,
        rule_config_json: policy.rule_config.map(|value| value.to_string()),
        created_at: policy.created_at,
        updated_at: policy.updated_at,
    }
}

fn map_worker_control_plane(detail: WorkerProjectControlPlane) -> TeamforgeProjectControlPlaneView {
    TeamforgeProjectControlPlaneView {
        policy: detail
            .project
            .policy
            .as_ref()
            .cloned()
            .map(map_worker_policy),
        project: map_worker_graph(detail.project),
        policy_state: TeamforgePolicyStateView {
            sync_state: detail.policy_state.sync_state,
            last_sync_at: detail.policy_state.last_sync_at,
            last_sync_status: detail.policy_state.last_sync_status,
            last_sync_job_id: detail.policy_state.last_sync_job_id,
            paused_at: detail.policy_state.paused_at,
            paused_by: detail.policy_state.paused_by,
            last_error_code: detail.policy_state.last_error_code,
            last_error_message: detail.policy_state.last_error_message,
        },
        entity_mappings: detail
            .entity_mappings
            .into_iter()
            .map(|mapping| TeamforgeSyncEntityMappingView {
                id: mapping.id,
                entity_type: mapping.entity_type,
                title: mapping.title,
                status: mapping.status,
                ownership_domain: mapping.ownership_domain,
                classification_source: mapping.classification_source,
                classification_reason: mapping.classification_reason,
                mapping_status: mapping.mapping_status,
                source_url: mapping.source_url,
                github_repo: mapping.github_repo,
                github_number: mapping.github_number,
                huly_project_id: mapping.huly_project_id,
                huly_entity_id: mapping.huly_entity_id,
                last_source: mapping.last_source,
                last_source_version: mapping.last_source_version,
                created_at: mapping.created_at,
                updated_at: mapping.updated_at,
                last_synced_at: mapping.last_synced_at,
            })
            .collect(),
        journal: detail
            .journal
            .into_iter()
            .map(|entry| TeamforgeSyncJournalEntryView {
                id: entry.id,
                entity_mapping_id: entry.entity_mapping_id,
                entity_type: entry.entity_type,
                source_system: entry.source_system,
                destination_system: entry.destination_system,
                action: entry.action,
                status: entry.status,
                source_ref: entry.source_ref,
                destination_ref: entry.destination_ref,
                payload_hash: entry.payload_hash,
                payload_json: entry.payload_json,
                retry_count: entry.retry_count,
                conflict_id: entry.conflict_id,
                job_id: entry.job_id,
                error_code: entry.error_code,
                error_message: entry.error_message,
                actor_id: entry.actor_id,
                created_at: entry.created_at,
                updated_at: entry.updated_at,
                started_at: entry.started_at,
                finished_at: entry.finished_at,
            })
            .collect(),
        conflicts: detail
            .conflicts
            .into_iter()
            .map(|conflict| TeamforgeSyncConflictView {
                id: conflict.id,
                entity_mapping_id: conflict.entity_mapping_id,
                entity_type: conflict.entity_type,
                conflict_type: conflict.conflict_type,
                canonical_source: conflict.canonical_source,
                detected_source: conflict.detected_source,
                status: conflict.status,
                summary: conflict.summary,
                github_payload_json: conflict.github_payload_json,
                huly_payload_json: conflict.huly_payload_json,
                resolution_note: conflict.resolution_note,
                resolved_by: conflict.resolved_by,
                created_at: conflict.created_at,
                updated_at: conflict.updated_at,
                resolved_at: conflict.resolved_at,
            })
            .collect(),
        summary: TeamforgeProjectControlPlaneSummaryView {
            open_conflicts: detail.summary.open_conflicts,
            mapped_milestones: detail.summary.mapped_milestones,
            engineering_issues: detail.summary.engineering_issues,
            execution_issues: detail.summary.execution_issues,
            recent_failures: detail.summary.recent_failures,
        },
    }
}

async fn worker_base_url(pool: &SqlitePool) -> Result<String, String> {
    Ok(queries::get_setting(pool, "cloud_credentials_base_url")
        .await
        .map_err(|e| format!("read cloud_credentials_base_url: {e}"))?
        .unwrap_or_else(|| DEFAULT_WORKER_BASE_URL.to_string()))
}

async fn worker_access_token(pool: &SqlitePool) -> Result<String, String> {
    let token = queries::get_setting(pool, "cloud_credentials_access_token")
        .await
        .map_err(|e| format!("read cloud_credentials_access_token: {e}"))?
        .ok_or_else(|| "cloud credential access token is not configured".to_string())?;
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Err("cloud credential access token is not configured".to_string());
    }
    Ok(trimmed.to_string())
}

async fn worker_url(
    pool: &SqlitePool,
    path: &str,
    query: &[(&str, String)],
) -> Result<String, String> {
    let base_url = worker_base_url(pool).await?;
    let mut url = reqwest::Url::parse(&format!("{}{}", base_url.trim_end_matches('/'), path))
        .map_err(|e| format!("build TeamForge Worker url: {e}"))?;
    if !query.is_empty() {
        let mut pairs = url.query_pairs_mut();
        for (key, value) in query {
            pairs.append_pair(key, value);
        }
    }
    Ok(url.to_string())
}

async fn resolved_workspace_query_value(pool: &SqlitePool) -> Option<String> {
    resolve_teamforge_workspace_id(pool).await.ok().flatten()
}

async fn fetch_worker_graphs(pool: &SqlitePool) -> Result<Vec<WorkerProjectGraph>, String> {
    let client = Client::new();
    let base_url = worker_base_url(pool).await?;
    let access_token = worker_access_token(pool).await?;
    let url = format!("{}/v1/project-mappings", base_url.trim_end_matches('/'));

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge project graph: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge project graph returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerProjectListPayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge project graph response: {e}"))?;
    if !body.ok {
        return Err("TeamForge project graph response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge project graph response was missing data".to_string())?;
    Ok(data.projects)
}

pub async fn fetch_teamforge_project_graphs(
    pool: &SqlitePool,
) -> Result<Vec<TeamforgeProjectGraph>, String> {
    let remote = fetch_worker_graphs(pool).await?;
    Ok(remote.into_iter().map(map_worker_graph).collect())
}

pub async fn fetch_teamforge_client_profiles(
    pool: &SqlitePool,
) -> Result<Vec<TeamforgeClientProfileView>, String> {
    let client = Client::new();
    let access_token = worker_access_token(pool).await?;
    let mut query = Vec::new();
    if let Some(workspace_id) = resolved_workspace_query_value(pool).await {
        query.push(("workspace_id", workspace_id));
    }
    let url = worker_url(pool, "/v1/client-profiles", &query).await?;

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge client profiles: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge client profiles returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerClientProfileListPayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge client profile response: {e}"))?;
    if !body.ok {
        return Err("TeamForge client profile response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge client profile response was missing data".to_string())?;
    Ok(data
        .client_profiles
        .into_iter()
        .map(map_worker_client_profile)
        .collect())
}

pub async fn fetch_teamforge_client_profile(
    pool: &SqlitePool,
    client_id: &str,
) -> Result<Option<TeamforgeClientProfileView>, String> {
    let client = Client::new();
    let access_token = worker_access_token(pool).await?;
    let mut query = Vec::new();
    if let Some(workspace_id) = resolved_workspace_query_value(pool).await {
        query.push(("workspace_id", workspace_id));
    }
    let url = worker_url(pool, &format!("/v1/client-profiles/{client_id}"), &query).await?;

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge client profile detail: {e}"))?;

    if response.status() == reqwest::StatusCode::NOT_FOUND {
        return Ok(None);
    }
    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge client profile detail returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerClientProfileDetailPayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge client profile detail response: {e}"))?;
    if !body.ok {
        return Err("TeamForge client profile detail response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge client profile detail response was missing data".to_string())?;
    Ok(Some(map_worker_client_profile(data.client_profile)))
}

pub async fn fetch_teamforge_onboarding_flows(
    pool: &SqlitePool,
    audience: Option<&str>,
) -> Result<Vec<TeamforgeOnboardingFlowDetail>, String> {
    let client = Client::new();
    let access_token = worker_access_token(pool).await?;
    let mut query = Vec::new();
    if let Some(workspace_id) = resolved_workspace_query_value(pool).await {
        query.push(("workspace_id", workspace_id));
    }
    if let Some(audience) = audience {
        query.push(("audience", audience.to_string()));
    }
    let url = worker_url(pool, "/v1/onboarding-flows", &query).await?;

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge onboarding flows: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge onboarding flows returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerOnboardingFlowListPayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge onboarding flow response: {e}"))?;
    if !body.ok {
        return Err("TeamForge onboarding flow response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge onboarding flow response was missing data".to_string())?;
    Ok(data
        .flows
        .into_iter()
        .map(map_worker_onboarding_flow)
        .collect())
}

pub async fn fetch_teamforge_active_project_issues(
    pool: &SqlitePool,
) -> Result<Vec<ActiveProjectIssueView>, String> {
    let client = Client::new();
    let access_token = worker_access_token(pool).await?;
    let mut query = vec![("status", "active".to_string())];
    if let Some(workspace_id) = resolved_workspace_query_value(pool).await {
        query.push(("workspace_id", workspace_id));
    }
    let url = worker_url(pool, "/v1/project-mappings/issues", &query).await?;

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge active project issues: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge active project issues returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerProjectIssueFeedPayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge active project issue response: {e}"))?;
    if !body.ok {
        return Err("TeamForge active project issue response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge active project issue response was missing data".to_string())?;
    Ok(data
        .issues
        .into_iter()
        .map(|issue| ActiveProjectIssueView {
            id: issue.id,
            project_id: Some(issue.project_id),
            project_name: issue.project_name,
            client_id: issue.client_id,
            client_name: issue.client_name,
            repo: issue.repo,
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.url,
            milestone_number: issue.milestone_number,
            labels: issue.labels,
            assignees: issue.assignees,
            priority: issue.priority,
            track: issue.track,
            created_at: issue.created_at,
            updated_at: issue.updated_at.or(issue.last_synced_at),
            closed_at: issue.closed_at,
        })
        .collect())
}

pub async fn resolve_teamforge_workspace_id(pool: &SqlitePool) -> Result<Option<String>, String> {
    if let Some(explicit) = queries::get_setting(pool, "teamforge_workspace_id")
        .await
        .map_err(|e| format!("read teamforge_workspace_id: {e}"))?
    {
        let trimmed = explicit.trim();
        if !trimmed.is_empty() {
            return Ok(Some(trimmed.to_string()));
        }
    }

    let graphs = fetch_worker_graphs(pool).await?;
    let workspaces: HashSet<String> = graphs
        .into_iter()
        .map(|graph| graph.project.workspace_id)
        .collect();

    match workspaces.len() {
        0 => Ok(None),
        1 => Ok(workspaces.into_iter().next()),
        _ => Err(
            "Multiple TeamForge workspaces are available; set teamforge_workspace_id before creating a new remote project."
                .to_string(),
        ),
    }
}

pub async fn save_teamforge_project_graph<T: Serialize>(
    pool: &SqlitePool,
    project_id: &str,
    payload: &T,
) -> Result<TeamforgeProjectGraph, String> {
    let client = Client::new();
    let base_url = worker_base_url(pool).await?;
    let access_token = worker_access_token(pool).await?;
    let url = format!(
        "{}/v1/project-mappings/{}",
        base_url.trim_end_matches('/'),
        project_id
    );

    let response = client
        .put(&url)
        .bearer_auth(access_token)
        .json(payload)
        .timeout(std::time::Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| format!("save TeamForge project graph: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "save TeamForge project graph returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerProjectSavePayload> = response
        .json()
        .await
        .map_err(|e| format!("parse saved TeamForge project graph response: {e}"))?;
    if !body.ok {
        return Err("saved TeamForge project graph response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "saved TeamForge project graph response was missing data".to_string())?;
    Ok(map_worker_graph(data.project))
}

pub async fn fetch_teamforge_project_control_plane(
    pool: &SqlitePool,
    project_id: &str,
) -> Result<TeamforgeProjectControlPlaneView, String> {
    let client = Client::new();
    let base_url = worker_base_url(pool).await?;
    let access_token = worker_access_token(pool).await?;
    let url = format!(
        "{}/v1/project-mappings/{}/control-plane",
        base_url.trim_end_matches('/'),
        project_id
    );

    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(20))
        .send()
        .await
        .map_err(|e| format!("fetch TeamForge control plane: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "fetch TeamForge control plane returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<WorkerProjectControlPlanePayload> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge control plane response: {e}"))?;
    if !body.ok {
        return Err("TeamForge control plane response returned ok=false".to_string());
    }

    let data = body
        .data
        .ok_or_else(|| "TeamForge control plane response was missing data".to_string())?;
    Ok(map_worker_control_plane(data.detail))
}

pub async fn post_teamforge_project_action<T: Serialize>(
    pool: &SqlitePool,
    project_id: &str,
    payload: &T,
) -> Result<TeamforgeProjectControlPlaneView, String> {
    let client = Client::new();
    let base_url = worker_base_url(pool).await?;
    let access_token = worker_access_token(pool).await?;
    let url = format!(
        "{}/v1/project-mappings/{}/actions",
        base_url.trim_end_matches('/'),
        project_id
    );

    let response = client
        .post(&url)
        .bearer_auth(access_token)
        .json(payload)
        .timeout(std::time::Duration::from_secs(60))
        .send()
        .await
        .map_err(|e| format!("post TeamForge project action: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "post TeamForge project action returned status {}",
            response.status()
        ));
    }

    let body: WorkerEnvelope<serde_json::Value> = response
        .json()
        .await
        .map_err(|e| format!("parse TeamForge project action response: {e}"))?;
    if !body.ok {
        return Err("TeamForge project action response returned ok=false".to_string());
    }

    let detail_value = body
        .data
        .as_ref()
        .and_then(|data| data.get("detail"))
        .cloned()
        .ok_or_else(|| "TeamForge project action response was missing detail".to_string())?;
    let detail: WorkerProjectControlPlane = serde_json::from_value(detail_value)
        .map_err(|e| format!("parse TeamForge project action detail: {e}"))?;
    Ok(map_worker_control_plane(detail))
}
