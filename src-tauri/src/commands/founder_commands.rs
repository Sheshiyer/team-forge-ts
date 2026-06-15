use reqwest::Client;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::sync::teamforge_worker::{worker_access_token_pub, worker_base_url_pub};
use crate::DbPool;

/// Tauri-side intent envelope. Field names use camelCase on the wire (matching
/// the rest of the React → Tauri API surface), but when we forward the body to
/// the Worker we re-serialize with snake_case so it satisfies
/// `validateIntent` in `cloudflare/worker/src/lib/commands/types.ts`.
#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FounderCommandIntent {
    pub id: String,
    pub actor_id: String,
    pub actor_kind: String,
    pub auth_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub target_id: Option<String>,
    pub correlation_id: String,
    pub payload: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderCommandIntentResult {
    pub run_id: String,
    pub state: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FounderCommandRun {
    pub id: String,
    pub command_id: String,
    pub actor_id: String,
    pub actor_kind: String,
    pub auth_mode: String,
    pub state: String,
    pub target_kind: Option<String>,
    pub target_id: Option<String>,
    pub correlation_id: String,
    pub requested_at: i64,
    pub accepted_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub result_json: Option<String>,
    pub error_code: Option<String>,
    pub error_message: Option<String>,
}

#[derive(Debug, Deserialize)]
struct WorkerEnvelope<T> {
    ok: bool,
    data: Option<T>,
}

/// Wire body sent to the Worker — snake_case to match `validateIntent`.
#[derive(Debug, Serialize)]
struct WorkerIntentBody {
    id: String,
    actor_id: String,
    actor_kind: String,
    auth_mode: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    target_id: Option<String>,
    correlation_id: String,
    payload: serde_json::Value,
}

/// Wire-shape returned by the Worker for `GET /v1/commands/runs/:id` — the
/// Worker emits snake_case here so we deserialize a sibling struct and then
/// translate into the camelCase facing struct returned to the React layer.
#[derive(Debug, Deserialize)]
struct WorkerRunWire {
    id: String,
    command_id: String,
    actor_id: String,
    actor_kind: String,
    auth_mode: String,
    state: String,
    target_kind: Option<String>,
    target_id: Option<String>,
    correlation_id: String,
    requested_at: i64,
    accepted_at: Option<i64>,
    completed_at: Option<i64>,
    result_json: Option<String>,
    error_code: Option<String>,
    error_message: Option<String>,
}

/// Wire-shape returned by the Worker for `POST /v1/commands/intent` (snake_case).
#[derive(Debug, Deserialize)]
struct WorkerIntentResultWire {
    run_id: String,
    state: String,
}

#[tauri::command]
pub async fn post_command_intent(
    db: State<'_, DbPool>,
    intent: FounderCommandIntent,
) -> Result<FounderCommandIntentResult, String> {
    let pool = &db.0;
    let base_url = worker_base_url_pub(pool).await?;
    let access_token = worker_access_token_pub(pool).await?;
    let url = format!("{}/v1/commands/intent", base_url.trim_end_matches('/'));

    let body = WorkerIntentBody {
        id: intent.id,
        actor_id: intent.actor_id,
        actor_kind: intent.actor_kind,
        auth_mode: intent.auth_mode,
        target_kind: intent.target_kind,
        target_id: intent.target_id,
        correlation_id: intent.correlation_id,
        payload: intent.payload,
    };

    let client = Client::new();
    let response = client
        .post(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("post command intent: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Worker /v1/commands/intent returned status {status}"
        ));
    }
    let envelope: WorkerEnvelope<WorkerIntentResultWire> = response
        .json()
        .await
        .map_err(|e| format!("parse intent response: {e}"))?;
    if !envelope.ok {
        return Err("Worker /v1/commands/intent returned ok=false".to_string());
    }
    let wire = envelope
        .data
        .ok_or_else(|| "Worker /v1/commands/intent response missing data".to_string())?;
    Ok(FounderCommandIntentResult {
        run_id: wire.run_id,
        state: wire.state,
    })
}

#[tauri::command]
pub async fn get_command_run(
    db: State<'_, DbPool>,
    run_id: String,
) -> Result<FounderCommandRun, String> {
    let pool = &db.0;
    let base_url = worker_base_url_pub(pool).await?;
    let access_token = worker_access_token_pub(pool).await?;
    let url = format!(
        "{}/v1/commands/runs/{}",
        base_url.trim_end_matches('/'),
        run_id
    );

    let client = Client::new();
    let response = client
        .get(&url)
        .bearer_auth(access_token)
        .timeout(std::time::Duration::from_secs(10))
        .send()
        .await
        .map_err(|e| format!("get command run: {e}"))?;

    let status = response.status();
    if !status.is_success() {
        return Err(format!(
            "Worker /v1/commands/runs/:id returned status {status}"
        ));
    }
    let envelope: WorkerEnvelope<WorkerRunWire> = response
        .json()
        .await
        .map_err(|e| format!("parse run response: {e}"))?;
    if !envelope.ok {
        return Err("Worker /v1/commands/runs/:id returned ok=false".to_string());
    }
    let wire = envelope
        .data
        .ok_or_else(|| "Worker /v1/commands/runs/:id response missing data".to_string())?;
    Ok(FounderCommandRun {
        id: wire.id,
        command_id: wire.command_id,
        actor_id: wire.actor_id,
        actor_kind: wire.actor_kind,
        auth_mode: wire.auth_mode,
        state: wire.state,
        target_kind: wire.target_kind,
        target_id: wire.target_id,
        correlation_id: wire.correlation_id,
        requested_at: wire.requested_at,
        accepted_at: wire.accepted_at,
        completed_at: wire.completed_at,
        result_json: wire.result_json,
        error_code: wire.error_code,
        error_message: wire.error_message,
    })
}
