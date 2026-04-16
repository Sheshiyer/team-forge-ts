use std::collections::HashSet;

use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

use crate::db::models::{
    TeamforgeProject, TeamforgeProjectArtifact, TeamforgeProjectGithubRepoLink,
    TeamforgeProjectGraph, TeamforgeProjectHulyLink,
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
#[serde(rename_all = "camelCase")]
struct WorkerProject {
    id: String,
    workspace_id: String,
    slug: Option<String>,
    name: String,
    portfolio_name: Option<String>,
    client_name: Option<String>,
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
struct WorkerProjectGraph {
    project: WorkerProject,
    #[serde(default)]
    github_links: Vec<WorkerGithubLink>,
    #[serde(default)]
    huly_links: Vec<WorkerHulyLink>,
    #[serde(default)]
    artifacts: Vec<WorkerArtifact>,
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
            client_name: graph.project.client_name,
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
                id: artifact.id.unwrap_or_else(|| format!("tf-artifact-{}", artifact.title)),
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
