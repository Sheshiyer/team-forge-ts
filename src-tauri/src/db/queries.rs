use serde::de::DeserializeOwned;
use serde::Serialize;
use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::collections::HashMap;
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
    ensure_identity_map_columns(&pool).await?;
    ensure_github_repo_config_columns(&pool).await?;
    ensure_teamforge_project_columns(&pool).await?;
    ensure_teamforge_active_issue_columns(&pool).await?;
    ensure_slack_message_activity_columns(&pool).await?;

    Ok(pool)
}

async fn ensure_identity_map_columns(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in [
        "ALTER TABLE identity_map ADD COLUMN override_by TEXT",
        "ALTER TABLE identity_map ADD COLUMN override_reason TEXT",
        "ALTER TABLE identity_map ADD COLUMN override_at TEXT",
    ] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(error);
            }
        }
    }
    Ok(())
}

async fn ensure_github_repo_config_columns(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in ["ALTER TABLE github_repo_configs ADD COLUMN client_name TEXT"] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(error);
            }
        }
    }
    Ok(())
}

async fn ensure_teamforge_project_columns(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in [
        "ALTER TABLE teamforge_projects ADD COLUMN client_id TEXT",
        "ALTER TABLE teamforge_projects ADD COLUMN clockify_project_id TEXT",
    ] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(error);
            }
        }
    }
    Ok(())
}

async fn ensure_teamforge_active_issue_columns(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in ["ALTER TABLE teamforge_active_project_issues ADD COLUMN client_id TEXT"] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(error);
            }
        }
    }
    Ok(())
}

async fn ensure_slack_message_activity_columns(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    for statement in ["ALTER TABLE slack_message_activity ADD COLUMN slack_channel_name TEXT"] {
        if let Err(error) = sqlx::query(statement).execute(pool).await {
            let message = error.to_string().to_lowercase();
            if !message.contains("duplicate column name") {
                return Err(error);
            }
        }
    }
    Ok(())
}

fn serialize_string_list(values: &[String]) -> String {
    serde_json::to_string(values).unwrap_or_else(|_| "[]".to_string())
}

fn deserialize_string_list(value: &str) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(value)
        .unwrap_or_default()
        .into_iter()
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
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

fn map_teamforge_client_profile_cache(
    row: TeamforgeClientProfileCache,
) -> TeamforgeClientProfileView {
    let mut profile = TeamforgeClientProfileView {
        workspace_id: row.workspace_id,
        client_id: row.client_id,
        client_name: row.client_name,
        engagement_model: row.engagement_model,
        industry: row.industry,
        primary_contact: row.primary_contact,
        project_ids: deserialize_string_list(&row.project_ids_json),
        stakeholders: deserialize_string_list(&row.stakeholders_json),
        strategic_fit: deserialize_string_list(&row.strategic_fit_json),
        risks: deserialize_string_list(&row.risks_json),
        resource_links: deserialize_string_list(&row.resource_links_json),
        active: row.active,
        onboarded: row.onboarded,
        created_at: row.created_at,
        updated_at: row.updated_at,
        profile_completeness: 0.0,
    };
    profile.profile_completeness = calculate_client_profile_completeness(&profile);
    profile
}

