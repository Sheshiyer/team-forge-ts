use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::SqlitePool;

use crate::db::models::{OpsEvent, TeamforgeIntakeItemRow};
use crate::db::queries;
use crate::paperclip;

const INTAKE_SCHEMA_VERSION: &str = "teamforge_intake/v1";
const DEFAULT_SOURCE: &str = "teamforge_manual";
const DEFAULT_STATUS: &str = "new";
const DEFAULT_PRIORITY: &str = "medium";

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeRoutingHintInput {
    pub target_agent: Option<String>,
    pub target_department: Option<String>,
    pub target_queue: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub founder_review_required: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeCreateInput {
    pub title: String,
    pub body: String,
    pub source: Option<String>,
    pub source_ref: Option<String>,
    pub status: Option<String>,
    pub priority: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    pub created_by: Option<String>,
    #[serde(default)]
    pub routing: TeamforgeIntakeRoutingHintInput,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeUpdateInput {
    pub id: String,
    pub title: String,
    pub body: String,
    pub source_ref: Option<String>,
    pub status: String,
    pub priority: String,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub routing: TeamforgeIntakeRoutingHintInput,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeItemView {
    pub id: String,
    pub sync_key: String,
    pub source: String,
    pub source_ref: Option<String>,
    pub title: String,
    pub body: String,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub routing_target_agent: Option<String>,
    pub routing_target_department: Option<String>,
    pub routing_target_queue: Option<String>,
    pub routing_label: Option<String>,
    pub project_code: Option<String>,
    pub project_id: Option<String>,
    pub client_id: Option<String>,
    pub founder_review_required: bool,
    pub created_by: String,
    pub percolation_status: String,
    pub downstream_system: Option<String>,
    pub downstream_primary_ref: Option<String>,
    pub downstream_secondary_ref: Option<String>,
    pub percolation_error: Option<String>,
    pub route_attempt_count: u32,
    pub last_route_attempt_at: Option<String>,
    pub last_routed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeTimelineEventView {
    pub key: String,
    pub event_type: String,
    pub label: String,
    pub severity: String,
    pub occurred_at: String,
    pub detected_at: String,
    pub detail: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeDetailView {
    pub item: TeamforgeIntakeItemView,
    pub timeline: Vec<TeamforgeIntakeTimelineEventView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeIntakeMutationResult {
    pub action: String,
    pub message: String,
    pub item: TeamforgeIntakeItemView,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderIntakeSummaryView {
    pub total_open: u32,
    pub awaiting_triage_count: u32,
    pub founder_review_count: u32,
    pub pending_route_count: u32,
    pub route_failed_count: u32,
    pub percolated_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderIntakeSectionView {
    pub key: String,
    pub label: String,
    pub count: u32,
    pub items: Vec<TeamforgeIntakeItemView>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderIntakeConsoleView {
    pub summary: FounderIntakeSummaryView,
    pub sections: Vec<FounderIntakeSectionView>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamforgeInboxView {
    pub summary: FounderIntakeSummaryView,
    pub items: Vec<TeamforgeIntakeItemView>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesIntakeInput {
    pub message: String,
    pub source_ref: Option<String>,
    pub sender: Option<String>,
    pub auto_route: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesIntakeNormalizationView {
    pub title: String,
    pub body: String,
    pub status: String,
    pub priority: String,
    pub tags: Vec<String>,
    pub routing: TeamforgeIntakeRoutingHintInput,
    pub confidence: f64,
    pub rationale: Vec<String>,
    pub founder_review_required: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HermesIntakeIngestResult {
    pub normalization: HermesIntakeNormalizationView,
    pub created: TeamforgeIntakeMutationResult,
}

pub fn empty_founder_intake_console() -> FounderIntakeConsoleView {
    FounderIntakeConsoleView {
        summary: FounderIntakeSummaryView {
            total_open: 0,
            awaiting_triage_count: 0,
            founder_review_count: 0,
            pending_route_count: 0,
            route_failed_count: 0,
            percolated_count: 0,
        },
        sections: Vec::new(),
        error: None,
    }
}

pub async fn create_teamforge_intake_item(
    pool: &SqlitePool,
    input: TeamforgeIntakeCreateInput,
) -> Result<TeamforgeIntakeMutationResult, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Intake title is required".to_string());
    }

    let body = input.body.trim();
    if body.is_empty() {
        return Err("Intake body is required".to_string());
    }

    let now = Utc::now().to_rfc3339();
    let founder_review_required = input.routing.founder_review_required.unwrap_or(false);
    let item_id = build_intake_id(title);
    let source = normalize_source(input.source.as_deref());
    let item = TeamforgeIntakeItemRow {
        id: item_id.clone(),
        sync_key: format!("intake:v1:{source}:{item_id}"),
        schema_version: INTAKE_SCHEMA_VERSION.to_string(),
        source,
        source_ref: trim_to_option(input.source_ref),
        title: title.to_string(),
        body: body.to_string(),
        status: normalize_status(input.status.as_deref()),
        priority: normalize_priority(input.priority.as_deref()),
        tags_json: serde_json::to_string(&normalize_tags(input.tags))
            .map_err(|error| format!("encode intake tags: {error}"))?,
        routing_target_agent: trim_to_option(input.routing.target_agent),
        routing_target_department: trim_to_option(input.routing.target_department),
        routing_target_queue: trim_to_option(input.routing.target_queue),
        project_code: trim_to_option(input.routing.project_code),
        project_id: trim_to_option(input.routing.project_id),
        client_id: trim_to_option(input.routing.client_id),
        founder_review_required,
        created_by: trim_to_option(input.created_by).unwrap_or_else(|| "founder".to_string()),
        percolation_status: if founder_review_required {
            "awaiting_triage".to_string()
        } else {
            "pending_route".to_string()
        },
        downstream_system: None,
        downstream_primary_ref: None,
        downstream_secondary_ref: None,
        percolation_error: None,
        route_attempt_count: 0,
        last_route_attempt_at: None,
        last_routed_at: None,
        created_at: now.clone(),
        updated_at: now,
    };

    queries::upsert_teamforge_intake_item(pool, &item)
        .await
        .map_err(|error| format!("store intake item: {error}"))?;
    record_intake_event(pool, &item, "intake.created", "info").await?;

    if item.founder_review_required {
        record_intake_event(pool, &item, "intake.awaiting_triage", "warning").await?;
        return Ok(TeamforgeIntakeMutationResult {
            action: "queued_for_review".to_string(),
            message: "Saved to founder triage. Route it from Overview when ready.".to_string(),
            item: to_view(&item),
        });
    }

    route_teamforge_intake_item(pool, &item.id).await
}

pub async fn route_teamforge_intake_item(
    pool: &SqlitePool,
    item_id: &str,
) -> Result<TeamforgeIntakeMutationResult, String> {
    let Some(mut item) = queries::get_teamforge_intake_item(pool, item_id)
        .await
        .map_err(|error| format!("load intake item: {error}"))?
    else {
        return Err(format!("Intake item not found: {item_id}"));
    };

    if item.percolation_status == "percolated" {
        return Ok(TeamforgeIntakeMutationResult {
            action: "already_percolated".to_string(),
            message: "This intake item already reached Paperclip.".to_string(),
            item: to_view(&item),
        });
    }

    let now = Utc::now().to_rfc3339();
    let next_attempt = item.route_attempt_count + 1;
    let escalation = paperclip::PaperclipEscalationInput {
        title: item.title.clone(),
        body: render_paperclip_body(&item),
        severity: Some(item.priority.clone()),
        user_id: item.routing_target_agent.clone(),
        project_code: item.project_code.clone(),
        project_id: item.project_id.clone(),
    };

    match paperclip::create_escalation(pool, &escalation).await {
        Ok(response) => {
            item.percolation_status = "percolated".to_string();
            item.downstream_system = Some("paperclip".to_string());
            item.downstream_primary_ref = Some(response.id.clone());
            item.downstream_secondary_ref = Some(response.issue_key.clone());
            item.percolation_error = None;
            item.last_route_attempt_at = Some(now.clone());
            item.last_routed_at = Some(now.clone());
            item.route_attempt_count = next_attempt;
            item.updated_at = now;
            queries::upsert_teamforge_intake_item(pool, &item)
                .await
                .map_err(|error| format!("update intake route success: {error}"))?;
            record_intake_event(pool, &item, "intake.routed", "info").await?;
            Ok(TeamforgeIntakeMutationResult {
                action: "percolated".to_string(),
                message: format!(
                    "Sent to Paperclip as {}.",
                    item.downstream_secondary_ref
                        .clone()
                        .unwrap_or_else(|| "a new escalation".to_string())
                ),
                item: to_view(&item),
            })
        }
        Err(error) => {
            item.percolation_status = "route_failed".to_string();
            item.percolation_error = Some(error.clone());
            item.last_route_attempt_at = Some(now.clone());
            item.route_attempt_count = next_attempt;
            item.updated_at = now;
            queries::upsert_teamforge_intake_item(pool, &item)
                .await
                .map_err(|store_error| format!("update intake route failure: {store_error}"))?;
            record_intake_event(pool, &item, "intake.route_failed", "warning").await?;
            Ok(TeamforgeIntakeMutationResult {
                action: "route_failed".to_string(),
                message: format!("Saved locally, but Paperclip routing failed: {error}"),
                item: to_view(&item),
            })
        }
    }
}

pub async fn update_teamforge_intake_item(
    pool: &SqlitePool,
    input: TeamforgeIntakeUpdateInput,
) -> Result<TeamforgeIntakeMutationResult, String> {
    let Some(mut item) = queries::get_teamforge_intake_item(pool, &input.id)
        .await
        .map_err(|error| format!("load intake item: {error}"))?
    else {
        return Err(format!("Intake item not found: {}", input.id));
    };

    let title = input.title.trim();
    if title.is_empty() {
        return Err("Intake title is required".to_string());
    }
    let body = input.body.trim();
    if body.is_empty() {
        return Err("Intake body is required".to_string());
    }

    item.title = title.to_string();
    item.body = body.to_string();
    item.source_ref = trim_to_option(input.source_ref);
    item.status = normalize_status(Some(input.status.as_str()));
    item.priority = normalize_priority(Some(input.priority.as_str()));
    item.tags_json = serde_json::to_string(&normalize_tags(input.tags))
        .map_err(|error| format!("encode intake tags: {error}"))?;
    item.routing_target_agent = trim_to_option(input.routing.target_agent);
    item.routing_target_department = trim_to_option(input.routing.target_department);
    item.routing_target_queue = trim_to_option(input.routing.target_queue);
    item.project_code = trim_to_option(input.routing.project_code);
    item.project_id = trim_to_option(input.routing.project_id);
    item.client_id = trim_to_option(input.routing.client_id);
    item.founder_review_required = input.routing.founder_review_required.unwrap_or(false);
    if item.founder_review_required && item.percolation_status != "percolated" {
        item.percolation_status = "awaiting_triage".to_string();
    } else if !item.founder_review_required && item.percolation_status == "awaiting_triage" {
        item.percolation_status = "pending_route".to_string();
    }
    item.updated_at = Utc::now().to_rfc3339();

    queries::upsert_teamforge_intake_item(pool, &item)
        .await
        .map_err(|error| format!("update intake item: {error}"))?;
    record_intake_event(pool, &item, "intake.updated", "info").await?;

    Ok(TeamforgeIntakeMutationResult {
        action: "updated".to_string(),
        message: "Intake item updated.".to_string(),
        item: to_view(&item),
    })
}

pub async fn load_founder_intake_console(
    pool: &SqlitePool,
) -> Result<FounderIntakeConsoleView, String> {
    let rows = queries::list_teamforge_intake_items(pool, 24)
        .await
        .map_err(|error| format!("load intake queue: {error}"))?;
    let items = rows.iter().map(to_view).collect::<Vec<_>>();
    let open_items = filter_open_items(&items);

    let awaiting_triage = open_items
        .iter()
        .filter(|item| item.percolation_status == "awaiting_triage")
        .cloned()
        .collect::<Vec<_>>();
    let pending_route = open_items
        .iter()
        .filter(|item| item.percolation_status == "pending_route")
        .cloned()
        .collect::<Vec<_>>();
    let route_failed = open_items
        .iter()
        .filter(|item| item.percolation_status == "route_failed")
        .cloned()
        .collect::<Vec<_>>();
    let percolated = open_items
        .iter()
        .filter(|item| item.percolation_status == "percolated")
        .cloned()
        .collect::<Vec<_>>();

    let mut sections = vec![
        build_section("awaiting-triage", "Awaiting Triage", &awaiting_triage),
        build_section("pending-route", "Pending Route", &pending_route),
        build_section("routing-failures", "Routing Failures", &route_failed),
        build_section("percolated", "Percolated", &percolated),
    ];
    sections.retain(|section| section.count > 0);

    Ok(FounderIntakeConsoleView {
        summary: build_intake_summary(&open_items),
        sections,
        error: None,
    })
}

pub async fn load_teamforge_inbox(pool: &SqlitePool) -> Result<TeamforgeInboxView, String> {
    let rows = queries::list_teamforge_intake_items(pool, 120)
        .await
        .map_err(|error| format!("load inbox items: {error}"))?;
    let items = rows.iter().map(to_view).collect::<Vec<_>>();
    let open_items = filter_open_items(&items);
    Ok(TeamforgeInboxView {
        summary: build_intake_summary(&open_items),
        items,
        error: None,
    })
}

pub async fn load_teamforge_intake_detail(
    pool: &SqlitePool,
    item_id: &str,
) -> Result<TeamforgeIntakeDetailView, String> {
    let Some(item) = queries::get_teamforge_intake_item(pool, item_id)
        .await
        .map_err(|error| format!("load intake item: {error}"))?
    else {
        return Err(format!("Intake item not found: {item_id}"));
    };

    let timeline_rows = sqlx::query_as::<_, OpsEvent>(
        "SELECT *
         FROM ops_events
         WHERE entity_type = 'intake_item' AND entity_id = ?1
         ORDER BY occurred_at DESC, detected_at DESC
         LIMIT 40",
    )
    .bind(item_id)
    .fetch_all(pool)
    .await
    .map_err(|error| format!("load intake timeline: {error}"))?;

    Ok(TeamforgeIntakeDetailView {
        item: to_view(&item),
        timeline: timeline_rows
            .iter()
            .map(build_timeline_event_view)
            .collect::<Vec<_>>(),
    })
}

pub async fn ingest_hermes_message(
    pool: &SqlitePool,
    input: HermesIntakeInput,
) -> Result<HermesIntakeIngestResult, String> {
    let normalization = normalize_hermes_message(pool, &input).await?;
    let created = create_teamforge_intake_item(
        pool,
        TeamforgeIntakeCreateInput {
            title: normalization.title.clone(),
            body: normalization.body.clone(),
            source: Some("hermes_message".to_string()),
            source_ref: trim_to_option(input.source_ref),
            status: Some(normalization.status.clone()),
            priority: Some(normalization.priority.clone()),
            tags: normalization.tags.clone(),
            created_by: trim_to_option(input.sender).or(Some("hermes".to_string())),
            routing: normalization.routing.clone(),
        },
    )
    .await?;

    Ok(HermesIntakeIngestResult {
        normalization,
        created,
    })
}

fn build_section(
    key: &str,
    label: &str,
    items: &[TeamforgeIntakeItemView],
) -> FounderIntakeSectionView {
    FounderIntakeSectionView {
        key: key.to_string(),
        label: label.to_string(),
        count: items.len() as u32,
        items: items.iter().take(4).cloned().collect(),
    }
}

fn filter_open_items(items: &[TeamforgeIntakeItemView]) -> Vec<TeamforgeIntakeItemView> {
    items
        .iter()
        .filter(|item| !matches!(item.status.as_str(), "done" | "archived"))
        .cloned()
        .collect::<Vec<_>>()
}

fn build_intake_summary(items: &[TeamforgeIntakeItemView]) -> FounderIntakeSummaryView {
    FounderIntakeSummaryView {
        total_open: items.len() as u32,
        awaiting_triage_count: items
            .iter()
            .filter(|item| item.percolation_status == "awaiting_triage")
            .count() as u32,
        founder_review_count: items
            .iter()
            .filter(|item| item.founder_review_required)
            .count() as u32,
        pending_route_count: items
            .iter()
            .filter(|item| item.percolation_status == "pending_route")
            .count() as u32,
        route_failed_count: items
            .iter()
            .filter(|item| item.percolation_status == "route_failed")
            .count() as u32,
        percolated_count: items
            .iter()
            .filter(|item| item.percolation_status == "percolated")
            .count() as u32,
    }
}

fn to_view(item: &TeamforgeIntakeItemRow) -> TeamforgeIntakeItemView {
    TeamforgeIntakeItemView {
        id: item.id.clone(),
        sync_key: item.sync_key.clone(),
        source: item.source.clone(),
        source_ref: item.source_ref.clone(),
        title: item.title.clone(),
        body: item.body.clone(),
        status: item.status.clone(),
        priority: item.priority.clone(),
        tags: serde_json::from_str(&item.tags_json).unwrap_or_default(),
        routing_target_agent: item.routing_target_agent.clone(),
        routing_target_department: item.routing_target_department.clone(),
        routing_target_queue: item.routing_target_queue.clone(),
        routing_label: build_routing_label(item),
        project_code: item.project_code.clone(),
        project_id: item.project_id.clone(),
        client_id: item.client_id.clone(),
        founder_review_required: item.founder_review_required,
        created_by: item.created_by.clone(),
        percolation_status: item.percolation_status.clone(),
        downstream_system: item.downstream_system.clone(),
        downstream_primary_ref: item.downstream_primary_ref.clone(),
        downstream_secondary_ref: item.downstream_secondary_ref.clone(),
        percolation_error: item.percolation_error.clone(),
        route_attempt_count: item.route_attempt_count.max(0) as u32,
        last_route_attempt_at: item.last_route_attempt_at.clone(),
        last_routed_at: item.last_routed_at.clone(),
        created_at: item.created_at.clone(),
        updated_at: item.updated_at.clone(),
    }
}

fn build_routing_label(item: &TeamforgeIntakeItemRow) -> Option<String> {
    item.routing_target_agent
        .clone()
        .or_else(|| item.routing_target_department.clone())
        .or_else(|| item.routing_target_queue.clone())
}

fn build_timeline_event_view(event: &OpsEvent) -> TeamforgeIntakeTimelineEventView {
    TeamforgeIntakeTimelineEventView {
        key: event.sync_key.clone(),
        event_type: event.event_type.clone(),
        label: humanize_intake_event_type(&event.event_type),
        severity: event.severity.clone(),
        occurred_at: event.occurred_at.clone(),
        detected_at: event.detected_at.clone(),
        detail: intake_event_detail(event),
    }
}

async fn record_intake_event(
    pool: &SqlitePool,
    item: &TeamforgeIntakeItemRow,
    event_type: &str,
    severity: &str,
) -> Result<(), String> {
    let payload_json = json!({
        "id": &item.id,
        "syncKey": &item.sync_key,
        "title": &item.title,
        "status": &item.status,
        "priority": &item.priority,
        "sourceRef": &item.source_ref,
        "routingTargetAgent": &item.routing_target_agent,
        "routingTargetDepartment": &item.routing_target_department,
        "routingTargetQueue": &item.routing_target_queue,
        "projectCode": &item.project_code,
        "projectId": &item.project_id,
        "clientId": &item.client_id,
        "founderReviewRequired": item.founder_review_required,
        "percolationStatus": &item.percolation_status,
        "downstreamSystem": &item.downstream_system,
        "downstreamPrimaryRef": &item.downstream_primary_ref,
        "downstreamSecondaryRef": &item.downstream_secondary_ref,
        "percolationError": &item.percolation_error,
        "routeAttemptCount": item.route_attempt_count,
        "createdBy": &item.created_by,
    })
    .to_string();
    let event = OpsEvent {
        id: None,
        sync_key: format!(
            "ops:v1:{}:{}:intake_item:{}:{}:{}",
            item.source,
            event_type,
            item.id,
            item.route_attempt_count,
            build_sync_fragment(&item.updated_at)
        ),
        schema_version: "ops_event/v1".to_string(),
        source: item.source.clone(),
        event_type: event_type.to_string(),
        entity_type: "intake_item".to_string(),
        entity_id: item.id.clone(),
        actor_employee_id: None,
        actor_clockify_user_id: None,
        actor_huly_person_id: None,
        actor_slack_user_id: None,
        occurred_at: item.updated_at.clone(),
        severity: severity.to_string(),
        payload_json,
        detected_at: item.updated_at.clone(),
    };
    queries::upsert_ops_event(pool, &event)
        .await
        .map_err(|error| format!("record intake event: {error}"))
}

fn render_paperclip_body(item: &TeamforgeIntakeItemRow) -> String {
    let mut lines = vec![
        item.body.trim().to_string(),
        String::new(),
        "---".to_string(),
    ];
    lines.push(format!("TeamForge intake: {}", item.id));
    lines.push(format!("Origin: {}", item.source));
    lines.push(format!("Priority: {}", item.priority.to_uppercase()));
    if let Some(project_code) = &item.project_code {
        lines.push(format!("Project code: {project_code}"));
    }
    if let Some(project_id) = &item.project_id {
        lines.push(format!("Project id: {project_id}"));
    }
    if let Some(client_id) = &item.client_id {
        lines.push(format!("Client id: {client_id}"));
    }
    if let Some(target_agent) = &item.routing_target_agent {
        lines.push(format!("Routing target agent: {target_agent}"));
    }
    if let Some(target_department) = &item.routing_target_department {
        lines.push(format!("Routing target department: {target_department}"));
    }
    if let Some(target_queue) = &item.routing_target_queue {
        lines.push(format!("Routing target queue: {target_queue}"));
    }
    lines.join("\n")
}

async fn normalize_hermes_message(
    pool: &SqlitePool,
    input: &HermesIntakeInput,
) -> Result<HermesIntakeNormalizationView, String> {
    let message = input.message.trim();
    if message.is_empty() {
        return Err("Hermes message is required".to_string());
    }

    let title = extract_message_title(message);
    let body = message.to_string();
    let lower = message.to_lowercase();
    let mut rationale =
        vec!["Canonicalized a Hermes message into the TeamForge intake envelope.".to_string()];
    let mut tags = vec!["hermes".to_string()];
    let mut routing = TeamforgeIntakeRoutingHintInput::default();
    let mut confidence = 0.25f64;
    let mut status = DEFAULT_STATUS.to_string();

    let priority = if contains_any(
        &lower,
        &[
            "sev1", "critical", "urgent", "outage", "down", "blocked", "blocker",
        ],
    ) {
        rationale.push("Critical language detected in the message.".to_string());
        tags.push("urgent".to_string());
        confidence += 0.18;
        "critical".to_string()
    } else if contains_any(
        &lower,
        &[
            "alert", "bug", "broken", "error", "fail", "incident", "overflow",
        ],
    ) {
        rationale.push("Operational issue keywords detected.".to_string());
        tags.push("ops".to_string());
        confidence += 0.14;
        "high".to_string()
    } else if contains_any(&lower, &["later", "backlog", "idea", "someday"]) {
        rationale.push("Backlog / later-language detected.".to_string());
        "low".to_string()
    } else {
        DEFAULT_PRIORITY.to_string()
    };

    if contains_any(
        &lower,
        &["approval", "approve", "sign off", "review this first"],
    ) {
        routing.target_queue = Some("approvals".to_string());
        routing.founder_review_required = Some(true);
        status = "approval".to_string();
        tags.push("approval".to_string());
        rationale.push("Approval language routes this into founder/approval review.".to_string());
        confidence += 0.18;
    }

    if contains_any(
        &lower,
        &["onboarding", "new hire", "client setup", "employee setup"],
    ) {
        routing.target_department = Some("onboarding".to_string());
        routing.target_queue = routing
            .target_queue
            .clone()
            .or(Some("onboarding".to_string()));
        tags.push("onboarding".to_string());
        rationale.push("Onboarding language detected.".to_string());
        confidence += 0.16;
    }

    if contains_any(&lower, &["slack", "telegram", "message", "comms"]) {
        routing.target_department = routing
            .target_department
            .clone()
            .or(Some("comms".to_string()));
        tags.push("comms".to_string());
        rationale.push("Comms-related signal detected.".to_string());
        confidence += 0.08;
    }

    if contains_any(&lower, &["founder", "ceo"]) {
        routing.target_queue = Some("founder".to_string());
        tags.push("founder".to_string());
        rationale.push("Founder-specific destination detected.".to_string());
        confidence += 0.08;
    }

    if let Some(project_code) = extract_project_code(message) {
        routing.project_code = Some(project_code.clone());
        tags.push("project-scoped".to_string());
        rationale.push(format!("Detected project code `{project_code}`."));
        confidence += 0.2;
    }

    if let Some(agent_id) = resolve_agent_hint_from_message(pool, message).await {
        routing.target_agent = Some(agent_id.clone());
        tags.push("agent-routed".to_string());
        rationale.push(format!("Matched an agent hint to `{agent_id}`."));
        confidence += 0.18;
    }

    if input.auto_route == Some(false) {
        routing.founder_review_required = Some(true);
        rationale.push("Auto-route was disabled by the caller.".to_string());
    }

    let founder_review_required = routing.founder_review_required.unwrap_or_else(|| {
        confidence < 0.65
            || (routing.target_agent.is_none()
                && routing.target_department.is_none()
                && routing.target_queue.is_none())
    });
    if founder_review_required {
        rationale.push(
            "Message held for founder review because routing confidence is still partial."
                .to_string(),
        );
    } else {
        rationale.push(
            "Message has enough routing signal to auto-route into the intake pipeline.".to_string(),
        );
    }
    routing.founder_review_required = Some(founder_review_required);

    Ok(HermesIntakeNormalizationView {
        title,
        body,
        status,
        priority,
        tags: normalize_tags(tags),
        routing,
        confidence: (confidence * 100.0).round() / 100.0,
        rationale,
        founder_review_required,
    })
}

fn normalize_source(value: Option<&str>) -> String {
    match value.map(|entry| entry.trim().to_lowercase()) {
        Some(value)
            if matches!(
                value.as_str(),
                "teamforge_manual"
                    | "hermes_message"
                    | "paperclip_escalation"
                    | "worker_event"
                    | "slack_signal"
            ) =>
        {
            value
        }
        _ => DEFAULT_SOURCE.to_string(),
    }
}

fn normalize_status(value: Option<&str>) -> String {
    match value.map(|entry| entry.trim().to_lowercase()) {
        Some(value)
            if matches!(
                value.as_str(),
                "new"
                    | "triage"
                    | "assigned"
                    | "blocked"
                    | "in_progress"
                    | "approval"
                    | "done"
                    | "archived"
            ) =>
        {
            value
        }
        _ => DEFAULT_STATUS.to_string(),
    }
}

fn normalize_priority(value: Option<&str>) -> String {
    match value.map(|entry| entry.trim().to_lowercase()) {
        Some(value) if matches!(value.as_str(), "critical" | "high" | "medium" | "low") => value,
        _ => DEFAULT_PRIORITY.to_string(),
    }
}

fn normalize_tags(tags: Vec<String>) -> Vec<String> {
    let mut normalized = Vec::new();
    for tag in tags {
        let trimmed = tag.trim().to_lowercase();
        if !trimmed.is_empty() && !normalized.contains(&trimmed) {
            normalized.push(trimmed);
        }
    }
    normalized
}

fn trim_to_option(value: Option<String>) -> Option<String> {
    value.and_then(|entry| {
        let trimmed = entry.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_string())
        }
    })
}

fn build_intake_id(title: &str) -> String {
    format!(
        "tfi-{}-{}",
        Utc::now().format("%Y%m%d%H%M%S%3f"),
        build_sync_fragment(title)
    )
}

fn build_sync_fragment(value: &str) -> String {
    let mut fragment = String::new();
    let mut last_dash = false;
    for ch in value.chars() {
        let normalized = ch.to_ascii_lowercase();
        if normalized.is_ascii_alphanumeric() {
            fragment.push(normalized);
            last_dash = false;
        } else if !last_dash && !fragment.is_empty() {
            fragment.push('-');
            last_dash = true;
        }
        if fragment.len() >= 40 {
            break;
        }
    }
    let trimmed = fragment.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "item".to_string()
    } else {
        trimmed
    }
}

fn extract_message_title(message: &str) -> String {
    let first_line = message
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Hermes intake");
    let sanitized = first_line
        .trim_start_matches(|ch: char| matches!(ch, '-' | '*' | '•' | ':' | '[' | ']'))
        .trim();
    let title = if sanitized.is_empty() {
        "Hermes intake"
    } else {
        sanitized
    };
    if title.chars().count() > 96 {
        let shortened = title.chars().take(93).collect::<String>();
        format!("{shortened}...")
    } else {
        title.to_string()
    }
}

fn extract_project_code(message: &str) -> Option<String> {
    for token in message.split_whitespace() {
        let candidate = token
            .trim_matches(|ch: char| !ch.is_ascii_alphanumeric() && ch != '-')
            .to_uppercase();
        let mut parts = candidate.split('-');
        let left = parts.next()?;
        let right = parts.next()?;
        if parts.next().is_some() {
            continue;
        }
        if (2..=6).contains(&left.len())
            && left.chars().all(|ch| ch.is_ascii_uppercase())
            && (1..=4).contains(&right.len())
            && right.chars().all(|ch| ch.is_ascii_digit())
        {
            return Some(format!("{left}-{right}"));
        }
    }
    None
}

async fn resolve_agent_hint_from_message(pool: &SqlitePool, message: &str) -> Option<String> {
    let lower = message.to_lowercase();
    let users = paperclip::fetch_users(pool).await.ok()?;
    users.into_iter().find_map(|user| {
        let user_id = user.user_id.to_lowercase();
        let user_name = user.user_name.to_lowercase();
        if lower.contains(&format!("@{user_id}"))
            || lower.contains(&format!("@{user_name}"))
            || lower.contains(&user_id)
            || lower.contains(&user_name)
        {
            Some(user.user_id)
        } else {
            None
        }
    })
}

fn contains_any(haystack: &str, needles: &[&str]) -> bool {
    needles.iter().any(|needle| haystack.contains(needle))
}

fn humanize_intake_event_type(event_type: &str) -> String {
    event_type
        .trim()
        .strip_prefix("intake.")
        .unwrap_or(event_type)
        .replace('_', " ")
        .replace('.', " ")
        .to_uppercase()
}

fn intake_event_detail(event: &OpsEvent) -> String {
    let payload = serde_json::from_str::<serde_json::Value>(&event.payload_json).ok();
    match event.event_type.as_str() {
        "intake.route_failed" => payload
            .as_ref()
            .and_then(|value| value.get("percolationError"))
            .and_then(|value| value.as_str())
            .unwrap_or("Paperclip routing failed.")
            .to_string(),
        "intake.routed" => payload
            .as_ref()
            .and_then(|value| value.get("downstreamSecondaryRef"))
            .and_then(|value| value.as_str())
            .map(|value| format!("Percolated into Paperclip as {value}."))
            .unwrap_or_else(|| "Percolated into Paperclip.".to_string()),
        "intake.awaiting_triage" => "Held in founder triage pending review.".to_string(),
        "intake.updated" => payload
            .as_ref()
            .and_then(|value| value.get("routingTargetQueue"))
            .and_then(|value| value.as_str())
            .map(|value| format!("Routing metadata updated. Active queue: {value}."))
            .unwrap_or_else(|| "Issue metadata updated.".to_string()),
        _ => payload
            .as_ref()
            .and_then(|value| value.get("title"))
            .and_then(|value| value.as_str())
            .map(|value| format!("Captured `{value}`."))
            .unwrap_or_else(|| "Intake event recorded.".to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
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
            "teamforge-intake-test-{}-{nanos}-{seq}",
            std::process::id()
        ))
    }

    #[tokio::test]
    async fn founder_review_items_stay_local_and_appear_in_triage_console() {
        let dir = unique_test_dir();
        let pool = queries::init_db(&dir).await.expect("init db");

        let result = create_teamforge_intake_item(
            &pool,
            TeamforgeIntakeCreateInput {
                title: "Founder review needed".to_string(),
                body: "Hold this before routing.".to_string(),
                source: None,
                source_ref: None,
                status: None,
                priority: Some("high".to_string()),
                tags: vec!["Founder".to_string(), "Founder".to_string()],
                created_by: Some("ceo".to_string()),
                routing: TeamforgeIntakeRoutingHintInput {
                    founder_review_required: Some(true),
                    ..TeamforgeIntakeRoutingHintInput::default()
                },
            },
        )
        .await
        .expect("create intake item");

        assert_eq!(result.action, "queued_for_review");
        assert_eq!(result.item.percolation_status, "awaiting_triage");
        assert_eq!(result.item.tags, vec!["founder".to_string()]);

        let console = load_founder_intake_console(&pool)
            .await
            .expect("load founder console");
        assert_eq!(console.summary.awaiting_triage_count, 1);
        assert_eq!(console.summary.founder_review_count, 1);
        assert_eq!(console.sections[0].key, "awaiting-triage");

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn routing_failure_is_persisted_as_route_failed_state() {
        let dir = unique_test_dir();
        let pool = queries::init_db(&dir).await.expect("init db");

        let result = create_teamforge_intake_item(
            &pool,
            TeamforgeIntakeCreateInput {
                title: "Route this into Paperclip".to_string(),
                body: "This should fail cleanly without Paperclip config.".to_string(),
                source: None,
                source_ref: None,
                status: None,
                priority: Some("critical".to_string()),
                tags: Vec::new(),
                created_by: None,
                routing: TeamforgeIntakeRoutingHintInput::default(),
            },
        )
        .await
        .expect("create and route intake item");

        assert_eq!(result.action, "route_failed");
        assert_eq!(result.item.percolation_status, "route_failed");
        assert_eq!(result.item.route_attempt_count, 1);
        assert!(result.message.contains("Paperclip"));

        let stored = queries::get_teamforge_intake_item(&pool, &result.item.id)
            .await
            .expect("load stored intake")
            .expect("stored intake item");
        assert_eq!(stored.percolation_status, "route_failed");

        let event_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM ops_events WHERE entity_type = 'intake_item' AND entity_id = ?1",
        )
        .bind(&result.item.id)
        .fetch_one(&pool)
        .await
        .expect("count intake ops events");
        assert_eq!(event_count, 2);

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn hermes_ingest_holds_approval_requests_for_founder_review() {
        let dir = unique_test_dir();
        let pool = queries::init_db(&dir).await.expect("init db");

        let result = ingest_hermes_message(
            &pool,
            HermesIntakeInput {
                message: "THO-51 approval needed for onboarding handoff".to_string(),
                source_ref: Some("tg://message/51".to_string()),
                sender: Some("hermes".to_string()),
                auto_route: Some(true),
            },
        )
        .await
        .expect("ingest hermes message");

        assert_eq!(result.normalization.priority, "medium");
        assert_eq!(result.normalization.status, "approval");
        assert!(result.normalization.founder_review_required);
        assert_eq!(
            result.normalization.routing.target_queue.as_deref(),
            Some("approvals")
        );
        assert_eq!(result.created.item.source, "hermes_message");
        assert_eq!(result.created.item.percolation_status, "awaiting_triage");

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }

    #[tokio::test]
    async fn updating_held_intake_item_can_move_it_back_to_pending_route() {
        let dir = unique_test_dir();
        let pool = queries::init_db(&dir).await.expect("init db");

        let created = create_teamforge_intake_item(
            &pool,
            TeamforgeIntakeCreateInput {
                title: "Founder-held intake".to_string(),
                body: "Do not route yet.".to_string(),
                source: None,
                source_ref: None,
                status: None,
                priority: Some("high".to_string()),
                tags: vec!["review".to_string()],
                created_by: Some("ceo".to_string()),
                routing: TeamforgeIntakeRoutingHintInput {
                    founder_review_required: Some(true),
                    target_queue: Some("founder".to_string()),
                    ..TeamforgeIntakeRoutingHintInput::default()
                },
            },
        )
        .await
        .expect("create held item");

        let updated = update_teamforge_intake_item(
            &pool,
            TeamforgeIntakeUpdateInput {
                id: created.item.id.clone(),
                title: created.item.title.clone(),
                body: created.item.body.clone(),
                source_ref: created.item.source_ref.clone(),
                status: "triage".to_string(),
                priority: "high".to_string(),
                tags: vec!["review".to_string(), "ready".to_string()],
                routing: TeamforgeIntakeRoutingHintInput {
                    target_queue: Some("ops".to_string()),
                    founder_review_required: Some(false),
                    ..TeamforgeIntakeRoutingHintInput::default()
                },
            },
        )
        .await
        .expect("update held item");

        assert_eq!(updated.item.percolation_status, "pending_route");
        assert!(!updated.item.founder_review_required);
        assert_eq!(updated.item.routing_target_queue.as_deref(), Some("ops"));

        let detail = load_teamforge_intake_detail(&pool, &created.item.id)
            .await
            .expect("load updated detail");
        assert!(detail
            .timeline
            .iter()
            .any(|event| event.event_type == "intake.updated"));

        pool.close().await;
        let _ = std::fs::remove_dir_all(dir);
    }
}