fn map_teamforge_onboarding_task_cache(
    row: TeamforgeOnboardingTaskCache,
) -> TeamforgeOnboardingTaskView {
    TeamforgeOnboardingTaskView {
        task_id: row.task_id,
        sort_order: row.sort_order,
        title: row.title,
        completed: row.completed,
        completed_at: row.completed_at,
        resource_created: row.resource_created,
        notes: row.notes,
    }
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

pub async fn upsert_employee_kpi_snapshot(
    pool: &SqlitePool,
    snapshot: &EmployeeKpiSnapshotRow,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO employee_kpi_snapshots (
            id,
            employee_id,
            member_id,
            title,
            role_template,
            role_template_file,
            kpi_version,
            last_reviewed,
            reports_to,
            tags_json,
            source_file_path,
            source_relative_path,
            source_last_modified_at,
            role_scope_markdown,
            monthly_kpis_json,
            quarterly_milestones_json,
            yearly_milestones_json,
            cross_role_dependencies_json,
            evidence_sources_json,
            compensation_milestones_json,
            gap_flags_json,
            synthesis_review_markdown,
            body_markdown,
            imported_at,
            updated_at
        )
        VALUES (
            ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10,
            ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20,
            ?21, ?22, ?23, ?24, ?25
        )
        ON CONFLICT(employee_id, kpi_version) DO UPDATE SET
            id = excluded.id,
            member_id = excluded.member_id,
            title = excluded.title,
            role_template = excluded.role_template,
            role_template_file = excluded.role_template_file,
            last_reviewed = excluded.last_reviewed,
            reports_to = excluded.reports_to,
            tags_json = excluded.tags_json,
            source_file_path = excluded.source_file_path,
            source_relative_path = excluded.source_relative_path,
            source_last_modified_at = excluded.source_last_modified_at,
            role_scope_markdown = excluded.role_scope_markdown,
            monthly_kpis_json = excluded.monthly_kpis_json,
            quarterly_milestones_json = excluded.quarterly_milestones_json,
            yearly_milestones_json = excluded.yearly_milestones_json,
            cross_role_dependencies_json = excluded.cross_role_dependencies_json,
            evidence_sources_json = excluded.evidence_sources_json,
            compensation_milestones_json = excluded.compensation_milestones_json,
            gap_flags_json = excluded.gap_flags_json,
            synthesis_review_markdown = excluded.synthesis_review_markdown,
            body_markdown = excluded.body_markdown,
            imported_at = excluded.imported_at,
            updated_at = datetime('now')",
    )
    .bind(&snapshot.id)
    .bind(&snapshot.employee_id)
    .bind(&snapshot.member_id)
    .bind(&snapshot.title)
    .bind(&snapshot.role_template)
    .bind(&snapshot.role_template_file)
    .bind(&snapshot.kpi_version)
    .bind(&snapshot.last_reviewed)
    .bind(&snapshot.reports_to)
    .bind(&snapshot.tags_json)
    .bind(&snapshot.source_file_path)
    .bind(&snapshot.source_relative_path)
    .bind(&snapshot.source_last_modified_at)
    .bind(&snapshot.role_scope_markdown)
    .bind(&snapshot.monthly_kpis_json)
    .bind(&snapshot.quarterly_milestones_json)
    .bind(&snapshot.yearly_milestones_json)
    .bind(&snapshot.cross_role_dependencies_json)
    .bind(&snapshot.evidence_sources_json)
    .bind(&snapshot.compensation_milestones_json)
    .bind(&snapshot.gap_flags_json)
    .bind(&snapshot.synthesis_review_markdown)
    .bind(&snapshot.body_markdown)
    .bind(&snapshot.imported_at)
    .bind(&snapshot.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_latest_employee_kpi_snapshot(
    pool: &SqlitePool,
    employee_id: &str,
) -> Result<Option<EmployeeKpiSnapshotRow>, sqlx::Error> {
    sqlx::query_as::<_, EmployeeKpiSnapshotRow>(
        "SELECT *
         FROM employee_kpi_snapshots
         WHERE employee_id = ?1
         ORDER BY source_last_modified_at DESC, updated_at DESC
         LIMIT 1",
    )
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

// ─── Cross-platform Identity Map ───────────────────────────────

pub async fn upsert_identity_map_entry(
    pool: &SqlitePool,
    entry: &IdentityMapEntry,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO identity_map (
            source,
            external_id,
            employee_id,
            confidence,
            resolution_status,
            match_method,
            is_override,
            override_by,
            override_reason,
            override_at,
            first_seen_at,
            last_seen_at,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(source, external_id) DO UPDATE SET
          employee_id = CASE
            WHEN identity_map.is_override = 1 AND excluded.is_override = 0 THEN identity_map.employee_id
            ELSE excluded.employee_id
          END,
          confidence = CASE
            WHEN identity_map.is_override = 1 AND excluded.is_override = 0 THEN identity_map.confidence
            ELSE excluded.confidence
          END,
          resolution_status = CASE
            WHEN identity_map.is_override = 1 AND excluded.is_override = 0 THEN identity_map.resolution_status
            ELSE excluded.resolution_status
          END,
          match_method = CASE
            WHEN identity_map.is_override = 1 AND excluded.is_override = 0 THEN identity_map.match_method
            ELSE excluded.match_method
          END,
          is_override = CASE
            WHEN identity_map.is_override = 1 AND excluded.is_override = 0 THEN identity_map.is_override
            ELSE excluded.is_override
          END,
          override_by = CASE
            WHEN excluded.is_override = 1 THEN excluded.override_by
            WHEN identity_map.is_override = 1 THEN identity_map.override_by
            ELSE excluded.override_by
          END,
          override_reason = CASE
            WHEN excluded.is_override = 1 THEN excluded.override_reason
            WHEN identity_map.is_override = 1 THEN identity_map.override_reason
            ELSE excluded.override_reason
          END,
          override_at = CASE
            WHEN excluded.is_override = 1 THEN excluded.override_at
            WHEN identity_map.is_override = 1 THEN identity_map.override_at
            ELSE excluded.override_at
          END,
          last_seen_at = excluded.last_seen_at,
          updated_at = datetime('now')",
    )
    .bind(&entry.source)
    .bind(&entry.external_id)
    .bind(&entry.employee_id)
    .bind(entry.confidence)
    .bind(&entry.resolution_status)
    .bind(&entry.match_method)
    .bind(entry.is_override)
    .bind(&entry.override_by)
    .bind(&entry.override_reason)
    .bind(&entry.override_at)
    .bind(&entry.first_seen_at)
    .bind(&entry.last_seen_at)
    .bind(&entry.created_at)
    .bind(&entry.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn resolve_employee_id_by_identity(
    pool: &SqlitePool,
    source: &str,
    external_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    let employee_id: Option<Option<String>> = sqlx::query_scalar(
        "SELECT employee_id
         FROM identity_map
         WHERE source = ?1 AND external_id = ?2 AND resolution_status = 'linked'
         ORDER BY is_override DESC, confidence DESC, updated_at DESC
         LIMIT 1",
    )
    .bind(source)
    .bind(external_id)
    .fetch_optional(pool)
    .await?;
    Ok(employee_id.flatten())
}

pub async fn get_identity_review_queue(
    pool: &SqlitePool,
    max_confidence: f64,
) -> Result<Vec<IdentityMapEntry>, sqlx::Error> {
    sqlx::query_as::<_, IdentityMapEntry>(
        "SELECT *
         FROM identity_map
         WHERE resolution_status != 'linked'
            OR confidence < ?1
            OR (employee_id IS NOT NULL AND is_override = 0 AND confidence < 1.0)
         ORDER BY is_override DESC, confidence ASC, updated_at DESC",
    )
    .bind(max_confidence)
    .fetch_all(pool)
    .await
}

pub async fn clear_competing_identity_links(
    pool: &SqlitePool,
    source: &str,
    employee_id: &str,
    except_external_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE identity_map
         SET employee_id = NULL,
             confidence = 0.0,
             resolution_status = 'orphaned',
             is_override = 0,
             updated_at = datetime('now')
         WHERE source = ?1
           AND employee_id = ?2
           AND external_id != ?3",
    )
    .bind(source)
    .bind(employee_id)
    .bind(except_external_id)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_identity_external_ids_for_employee(
    pool: &SqlitePool,
    source: &str,
    employee_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT external_id
         FROM identity_map
         WHERE source = ?1 AND employee_id = ?2 AND resolution_status = 'linked'
         ORDER BY external_id ASC",
    )
    .bind(source)
    .bind(employee_id)
    .fetch_all(pool)
    .await
}

pub async fn seed_identity_map_from_employees(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let employees = get_employees(pool).await?;
    let now = chrono::Utc::now().to_rfc3339();

    for employee in &employees {
        if !employee.clockify_user_id.trim().is_empty() {
            let entry = IdentityMapEntry {
                id: None,
                source: "clockify".to_string(),
                external_id: employee.clockify_user_id.clone(),
                employee_id: Some(employee.id.clone()),
                confidence: 1.0,
                resolution_status: "linked".to_string(),
                match_method: Some("seed.employee.clockify".to_string()),
                is_override: false,
                override_by: None,
                override_reason: None,
                override_at: None,
                first_seen_at: now.clone(),
                last_seen_at: now.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            upsert_identity_map_entry(pool, &entry).await?;
        }

        if let Some(person_id) = employee
            .huly_person_id
            .as_ref()
            .filter(|value| !value.trim().is_empty())
        {
            let entry = IdentityMapEntry {
                id: None,
                source: "huly".to_string(),
                external_id: person_id.clone(),
                employee_id: Some(employee.id.clone()),
                confidence: 1.0,
                resolution_status: "linked".to_string(),
                match_method: Some("seed.employee.huly".to_string()),
                is_override: false,
                override_by: None,
                override_reason: None,
                override_at: None,
                first_seen_at: now.clone(),
                last_seen_at: now.clone(),
                created_at: now.clone(),
                updated_at: now.clone(),
            };
            upsert_identity_map_entry(pool, &entry).await?;
        }
    }

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

pub async fn replace_teamforge_project_graph(
    pool: &SqlitePool,
    graph: &TeamforgeProjectGraph,
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;

    sqlx::query(
        "INSERT INTO teamforge_projects (
            id,
            slug,
            name,
            portfolio_name,
            client_id,
            client_name,
            clockify_project_id,
            project_type,
            status,
            sync_mode,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
        ON CONFLICT(id) DO UPDATE SET
          slug = excluded.slug,
          name = excluded.name,
          portfolio_name = excluded.portfolio_name,
          client_id = excluded.client_id,
          client_name = excluded.client_name,
          clockify_project_id = excluded.clockify_project_id,
          project_type = excluded.project_type,
          status = excluded.status,
          sync_mode = excluded.sync_mode,
          updated_at = datetime('now')",
    )
    .bind(&graph.project.id)
    .bind(&graph.project.slug)
    .bind(&graph.project.name)
    .bind(&graph.project.portfolio_name)
    .bind(&graph.project.client_id)
    .bind(&graph.project.client_name)
    .bind(&graph.project.clockify_project_id)
    .bind(&graph.project.project_type)
    .bind(&graph.project.status)
    .bind(&graph.project.sync_mode)
    .bind(&graph.project.created_at)
    .bind(&graph.project.updated_at)
    .execute(&mut *tx)
    .await?;

    sqlx::query("DELETE FROM teamforge_project_github_repos WHERE project_id = ?1")
        .bind(&graph.project.id)
        .execute(&mut *tx)
        .await?;
    for repo_link in &graph.github_repos {
        sqlx::query(
            "INSERT INTO teamforge_project_github_repos (
                project_id,
                repo,
                display_name,
                is_primary,
                sync_issues,
                sync_milestones,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(&graph.project.id)
        .bind(&repo_link.repo)
        .bind(&repo_link.display_name)
        .bind(repo_link.is_primary)
        .bind(repo_link.sync_issues)
        .bind(repo_link.sync_milestones)
        .bind(&repo_link.created_at)
        .bind(&repo_link.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("DELETE FROM teamforge_project_huly_links WHERE project_id = ?1")
        .bind(&graph.project.id)
        .execute(&mut *tx)
        .await?;
    for huly_link in &graph.huly_links {
        sqlx::query(
            "INSERT INTO teamforge_project_huly_links (
                project_id,
                huly_project_id,
                sync_issues,
                sync_milestones,
                sync_components,
                sync_templates,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        )
        .bind(&graph.project.id)
        .bind(&huly_link.huly_project_id)
        .bind(huly_link.sync_issues)
        .bind(huly_link.sync_milestones)
        .bind(huly_link.sync_components)
        .bind(huly_link.sync_templates)
        .bind(&huly_link.created_at)
        .bind(&huly_link.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    sqlx::query("DELETE FROM teamforge_project_artifacts WHERE project_id = ?1")
        .bind(&graph.project.id)
        .execute(&mut *tx)
        .await?;
    for artifact in &graph.artifacts {
        sqlx::query(
            "INSERT INTO teamforge_project_artifacts (
                id,
                project_id,
                artifact_type,
                title,
                url,
                source,
                external_id,
                is_primary,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        )
        .bind(&artifact.id)
        .bind(&graph.project.id)
        .bind(&artifact.artifact_type)
        .bind(&artifact.title)
        .bind(&artifact.url)
        .bind(&artifact.source)
        .bind(&artifact.external_id)
        .bind(artifact.is_primary)
        .bind(&artifact.created_at)
        .bind(&artifact.updated_at)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_teamforge_project_graphs(
    pool: &SqlitePool,
) -> Result<Vec<TeamforgeProjectGraph>, sqlx::Error> {
    let projects = sqlx::query_as::<_, TeamforgeProject>(
        "SELECT * FROM teamforge_projects
         ORDER BY
           COALESCE(portfolio_name, ''),
           name,
           id",
    )
    .fetch_all(pool)
    .await?;

    if projects.is_empty() {
        return Ok(Vec::new());
    }

    let project_ids: Vec<String> = projects.iter().map(|project| project.id.clone()).collect();
    let placeholders = project_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");

    let github_sql = format!(
        "SELECT * FROM teamforge_project_github_repos
         WHERE project_id IN ({placeholders})
         ORDER BY project_id, is_primary DESC, repo"
    );
    let mut github_query = sqlx::query_as::<_, TeamforgeProjectGithubRepoLink>(&github_sql);
    for project_id in &project_ids {
        github_query = github_query.bind(project_id);
    }
    let github_links = github_query.fetch_all(pool).await?;

    let huly_sql = format!(
        "SELECT * FROM teamforge_project_huly_links
         WHERE project_id IN ({placeholders})
         ORDER BY project_id, huly_project_id"
    );
    let mut huly_query = sqlx::query_as::<_, TeamforgeProjectHulyLink>(&huly_sql);
    for project_id in &project_ids {
        huly_query = huly_query.bind(project_id);
    }
    let huly_links = huly_query.fetch_all(pool).await?;

    let artifact_sql = format!(
        "SELECT * FROM teamforge_project_artifacts
         WHERE project_id IN ({placeholders})
         ORDER BY project_id, is_primary DESC, artifact_type, title"
    );
    let mut artifact_query = sqlx::query_as::<_, TeamforgeProjectArtifact>(&artifact_sql);
    for project_id in &project_ids {
        artifact_query = artifact_query.bind(project_id);
    }
    let artifacts = artifact_query.fetch_all(pool).await?;

    let mut github_by_project: HashMap<String, Vec<TeamforgeProjectGithubRepoLink>> =
        HashMap::new();
    for link in github_links {
        github_by_project
            .entry(link.project_id.clone())
            .or_default()
            .push(link);
    }

    let mut huly_by_project: HashMap<String, Vec<TeamforgeProjectHulyLink>> = HashMap::new();
    for link in huly_links {
        huly_by_project
            .entry(link.project_id.clone())
            .or_default()
            .push(link);
    }

    let mut artifacts_by_project: HashMap<String, Vec<TeamforgeProjectArtifact>> = HashMap::new();
    for artifact in artifacts {
        artifacts_by_project
            .entry(artifact.project_id.clone())
            .or_default()
            .push(artifact);
    }

    Ok(projects
        .into_iter()
        .map(|project| {
            let project_id = project.id.clone();
            TeamforgeProjectGraph {
                project,
                github_repos: github_by_project.remove(&project_id).unwrap_or_default(),
                huly_links: huly_by_project.remove(&project_id).unwrap_or_default(),
                artifacts: artifacts_by_project.remove(&project_id).unwrap_or_default(),
                client_profile: None,
            }
        })
        .collect())
}

pub async fn replace_teamforge_project_graph_projection(
    pool: &SqlitePool,
    graphs: &[TeamforgeProjectGraph],
) -> Result<(), sqlx::Error> {
    if graphs.is_empty() {
        sqlx::query("DELETE FROM teamforge_projects")
            .execute(pool)
            .await?;
        return Ok(());
    }

    let project_ids: Vec<String> = graphs
        .iter()
        .map(|graph| graph.project.id.clone())
        .collect();
    let placeholders = project_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let delete_sql = format!("DELETE FROM teamforge_projects WHERE id NOT IN ({placeholders})");
    let mut delete_query = sqlx::query(&delete_sql);
    for project_id in &project_ids {
        delete_query = delete_query.bind(project_id);
    }
    delete_query.execute(pool).await?;

    for graph in graphs {
        replace_teamforge_project_graph(pool, graph).await?;
    }

    Ok(())
}

pub async fn upsert_teamforge_client_profile_projection(
    pool: &SqlitePool,
    profile: &TeamforgeClientProfileView,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO teamforge_client_profiles (
            workspace_id,
            client_id,
            client_name,
            engagement_model,
            industry,
            primary_contact,
            project_ids_json,
            stakeholders_json,
            strategic_fit_json,
            risks_json,
            resource_links_json,
            active,
            onboarded,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
        ON CONFLICT(workspace_id, client_id) DO UPDATE SET
          client_name = excluded.client_name,
          engagement_model = excluded.engagement_model,
          industry = excluded.industry,
          primary_contact = excluded.primary_contact,
          project_ids_json = excluded.project_ids_json,
          stakeholders_json = excluded.stakeholders_json,
          strategic_fit_json = excluded.strategic_fit_json,
          risks_json = excluded.risks_json,
          resource_links_json = excluded.resource_links_json,
          active = excluded.active,
          onboarded = excluded.onboarded,
          updated_at = excluded.updated_at",
    )
    .bind(&profile.workspace_id)
    .bind(&profile.client_id)
    .bind(&profile.client_name)
    .bind(&profile.engagement_model)
    .bind(&profile.industry)
    .bind(&profile.primary_contact)
    .bind(serialize_string_list(&profile.project_ids))
    .bind(serialize_string_list(&profile.stakeholders))
    .bind(serialize_string_list(&profile.strategic_fit))
    .bind(serialize_string_list(&profile.risks))
    .bind(serialize_string_list(&profile.resource_links))
    .bind(profile.active)
    .bind(&profile.onboarded)
    .bind(&profile.created_at)
    .bind(&profile.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn replace_teamforge_client_profile_projection(
    pool: &SqlitePool,
    profiles: &[TeamforgeClientProfileView],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM teamforge_client_profiles")
        .execute(&mut *tx)
        .await?;
    for profile in profiles {
        sqlx::query(
            "INSERT INTO teamforge_client_profiles (
                workspace_id,
                client_id,
                client_name,
                engagement_model,
                industry,
                primary_contact,
                project_ids_json,
                stakeholders_json,
                strategic_fit_json,
                risks_json,
                resource_links_json,
                active,
                onboarded,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .bind(&profile.workspace_id)
        .bind(&profile.client_id)
        .bind(&profile.client_name)
        .bind(&profile.engagement_model)
        .bind(&profile.industry)
        .bind(&profile.primary_contact)
        .bind(serialize_string_list(&profile.project_ids))
        .bind(serialize_string_list(&profile.stakeholders))
        .bind(serialize_string_list(&profile.strategic_fit))
        .bind(serialize_string_list(&profile.risks))
        .bind(serialize_string_list(&profile.resource_links))
        .bind(profile.active)
        .bind(&profile.onboarded)
        .bind(&profile.created_at)
        .bind(&profile.updated_at)
        .execute(&mut *tx)
        .await?;
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_teamforge_client_profiles(
    pool: &SqlitePool,
) -> Result<Vec<TeamforgeClientProfileView>, sqlx::Error> {
    let rows = sqlx::query_as::<_, TeamforgeClientProfileCache>(
        "SELECT * FROM teamforge_client_profiles
         ORDER BY active DESC, client_name COLLATE NOCASE, client_id COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(map_teamforge_client_profile_cache)
        .collect())
}

pub async fn get_teamforge_client_profile(
    pool: &SqlitePool,
    client_id: &str,
) -> Result<Option<TeamforgeClientProfileView>, sqlx::Error> {
    let row = sqlx::query_as::<_, TeamforgeClientProfileCache>(
        "SELECT * FROM teamforge_client_profiles
         WHERE client_id = ?1
         ORDER BY updated_at DESC
         LIMIT 1",
    )
    .bind(client_id)
    .fetch_optional(pool)
    .await?;
    Ok(row.map(map_teamforge_client_profile_cache))
}

pub async fn replace_teamforge_onboarding_flow_projection(
    pool: &SqlitePool,
    flows: &[TeamforgeOnboardingFlowDetail],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM teamforge_onboarding_tasks")
        .execute(&mut *tx)
        .await?;
    sqlx::query("DELETE FROM teamforge_onboarding_flows")
        .execute(&mut *tx)
        .await?;
    for flow in flows {
        sqlx::query(
            "INSERT INTO teamforge_onboarding_flows (
                workspace_id,
                flow_id,
                audience,
                status,
                owner,
                starts_on,
                subject_id,
                subject_name,
                primary_contact,
                manager,
                department,
                joined_on,
                source,
                created_at,
                updated_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
        )
        .bind(&flow.workspace_id)
        .bind(&flow.flow_id)
        .bind(&flow.audience)
        .bind(&flow.status)
        .bind(&flow.owner)
        .bind(&flow.starts_on)
        .bind(&flow.subject_id)
        .bind(&flow.subject_name)
        .bind(&flow.primary_contact)
        .bind(&flow.manager)
        .bind(&flow.department)
        .bind(&flow.joined_on)
        .bind(&flow.source)
        .bind(&flow.created_at)
        .bind(&flow.updated_at)
        .execute(&mut *tx)
        .await?;

        for task in &flow.tasks {
            sqlx::query(
                "INSERT INTO teamforge_onboarding_tasks (
                    workspace_id,
                    flow_id,
                    task_id,
                    sort_order,
                    title,
                    completed,
                    completed_at,
                    resource_created,
                    notes,
                    created_at,
                    updated_at
                )
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            )
            .bind(&flow.workspace_id)
            .bind(&flow.flow_id)
            .bind(&task.task_id)
            .bind(task.sort_order)
            .bind(&task.title)
            .bind(task.completed)
            .bind(&task.completed_at)
            .bind(&task.resource_created)
            .bind(&task.notes)
            .bind(&flow.created_at)
            .bind(&flow.updated_at)
            .execute(&mut *tx)
            .await?;
        }
    }
    tx.commit().await?;
    Ok(())
}

pub async fn get_teamforge_onboarding_flows(
    pool: &SqlitePool,
    audience: Option<&str>,
) -> Result<Vec<TeamforgeOnboardingFlowDetail>, sqlx::Error> {
    let flow_rows = if let Some(audience) = audience {
        sqlx::query_as::<_, TeamforgeOnboardingFlowCache>(
            "SELECT * FROM teamforge_onboarding_flows
             WHERE audience = ?1
             ORDER BY starts_on DESC, flow_id COLLATE NOCASE",
        )
        .bind(audience)
        .fetch_all(pool)
        .await?
    } else {
        sqlx::query_as::<_, TeamforgeOnboardingFlowCache>(
            "SELECT * FROM teamforge_onboarding_flows
             ORDER BY starts_on DESC, flow_id COLLATE NOCASE",
        )
        .fetch_all(pool)
        .await?
    };

    if flow_rows.is_empty() {
        return Ok(Vec::new());
    }

    let task_rows = sqlx::query_as::<_, TeamforgeOnboardingTaskCache>(
        "SELECT * FROM teamforge_onboarding_tasks
         ORDER BY workspace_id, flow_id, sort_order, task_id COLLATE NOCASE",
    )
    .fetch_all(pool)
    .await?;

    let mut tasks_by_flow: HashMap<(String, String), Vec<TeamforgeOnboardingTaskView>> =
        HashMap::new();
    for task in task_rows {
        tasks_by_flow
            .entry((task.workspace_id.clone(), task.flow_id.clone()))
            .or_default()
            .push(map_teamforge_onboarding_task_cache(task));
    }

    Ok(flow_rows
        .into_iter()
        .map(|flow| TeamforgeOnboardingFlowDetail {
            workspace_id: flow.workspace_id.clone(),
            flow_id: flow.flow_id.clone(),
            audience: flow.audience,
            status: flow.status,
            owner: flow.owner,
            starts_on: flow.starts_on,
            subject_id: flow.subject_id,
            subject_name: flow.subject_name,
            primary_contact: flow.primary_contact,
            manager: flow.manager,
            department: flow.department,
            joined_on: flow.joined_on,
            source: flow.source,
            created_at: flow.created_at,
            updated_at: flow.updated_at,
            tasks: tasks_by_flow
                .remove(&(flow.workspace_id, flow.flow_id))
                .unwrap_or_default(),
        })
        .collect())
}

pub async fn replace_teamforge_active_project_issue_projection(
    pool: &SqlitePool,
    issues: &[TeamforgeActiveProjectIssueCache],
) -> Result<(), sqlx::Error> {
    let mut tx = pool.begin().await?;
    sqlx::query("DELETE FROM teamforge_active_project_issues")
        .execute(&mut *tx)
        .await?;

    for issue in issues {
        sqlx::query(
            "INSERT INTO teamforge_active_project_issues (
                id,
                workspace_id,
                project_id,
                project_name,
                client_id,
                client_name,
                repo,
                number,
                title,
                state,
                url,
                milestone_number,
                labels_json,
                assignees_json,
                priority,
                track,
                created_at,
                updated_at,
                closed_at,
                last_synced_at
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19, ?20)",
        )
        .bind(&issue.id)
        .bind(&issue.workspace_id)
        .bind(&issue.project_id)
        .bind(&issue.project_name)
        .bind(&issue.client_id)
        .bind(&issue.client_name)
        .bind(&issue.repo)
        .bind(issue.number)
        .bind(&issue.title)
        .bind(&issue.state)
        .bind(&issue.url)
        .bind(issue.milestone_number)
        .bind(&issue.labels_json)
        .bind(&issue.assignees_json)
        .bind(&issue.priority)
        .bind(&issue.track)
        .bind(&issue.created_at)
        .bind(&issue.updated_at)
        .bind(&issue.closed_at)
        .bind(&issue.last_synced_at)
        .execute(&mut *tx)
        .await?;
    }

    tx.commit().await?;
    Ok(())
}

pub async fn get_teamforge_active_project_issue_projection(
    pool: &SqlitePool,
) -> Result<Vec<TeamforgeActiveProjectIssueCache>, sqlx::Error> {
    sqlx::query_as::<_, TeamforgeActiveProjectIssueCache>(
        "SELECT * FROM teamforge_active_project_issues
         ORDER BY
           project_name COLLATE NOCASE,
           CASE WHEN LOWER(state) = 'open' THEN 0 ELSE 1 END,
           updated_at DESC,
           number DESC",
    )
    .fetch_all(pool)
    .await
}

// ─── GitHub Planning Cache ───────────────────────────────────────

pub async fn upsert_github_repo_config(
    pool: &SqlitePool,
    config: &GithubRepoConfig,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_repo_configs (
            repo,
            display_name,
            client_name,
            default_milestone_number,
            huly_project_id,
            clockify_project_id,
            enabled,
            created_at,
            updated_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(repo) DO UPDATE SET
          display_name = excluded.display_name,
          client_name = COALESCE(excluded.client_name, github_repo_configs.client_name),
          default_milestone_number = COALESCE(excluded.default_milestone_number, github_repo_configs.default_milestone_number),
          huly_project_id = COALESCE(excluded.huly_project_id, github_repo_configs.huly_project_id),
          clockify_project_id = COALESCE(excluded.clockify_project_id, github_repo_configs.clockify_project_id),
          enabled = excluded.enabled,
          updated_at = datetime('now')",
    )
    .bind(&config.repo)
    .bind(&config.display_name)
    .bind(&config.client_name)
    .bind(config.default_milestone_number)
    .bind(&config.huly_project_id)
    .bind(&config.clockify_project_id)
    .bind(config.enabled)
    .bind(&config.created_at)
    .bind(&config.updated_at)
    .execute(pool)
    .await?;
    Ok(())
}

#[cfg(test)]
pub async fn ensure_default_github_repo_config(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    let existing: Option<String> =
        sqlx::query_scalar("SELECT repo FROM github_repo_configs WHERE repo = ?1")
            .bind("Sheshiyer/parkarea-aleph")
            .fetch_optional(pool)
            .await?;
    if existing.is_some() {
        return Ok(());
    }

    let now = chrono::Utc::now().to_rfc3339();
    let config = GithubRepoConfig {
        repo: "Sheshiyer/parkarea-aleph".to_string(),
        display_name: "ParkArea Phase 2 - Germany Launch".to_string(),
        client_name: Some("ParkArea".to_string()),
        default_milestone_number: Some(1),
        huly_project_id: None,
        clockify_project_id: None,
        enabled: true,
        created_at: now.clone(),
        updated_at: now,
    };
    upsert_github_repo_config(pool, &config).await
}

pub async fn get_enabled_github_repo_configs(
    pool: &SqlitePool,
) -> Result<Vec<GithubRepoConfig>, sqlx::Error> {
    sqlx::query_as::<_, GithubRepoConfig>(
        "SELECT * FROM github_repo_configs WHERE enabled = 1 ORDER BY display_name, repo",
    )
    .fetch_all(pool)
    .await
}

pub async fn upsert_github_milestone(
    pool: &SqlitePool,
    milestone: &GithubMilestoneCache,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_milestones (
            repo,
            number,
            title,
            description,
            state,
            due_on,
            url,
            open_issues,
            closed_issues,
            updated_at,
            synced_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        ON CONFLICT(repo, number) DO UPDATE SET
          title = excluded.title,
          description = excluded.description,
          state = excluded.state,
          due_on = excluded.due_on,
          url = excluded.url,
          open_issues = excluded.open_issues,
          closed_issues = excluded.closed_issues,
          updated_at = excluded.updated_at,
          synced_at = excluded.synced_at",
    )
    .bind(&milestone.repo)
    .bind(milestone.number)
    .bind(&milestone.title)
    .bind(&milestone.description)
    .bind(&milestone.state)
    .bind(&milestone.due_on)
    .bind(&milestone.url)
    .bind(milestone.open_issues)
    .bind(milestone.closed_issues)
    .bind(&milestone.updated_at)
    .bind(&milestone.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_github_issue(
    pool: &SqlitePool,
    issue: &GithubIssueCache,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_issues (
            repo,
            number,
            node_id,
            title,
            body_excerpt,
            state,
            url,
            milestone_number,
            assignee_logins_json,
            labels_json,
            priority,
            track,
            created_at,
            updated_at,
            closed_at,
            synced_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16)
        ON CONFLICT(repo, number) DO UPDATE SET
          node_id = excluded.node_id,
          title = excluded.title,
          body_excerpt = excluded.body_excerpt,
          state = excluded.state,
          url = excluded.url,
          milestone_number = excluded.milestone_number,
          assignee_logins_json = excluded.assignee_logins_json,
          labels_json = excluded.labels_json,
          priority = excluded.priority,
          track = excluded.track,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          closed_at = excluded.closed_at,
          synced_at = excluded.synced_at",
    )
    .bind(&issue.repo)
    .bind(issue.number)
    .bind(&issue.node_id)
    .bind(&issue.title)
    .bind(&issue.body_excerpt)
    .bind(&issue.state)
    .bind(&issue.url)
    .bind(issue.milestone_number)
    .bind(&issue.assignee_logins_json)
    .bind(&issue.labels_json)
    .bind(&issue.priority)
    .bind(&issue.track)
    .bind(&issue.created_at)
    .bind(&issue.updated_at)
    .bind(&issue.closed_at)
    .bind(&issue.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_github_issue(
    pool: &SqlitePool,
    repo: &str,
    number: i64,
) -> Result<Option<GithubIssueCache>, sqlx::Error> {
    sqlx::query_as::<_, GithubIssueCache>(
        "SELECT * FROM github_issues WHERE repo = ?1 AND number = ?2",
    )
    .bind(repo)
    .bind(number)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_github_pull_request(
    pool: &SqlitePool,
    pr: &GithubPullRequestCache,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_pull_requests (
            repo,
            number,
            node_id,
            title,
            state,
            draft,
            url,
            head_ref,
            head_sha,
            base_ref,
            author_login,
            labels_json,
            assignee_logins_json,
            created_at,
            updated_at,
            closed_at,
            merged_at,
            synced_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18)
        ON CONFLICT(repo, number) DO UPDATE SET
          node_id = excluded.node_id,
          title = excluded.title,
          state = excluded.state,
          draft = excluded.draft,
          url = excluded.url,
          head_ref = excluded.head_ref,
          head_sha = excluded.head_sha,
          base_ref = excluded.base_ref,
          author_login = excluded.author_login,
          labels_json = excluded.labels_json,
          assignee_logins_json = excluded.assignee_logins_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at,
          closed_at = excluded.closed_at,
          merged_at = excluded.merged_at,
          synced_at = excluded.synced_at",
    )
    .bind(&pr.repo)
    .bind(pr.number)
    .bind(&pr.node_id)
    .bind(&pr.title)
    .bind(&pr.state)
    .bind(pr.draft)
    .bind(&pr.url)
    .bind(&pr.head_ref)
    .bind(&pr.head_sha)
    .bind(&pr.base_ref)
    .bind(&pr.author_login)
    .bind(&pr.labels_json)
    .bind(&pr.assignee_logins_json)
    .bind(&pr.created_at)
    .bind(&pr.updated_at)
    .bind(&pr.closed_at)
    .bind(&pr.merged_at)
    .bind(&pr.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_github_pull_request(
    pool: &SqlitePool,
    repo: &str,
    number: i64,
) -> Result<Option<GithubPullRequestCache>, sqlx::Error> {
    sqlx::query_as::<_, GithubPullRequestCache>(
        "SELECT * FROM github_pull_requests WHERE repo = ?1 AND number = ?2",
    )
    .bind(repo)
    .bind(number)
    .fetch_optional(pool)
    .await
}

pub async fn upsert_github_branch(
    pool: &SqlitePool,
    branch: &GithubBranchCache,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_branches (
            repo,
            name,
            commit_sha,
            protected,
            synced_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(repo, name) DO UPDATE SET
          commit_sha = excluded.commit_sha,
          protected = excluded.protected,
          synced_at = excluded.synced_at",
    )
    .bind(&branch.repo)
    .bind(&branch.name)
    .bind(&branch.commit_sha)
    .bind(branch.protected)
    .bind(&branch.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_github_check_run(
    pool: &SqlitePool,
    check: &GithubCheckRunCache,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO github_check_runs (
            repo,
            check_run_id,
            branch_name,
            head_sha,
            name,
            status,
            conclusion,
            url,
            details_url,
            app_slug,
            started_at,
            completed_at,
            synced_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
        ON CONFLICT(repo, check_run_id) DO UPDATE SET
          branch_name = excluded.branch_name,
          head_sha = excluded.head_sha,
          name = excluded.name,
          status = excluded.status,
          conclusion = excluded.conclusion,
          url = excluded.url,
          details_url = excluded.details_url,
          app_slug = excluded.app_slug,
          started_at = excluded.started_at,
          completed_at = excluded.completed_at,
          synced_at = excluded.synced_at",
    )
    .bind(&check.repo)
    .bind(check.check_run_id)
    .bind(&check.branch_name)
    .bind(&check.head_sha)
    .bind(&check.name)
    .bind(&check.status)
    .bind(&check.conclusion)
    .bind(&check.url)
    .bind(&check.details_url)
    .bind(&check.app_slug)
    .bind(&check.started_at)
    .bind(&check.completed_at)
    .bind(&check.synced_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_github_issues_for_project(
    pool: &SqlitePool,
    repo: &str,
    milestone_number: Option<i64>,
) -> Result<Vec<GithubIssueCache>, sqlx::Error> {
    if let Some(number) = milestone_number {
        sqlx::query_as::<_, GithubIssueCache>(
            "SELECT * FROM github_issues
             WHERE repo = ?1 AND milestone_number = ?2
             ORDER BY updated_at DESC, number DESC",
        )
        .bind(repo)
        .bind(number)
        .fetch_all(pool)
        .await
    } else {
        sqlx::query_as::<_, GithubIssueCache>(
            "SELECT * FROM github_issues
             WHERE repo = ?1 AND milestone_number IS NULL
             ORDER BY updated_at DESC, number DESC",
        )
        .bind(repo)
        .fetch_all(pool)
        .await
    }
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

pub async fn delete_setting(pool: &SqlitePool, key: &str) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM settings WHERE key = ?1")
        .bind(key)
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

// ─── Slack Message Activity ─────────────────────────────────────

pub async fn upsert_slack_message_activity(
    pool: &SqlitePool,
    activity: &SlackMessageActivity,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO slack_message_activity (
            message_key,
            slack_channel_id,
            slack_channel_name,
            slack_user_id,
            employee_id,
            message_ts,
            message_ts_ms,
            content_preview,
            detected_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
        ON CONFLICT(message_key) DO UPDATE SET
          slack_channel_id = excluded.slack_channel_id,
          slack_channel_name = excluded.slack_channel_name,
          slack_user_id = excluded.slack_user_id,
          employee_id = excluded.employee_id,
          message_ts = excluded.message_ts,
          message_ts_ms = excluded.message_ts_ms,
          content_preview = excluded.content_preview,
          detected_at = excluded.detected_at",
    )
    .bind(&activity.message_key)
    .bind(&activity.slack_channel_id)
    .bind(&activity.slack_channel_name)
    .bind(&activity.slack_user_id)
    .bind(&activity.employee_id)
    .bind(&activity.message_ts)
    .bind(activity.message_ts_ms)
    .bind(&activity.content_preview)
    .bind(&activity.detected_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_slack_message_activity_since(
    pool: &SqlitePool,
    since_ts_ms: i64,
) -> Result<Vec<SlackMessageActivity>, sqlx::Error> {
    sqlx::query_as::<_, SlackMessageActivity>(
        "SELECT *
         FROM slack_message_activity
         WHERE message_ts_ms IS NOT NULL AND message_ts_ms >= ?1
         ORDER BY message_ts_ms DESC",
    )
    .bind(since_ts_ms)
    .fetch_all(pool)
    .await
}

pub async fn get_slack_message_activity_for_employee_since(
    pool: &SqlitePool,
    employee_id: &str,
    since_ts_ms: i64,
) -> Result<Vec<SlackMessageActivity>, sqlx::Error> {
    sqlx::query_as::<_, SlackMessageActivity>(
        "SELECT *
         FROM slack_message_activity
         WHERE employee_id = ?1
           AND message_ts_ms IS NOT NULL
           AND message_ts_ms >= ?2
         ORDER BY message_ts_ms DESC",
    )
    .bind(employee_id)
    .bind(since_ts_ms)
    .fetch_all(pool)
    .await
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

// ─── Canonical Ops Events ───────────────────────────────────────

pub async fn upsert_ops_event(pool: &SqlitePool, event: &OpsEvent) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO ops_events (
            sync_key,
            schema_version,
            source,
            event_type,
            entity_type,
            entity_id,
            actor_employee_id,
            actor_clockify_user_id,
            actor_huly_person_id,
            actor_slack_user_id,
            occurred_at,
            severity,
            payload_json,
            detected_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
        ON CONFLICT(sync_key) DO UPDATE SET
          schema_version = excluded.schema_version,
          source = excluded.source,
          event_type = excluded.event_type,
          entity_type = excluded.entity_type,
          entity_id = excluded.entity_id,
          actor_employee_id = excluded.actor_employee_id,
          actor_clockify_user_id = excluded.actor_clockify_user_id,
          actor_huly_person_id = excluded.actor_huly_person_id,
          actor_slack_user_id = excluded.actor_slack_user_id,
          occurred_at = excluded.occurred_at,
          severity = excluded.severity,
          payload_json = excluded.payload_json,
          detected_at = excluded.detected_at",
    )
    .bind(&event.sync_key)
    .bind(&event.schema_version)
    .bind(&event.source)
    .bind(&event.event_type)
    .bind(&event.entity_type)
    .bind(&event.entity_id)
    .bind(&event.actor_employee_id)
    .bind(&event.actor_clockify_user_id)
    .bind(&event.actor_huly_person_id)
    .bind(&event.actor_slack_user_id)
    .bind(&event.occurred_at)
    .bind(&event.severity)
    .bind(&event.payload_json)
    .bind(&event.detected_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn upsert_agent_feed_item(
    pool: &SqlitePool,
    item: &AgentFeedItem,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO agent_feed (
            sync_key,
            schema_version,
            source,
            event_type,
            entity_type,
            entity_id,
            occurred_at,
            detected_at,
            severity,
            owner_hint,
            actor_employee_id,
            actor_clockify_user_id,
            actor_huly_person_id,
            actor_slack_user_id,
            payload_json,
            metadata_json,
            refreshed_at
        )
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)
        ON CONFLICT(sync_key) DO UPDATE SET
          schema_version = excluded.schema_version,
          source = excluded.source,
          event_type = excluded.event_type,
          entity_type = excluded.entity_type,
          entity_id = excluded.entity_id,
          occurred_at = excluded.occurred_at,
          detected_at = excluded.detected_at,
          severity = excluded.severity,
          owner_hint = excluded.owner_hint,
          actor_employee_id = excluded.actor_employee_id,
          actor_clockify_user_id = excluded.actor_clockify_user_id,
          actor_huly_person_id = excluded.actor_huly_person_id,
          actor_slack_user_id = excluded.actor_slack_user_id,
          payload_json = excluded.payload_json,
          metadata_json = excluded.metadata_json,
          refreshed_at = excluded.refreshed_at",
    )
    .bind(&item.sync_key)
    .bind(&item.schema_version)
    .bind(&item.source)
    .bind(&item.event_type)
    .bind(&item.entity_type)
    .bind(&item.entity_id)
    .bind(&item.occurred_at)
    .bind(&item.detected_at)
    .bind(&item.severity)
    .bind(&item.owner_hint)
    .bind(&item.actor_employee_id)
    .bind(&item.actor_clockify_user_id)
    .bind(&item.actor_huly_person_id)
    .bind(&item.actor_slack_user_id)
    .bind(&item.payload_json)
    .bind(&item.metadata_json)
    .bind(&item.refreshed_at)
    .execute(pool)
    .await?;
    Ok(())
}

pub async fn get_agent_feed(
    pool: &SqlitePool,
    limit: i64,
) -> Result<Vec<AgentFeedItem>, sqlx::Error> {
    sqlx::query_as::<_, AgentFeedItem>(
        "SELECT *
         FROM agent_feed
         ORDER BY occurred_at DESC, detected_at DESC
         LIMIT ?1",
    )
    .bind(limit.max(1))
    .fetch_all(pool)
    .await
}

pub async fn get_agent_feed_export_rows(
    pool: &SqlitePool,
    since_timestamp: Option<&str>,
    since_cursor: Option<(&str, &str)>,
    limit: i64,
) -> Result<Vec<AgentFeedItem>, sqlx::Error> {
    let row_limit = limit.max(1);
    match (since_timestamp, since_cursor) {
        (_, Some((detected_at, sync_key))) => {
            sqlx::query_as::<_, AgentFeedItem>(
                "SELECT *
                 FROM agent_feed
                 WHERE (detected_at > ?1)
                    OR (detected_at = ?1 AND sync_key > ?2)
                 ORDER BY detected_at ASC, sync_key ASC
                 LIMIT ?3",
            )
            .bind(detected_at)
            .bind(sync_key)
            .bind(row_limit)
            .fetch_all(pool)
            .await
        }
        (Some(timestamp), None) => {
            sqlx::query_as::<_, AgentFeedItem>(
                "SELECT *
                 FROM agent_feed
                 WHERE detected_at >= ?1
                 ORDER BY detected_at ASC, sync_key ASC
                 LIMIT ?2",
            )
            .bind(timestamp)
            .bind(row_limit)
            .fetch_all(pool)
            .await
        }
        (None, None) => {
            sqlx::query_as::<_, AgentFeedItem>(
                "SELECT *
                 FROM agent_feed
                 ORDER BY detected_at ASC, sync_key ASC
                 LIMIT ?1",
            )
            .bind(row_limit)
            .fetch_all(pool)
            .await
        }
    }
}

pub async fn refresh_agent_feed_projection(pool: &SqlitePool) -> Result<u32, sqlx::Error> {
    let state = get_sync_state(pool, "agent_feed", "projection").await?;
    let now = chrono::Utc::now();
    let lookback_days = chrono::Duration::days(7);

    let since = state
        .as_ref()
        .and_then(|existing| parse_sync_timestamp(&existing.last_sync_at))
        .map(|timestamp| timestamp - lookback_days)
        .unwrap_or_else(|| now - chrono::Duration::days(90))
        .to_rfc3339();

    let ops_events = sqlx::query_as::<_, OpsEvent>(
        "SELECT *
         FROM ops_events
         WHERE detected_at >= ?1
         ORDER BY detected_at ASC, occurred_at ASC, sync_key ASC",
    )
    .bind(&since)
    .fetch_all(pool)
    .await?;

    let employee_name_by_id: HashMap<String, String> = get_employees(pool)
        .await?
        .into_iter()
        .map(|employee| (employee.id, employee.name))
        .collect();

    let refreshed_at = now.to_rfc3339();
    let mut upserted = 0u32;
    for event in ops_events {
        let owner_hint = event
            .actor_employee_id
            .as_ref()
            .and_then(|employee_id| employee_name_by_id.get(employee_id).cloned())
            .or_else(|| {
                event
                    .actor_slack_user_id
                    .clone()
                    .map(|value| format!("slack:{value}"))
            })
            .or_else(|| {
                event
                    .actor_huly_person_id
                    .clone()
                    .map(|value| format!("huly:{value}"))
            })
            .or_else(|| {
                event
                    .actor_clockify_user_id
                    .clone()
                    .map(|value| format!("clockify:{value}"))
            });

        let metadata_json = serde_json::json!({
            "projection": "agent_feed/v1",
            "owner_hint_source": if event.actor_employee_id.is_some() {
                "employee_name"
            } else if event.actor_slack_user_id.is_some() {
                "slack_user_id"
            } else if event.actor_huly_person_id.is_some() {
                "huly_person_id"
            } else if event.actor_clockify_user_id.is_some() {
                "clockify_user_id"
            } else {
                "unknown"
            },
        })
        .to_string();

        let row = AgentFeedItem {
            id: None,
            sync_key: event.sync_key.clone(),
            schema_version: event.schema_version.clone(),
            source: event.source.clone(),
            event_type: event.event_type.clone(),
            entity_type: event.entity_type.clone(),
            entity_id: event.entity_id.clone(),
            occurred_at: event.occurred_at.clone(),
            detected_at: event.detected_at.clone(),
            severity: event.severity.clone(),
            owner_hint,
            actor_employee_id: event.actor_employee_id.clone(),
            actor_clockify_user_id: event.actor_clockify_user_id.clone(),
            actor_huly_person_id: event.actor_huly_person_id.clone(),
            actor_slack_user_id: event.actor_slack_user_id.clone(),
            payload_json: event.payload_json.clone(),
            metadata_json: Some(metadata_json),
            refreshed_at: refreshed_at.clone(),
        };
        upsert_agent_feed_item(pool, &row).await?;
        upserted += 1;
    }

    let projection_state = SyncState {
        source: "agent_feed".to_string(),
        entity: "projection".to_string(),
        last_sync_at: now.format("%Y-%m-%dT%H:%M:%S").to_string(),
        last_cursor: Some(
            serde_json::json!({
                "strategy": "incremental-lookback",
                "lookback_days": 7,
                "window_start": since,
                "upserted": upserted,
            })
            .to_string(),
        ),
    };
    set_sync_state(pool, &projection_state).await?;

    Ok(upserted)
}

fn parse_sync_timestamp(value: &str) -> Option<chrono::DateTime<chrono::Utc>> {
    chrono::DateTime::parse_from_rfc3339(value)
        .map(|timestamp| timestamp.with_timezone(&chrono::Utc))
        .ok()
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S")
                .ok()
                .map(|value| value.and_utc())
        })
        .or_else(|| {
            chrono::NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S")
                .ok()
                .map(|value| value.and_utc())
        })
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

    #[tokio::test]
    async fn upsert_ops_event_is_idempotent_by_sync_key() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let event = OpsEvent {
            id: None,
            sync_key: "ops:v1:clockify:clockify.time_entry.logged:clockify_time_entry:te_1:na:clockify_1:na:na:2026_04_12t16_00_00z".to_string(),
            schema_version: "ops_event/v1".to_string(),
            source: "clockify".to_string(),
            event_type: "clockify.time_entry.logged".to_string(),
            entity_type: "clockify_time_entry".to_string(),
            entity_id: "te_1".to_string(),
            actor_employee_id: None,
            actor_clockify_user_id: Some("clockify_1".to_string()),
            actor_huly_person_id: None,
            actor_slack_user_id: None,
            occurred_at: "2026-04-12T16:00:00Z".to_string(),
            severity: "info".to_string(),
            payload_json: r#"{"kind":"time_entry","id":"te_1"}"#.to_string(),
            detected_at: "2026-04-12T16:00:01Z".to_string(),
        };

        upsert_ops_event(&pool, &event)
            .await
            .expect("first upsert ops event");
        upsert_ops_event(&pool, &event)
            .await
            .expect("second upsert ops event");

        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM ops_events WHERE sync_key = ?1")
            .bind(&event.sync_key)
            .fetch_one(&pool)
            .await
            .expect("count ops events");
        assert_eq!(count, 1);

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn github_issue_upsert_is_idempotent_and_updates_state() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        ensure_default_github_repo_config(&pool)
            .await
            .expect("seed default github config");

        let mut issue = GithubIssueCache {
            repo: "Sheshiyer/parkarea-aleph".to_string(),
            number: 7,
            node_id: Some("node-7".to_string()),
            title: "Original issue".to_string(),
            body_excerpt: Some("Original body".to_string()),
            state: "open".to_string(),
            url: "https://github.com/Sheshiyer/parkarea-aleph/issues/7".to_string(),
            milestone_number: Some(1),
            assignee_logins_json: "[]".to_string(),
            labels_json: r#"["priority:p1","track:backend-core"]"#.to_string(),
            priority: Some("p1".to_string()),
            track: Some("backend-core".to_string()),
            created_at: Some("2026-04-16T00:00:00Z".to_string()),
            updated_at: Some("2026-04-16T00:00:00Z".to_string()),
            closed_at: None,
            synced_at: "2026-04-16T00:01:00Z".to_string(),
        };

        upsert_github_issue(&pool, &issue)
            .await
            .expect("first github issue upsert");
        issue.title = "Updated issue".to_string();
        issue.state = "closed".to_string();
        issue.closed_at = Some("2026-04-16T00:02:00Z".to_string());
        upsert_github_issue(&pool, &issue)
            .await
            .expect("second github issue upsert");

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM github_issues WHERE repo = ?1 AND number = ?2",
        )
        .bind(&issue.repo)
        .bind(issue.number)
        .fetch_one(&pool)
        .await
        .expect("count github issues");
        assert_eq!(count, 1);

        let loaded = get_github_issue(&pool, &issue.repo, issue.number)
            .await
            .expect("load github issue")
            .expect("github issue exists");
        assert_eq!(loaded.title, "Updated issue");
        assert_eq!(loaded.state, "closed");
        assert_eq!(loaded.closed_at.as_deref(), Some("2026-04-16T00:02:00Z"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn upsert_slack_message_activity_is_idempotent_by_message_key() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let employee = Employee {
            id: "emp-slack-1".to_string(),
            clockify_user_id: "clockify-slack-1".to_string(),
            huly_person_id: Some("person-slack-1".to_string()),
            name: "Slack Person".to_string(),
            email: "slack-person@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        };
        upsert_employee(&pool, &employee)
            .await
            .expect("upsert employee");

        let activity = SlackMessageActivity {
            id: None,
            message_key: "slack:C123:1744470000.123456".to_string(),
            slack_channel_id: "C123".to_string(),
            slack_channel_name: Some("daily-standup".to_string()),
            slack_user_id: Some("U123".to_string()),
            employee_id: Some(employee.id.clone()),
            message_ts: "1744470000.123456".to_string(),
            message_ts_ms: Some(1_744_470_000_000),
            content_preview: Some("Daily standup update".to_string()),
            detected_at: "2026-04-12T10:00:00Z".to_string(),
        };

        upsert_slack_message_activity(&pool, &activity)
            .await
            .expect("first slack upsert");
        upsert_slack_message_activity(&pool, &activity)
            .await
            .expect("second slack upsert");

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM slack_message_activity WHERE message_key = ?1",
        )
        .bind(&activity.message_key)
        .fetch_one(&pool)
        .await
        .expect("count slack rows");
        assert_eq!(count, 1);

        let rows = get_slack_message_activity_since(&pool, 1_744_469_000_000)
            .await
            .expect("load persisted slack activity");
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].employee_id.as_deref(), Some(employee.id.as_str()));
        assert_eq!(rows[0].slack_channel_name.as_deref(), Some("daily-standup"));

        let employee_rows =
            get_slack_message_activity_for_employee_since(&pool, &employee.id, 1_744_469_000_000)
                .await
                .expect("load employee slack activity");
        assert_eq!(employee_rows.len(), 1);
        assert_eq!(
            employee_rows[0].slack_channel_name.as_deref(),
            Some("daily-standup")
        );

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn identity_map_seeding_and_orphan_tracking_round_trip() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let employee = Employee {
            id: "emp-identity-1".to_string(),
            clockify_user_id: "clockify-identity-1".to_string(),
            huly_person_id: Some("person-identity-1".to_string()),
            name: "Identity Person".to_string(),
            email: "identity.person@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        };
        upsert_employee(&pool, &employee)
            .await
            .expect("upsert identity employee");

        seed_identity_map_from_employees(&pool)
            .await
            .expect("seed identity map");

        let clockify = resolve_employee_id_by_identity(&pool, "clockify", "clockify-identity-1")
            .await
            .expect("resolve clockify identity");
        let huly = resolve_employee_id_by_identity(&pool, "huly", "person-identity-1")
            .await
            .expect("resolve huly identity");
        assert_eq!(clockify.as_deref(), Some(employee.id.as_str()));
        assert_eq!(huly.as_deref(), Some(employee.id.as_str()));

        let orphan = IdentityMapEntry {
            id: None,
            source: "slack".to_string(),
            external_id: "U_ORPHAN_1".to_string(),
            employee_id: None,
            confidence: 0.0,
            resolution_status: "orphaned".to_string(),
            match_method: Some("test.orphan".to_string()),
            is_override: false,
            override_by: None,
            override_reason: None,
            override_at: None,
            first_seen_at: "2026-04-12T10:00:00Z".to_string(),
            last_seen_at: "2026-04-12T10:00:00Z".to_string(),
            created_at: "2026-04-12T10:00:00Z".to_string(),
            updated_at: "2026-04-12T10:00:00Z".to_string(),
        };
        upsert_identity_map_entry(&pool, &orphan)
            .await
            .expect("upsert orphan identity");

        let unresolved = resolve_employee_id_by_identity(&pool, "slack", "U_ORPHAN_1")
            .await
            .expect("resolve orphan identity");
        assert!(unresolved.is_none());

        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM identity_map WHERE source = 'slack' AND resolution_status = 'orphaned'",
        )
        .fetch_one(&pool)
        .await
        .expect("count orphan rows");
        assert_eq!(count, 1);

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn identity_override_rows_are_not_replaced_by_non_override_upserts() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let employee_a = Employee {
            id: "emp-override-a".to_string(),
            clockify_user_id: "clockify-override-a".to_string(),
            huly_person_id: Some("person-override-a".to_string()),
            name: "Override A".to_string(),
            email: "override-a@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        };
        let employee_b = Employee {
            id: "emp-override-b".to_string(),
            clockify_user_id: "clockify-override-b".to_string(),
            huly_person_id: Some("person-override-b".to_string()),
            name: "Override B".to_string(),
            email: "override-b@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        };
        upsert_employee(&pool, &employee_a)
            .await
            .expect("upsert employee a");
        upsert_employee(&pool, &employee_b)
            .await
            .expect("upsert employee b");

        let manual_override = IdentityMapEntry {
            id: None,
            source: "slack".to_string(),
            external_id: "U_OVERRIDE_1".to_string(),
            employee_id: Some(employee_a.id.clone()),
            confidence: 1.0,
            resolution_status: "linked".to_string(),
            match_method: Some("manual.override".to_string()),
            is_override: true,
            override_by: Some("ops-admin".to_string()),
            override_reason: Some("authoritative mapping".to_string()),
            override_at: Some("2026-04-12T10:00:00Z".to_string()),
            first_seen_at: "2026-04-12T10:00:00Z".to_string(),
            last_seen_at: "2026-04-12T10:00:00Z".to_string(),
            created_at: "2026-04-12T10:00:00Z".to_string(),
            updated_at: "2026-04-12T10:00:00Z".to_string(),
        };
        upsert_identity_map_entry(&pool, &manual_override)
            .await
            .expect("insert override identity");

        let heuristic_update = IdentityMapEntry {
            id: None,
            source: "slack".to_string(),
            external_id: "U_OVERRIDE_1".to_string(),
            employee_id: Some(employee_b.id.clone()),
            confidence: 0.6,
            resolution_status: "linked".to_string(),
            match_method: Some("heuristic.email".to_string()),
            is_override: false,
            override_by: None,
            override_reason: None,
            override_at: None,
            first_seen_at: "2026-04-12T11:00:00Z".to_string(),
            last_seen_at: "2026-04-12T11:00:00Z".to_string(),
            created_at: "2026-04-12T11:00:00Z".to_string(),
            updated_at: "2026-04-12T11:00:00Z".to_string(),
        };
        upsert_identity_map_entry(&pool, &heuristic_update)
            .await
            .expect("apply heuristic update");

        let resolved = resolve_employee_id_by_identity(&pool, "slack", "U_OVERRIDE_1")
            .await
            .expect("resolve identity");
        assert_eq!(resolved.as_deref(), Some(employee_a.id.as_str()));

        let row: IdentityMapEntry = sqlx::query_as(
            "SELECT * FROM identity_map WHERE source = 'slack' AND external_id = 'U_OVERRIDE_1'",
        )
        .fetch_one(&pool)
        .await
        .expect("load identity row");
        assert_eq!(row.employee_id.as_deref(), Some(employee_a.id.as_str()));
        assert!(row.is_override);
        assert_eq!(row.override_by.as_deref(), Some("ops-admin"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn agent_feed_projection_materializes_ops_events_incrementally() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let employee = Employee {
            id: "emp-feed-1".to_string(),
            clockify_user_id: "clockify-feed-1".to_string(),
            huly_person_id: Some("person-feed-1".to_string()),
            name: "Feed Owner".to_string(),
            email: "feed-owner@example.com".to_string(),
            avatar_url: None,
            monthly_quota_hours: 160.0,
            is_active: true,
            created_at: "2026-04-12T00:00:00Z".to_string(),
            updated_at: "2026-04-12T00:00:00Z".to_string(),
        };
        upsert_employee(&pool, &employee)
            .await
            .expect("upsert feed employee");

        let event = OpsEvent {
            id: None,
            sync_key: "ops:v1:slack:slack.message.posted:slack_message:msg_1:emp_feed_1:na:na:u_feed_1:2026_04_12t10_00_00z".to_string(),
            schema_version: "ops_event/v1".to_string(),
            source: "slack".to_string(),
            event_type: "slack.message.posted".to_string(),
            entity_type: "slack_message".to_string(),
            entity_id: "msg_1".to_string(),
            actor_employee_id: Some(employee.id.clone()),
            actor_clockify_user_id: None,
            actor_huly_person_id: None,
            actor_slack_user_id: Some("U_FEED_1".to_string()),
            occurred_at: "2026-04-12T10:00:00Z".to_string(),
            severity: "info".to_string(),
            payload_json: r#"{"channel":"C123","text":"daily update"}"#.to_string(),
            detected_at: "2026-04-12T10:00:05Z".to_string(),
        };
        upsert_ops_event(&pool, &event)
            .await
            .expect("upsert source event");

        let upserted = refresh_agent_feed_projection(&pool)
            .await
            .expect("refresh agent feed");
        assert!(upserted >= 1);

        let feed_rows = get_agent_feed(&pool, 10).await.expect("query agent feed");
        assert_eq!(feed_rows.len(), 1);
        assert_eq!(feed_rows[0].sync_key, event.sync_key);
        assert_eq!(feed_rows[0].owner_hint.as_deref(), Some("Feed Owner"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn github_pr_branch_and_check_caches_are_idempotent() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let pr = GithubPullRequestCache {
            repo: "Sheshiyer/parkarea-aleph".to_string(),
            number: 7,
            node_id: Some("PR_kwDO123".to_string()),
            title: "Add agent workflow".to_string(),
            state: "open".to_string(),
            draft: false,
            url: "https://github.com/Sheshiyer/parkarea-aleph/pull/7".to_string(),
            head_ref: "codex/agent-workflow".to_string(),
            head_sha: "abc123".to_string(),
            base_ref: "main".to_string(),
            author_login: Some("octocat".to_string()),
            labels_json: "[]".to_string(),
            assignee_logins_json: "[]".to_string(),
            created_at: Some("2026-04-16T00:00:00Z".to_string()),
            updated_at: Some("2026-04-16T01:00:00Z".to_string()),
            closed_at: None,
            merged_at: None,
            synced_at: "2026-04-16T02:00:00Z".to_string(),
        };
        upsert_github_pull_request(&pool, &pr)
            .await
            .expect("upsert github pr");
        upsert_github_pull_request(&pool, &pr)
            .await
            .expect("upsert github pr again");

        let branch = GithubBranchCache {
            repo: pr.repo.clone(),
            name: pr.head_ref.clone(),
            commit_sha: pr.head_sha.clone(),
            protected: false,
            synced_at: pr.synced_at.clone(),
        };
        upsert_github_branch(&pool, &branch)
            .await
            .expect("upsert github branch");
        upsert_github_branch(&pool, &branch)
            .await
            .expect("upsert github branch again");

        let check = GithubCheckRunCache {
            repo: pr.repo.clone(),
            check_run_id: 42,
            branch_name: Some(pr.head_ref.clone()),
            head_sha: pr.head_sha.clone(),
            name: "ci".to_string(),
            status: "completed".to_string(),
            conclusion: Some("success".to_string()),
            url: Some("https://github.com/checks/42".to_string()),
            details_url: None,
            app_slug: Some("github-actions".to_string()),
            started_at: Some("2026-04-16T01:00:00Z".to_string()),
            completed_at: Some("2026-04-16T01:05:00Z".to_string()),
            synced_at: pr.synced_at.clone(),
        };
        upsert_github_check_run(&pool, &check)
            .await
            .expect("upsert github check");
        upsert_github_check_run(&pool, &check)
            .await
            .expect("upsert github check again");

        let pr_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM github_pull_requests")
            .fetch_one(&pool)
            .await
            .expect("count prs");
        let branch_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM github_branches")
            .fetch_one(&pool)
            .await
            .expect("count branches");
        let check_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM github_check_runs")
            .fetch_one(&pool)
            .await
            .expect("count check runs");

        assert_eq!(pr_count, 1);
        assert_eq!(branch_count, 1);
        assert_eq!(check_count, 1);

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn teamforge_project_graph_round_trips_with_links_and_artifacts() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let graph = TeamforgeProjectGraph {
            project: TeamforgeProject {
                id: "tf-project-parkarea".to_string(),
                slug: "parkarea-germany-launch".to_string(),
                name: "ParkArea Phase 2 - Germany Launch".to_string(),
                portfolio_name: Some("Thoughtseed".to_string()),
                client_id: Some("parkarea".to_string()),
                client_name: Some("ParkArea".to_string()),
                clockify_project_id: Some("clockify-parkarea".to_string()),
                project_type: Some("client-delivery".to_string()),
                status: "active".to_string(),
                sync_mode: "bidirectional".to_string(),
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            },
            github_repos: vec![
                TeamforgeProjectGithubRepoLink {
                    project_id: "tf-project-parkarea".to_string(),
                    repo: "Sheshiyer/parkarea-aleph".to_string(),
                    display_name: Some("ParkArea Core Repo".to_string()),
                    is_primary: true,
                    sync_issues: true,
                    sync_milestones: true,
                    created_at: "2026-04-17T00:00:00Z".to_string(),
                    updated_at: "2026-04-17T00:00:00Z".to_string(),
                },
                TeamforgeProjectGithubRepoLink {
                    project_id: "tf-project-parkarea".to_string(),
                    repo: "Thoughtseed/parkarea-legal".to_string(),
                    display_name: Some("ParkArea Legal Pack".to_string()),
                    is_primary: false,
                    sync_issues: false,
                    sync_milestones: false,
                    created_at: "2026-04-17T00:00:00Z".to_string(),
                    updated_at: "2026-04-17T00:00:00Z".to_string(),
                },
            ],
            huly_links: vec![TeamforgeProjectHulyLink {
                project_id: "tf-project-parkarea".to_string(),
                huly_project_id: "huly-project-parkarea".to_string(),
                sync_issues: true,
                sync_milestones: true,
                sync_components: true,
                sync_templates: true,
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            }],
            artifacts: vec![
                TeamforgeProjectArtifact {
                    id: "artifact-prd".to_string(),
                    project_id: "tf-project-parkarea".to_string(),
                    artifact_type: "prd".to_string(),
                    title: "Germany Launch PRD".to_string(),
                    url: "https://docs.example.com/parkarea/prd".to_string(),
                    source: "docs".to_string(),
                    external_id: None,
                    is_primary: true,
                    created_at: "2026-04-17T00:00:00Z".to_string(),
                    updated_at: "2026-04-17T00:00:00Z".to_string(),
                },
                TeamforgeProjectArtifact {
                    id: "artifact-contract".to_string(),
                    project_id: "tf-project-parkarea".to_string(),
                    artifact_type: "contract".to_string(),
                    title: "Master Services Agreement".to_string(),
                    url: "https://docs.example.com/parkarea/msa".to_string(),
                    source: "legal".to_string(),
                    external_id: Some("msa-parkarea-2026".to_string()),
                    is_primary: false,
                    created_at: "2026-04-17T00:00:00Z".to_string(),
                    updated_at: "2026-04-17T00:00:00Z".to_string(),
                },
            ],
            client_profile: None,
        };

        replace_teamforge_project_graph(&pool, &graph)
            .await
            .expect("save teamforge project graph");

        let loaded = get_teamforge_project_graphs(&pool)
            .await
            .expect("load teamforge project graphs");

        assert_eq!(loaded.len(), 1);
        let graph = &loaded[0];
        assert_eq!(graph.project.slug, "parkarea-germany-launch");
        assert_eq!(graph.github_repos.len(), 2);
        assert_eq!(graph.huly_links.len(), 1);
        assert_eq!(graph.artifacts.len(), 2);
        assert_eq!(graph.github_repos[0].repo, "Sheshiyer/parkarea-aleph");
        assert_eq!(graph.huly_links[0].huly_project_id, "huly-project-parkarea");
        assert!(graph
            .artifacts
            .iter()
            .any(|artifact| artifact.artifact_type == "prd"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn replacing_teamforge_project_graph_removes_stale_links() {
        let dir = unique_test_dir();
        let pool = init_db(&dir).await.expect("init db");

        let mut graph = TeamforgeProjectGraph {
            project: TeamforgeProject {
                id: "tf-project-internal-ops".to_string(),
                slug: "internal-ops".to_string(),
                name: "Internal Ops".to_string(),
                portfolio_name: Some("Thoughtseed".to_string()),
                client_id: None,
                client_name: None,
                clockify_project_id: None,
                project_type: Some("internal".to_string()),
                status: "active".to_string(),
                sync_mode: "bidirectional".to_string(),
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            },
            github_repos: vec![TeamforgeProjectGithubRepoLink {
                project_id: "tf-project-internal-ops".to_string(),
                repo: "Thoughtseed/internal-ops".to_string(),
                display_name: None,
                is_primary: true,
                sync_issues: true,
                sync_milestones: true,
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            }],
            huly_links: vec![TeamforgeProjectHulyLink {
                project_id: "tf-project-internal-ops".to_string(),
                huly_project_id: "huly-ops".to_string(),
                sync_issues: true,
                sync_milestones: true,
                sync_components: true,
                sync_templates: false,
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            }],
            artifacts: vec![TeamforgeProjectArtifact {
                id: "artifact-ops-playbook".to_string(),
                project_id: "tf-project-internal-ops".to_string(),
                artifact_type: "process".to_string(),
                title: "Ops Playbook".to_string(),
                url: "https://docs.example.com/internal/ops-playbook".to_string(),
                source: "docs".to_string(),
                external_id: None,
                is_primary: true,
                created_at: "2026-04-17T00:00:00Z".to_string(),
                updated_at: "2026-04-17T00:00:00Z".to_string(),
            }],
            client_profile: None,
        };

        replace_teamforge_project_graph(&pool, &graph)
            .await
            .expect("first save teamforge graph");

        graph.github_repos.clear();
        graph.huly_links.clear();
        graph.artifacts.clear();
        graph.project.name = "Internal Ops Platform".to_string();

        replace_teamforge_project_graph(&pool, &graph)
            .await
            .expect("replace teamforge graph");

        let loaded = get_teamforge_project_graphs(&pool)
            .await
            .expect("load replaced graphs");

        assert_eq!(loaded.len(), 1);
        let graph = &loaded[0];
        assert_eq!(graph.project.name, "Internal Ops Platform");
        assert!(graph.github_repos.is_empty());
        assert!(graph.huly_links.is_empty());
        assert!(graph.artifacts.is_empty());

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
