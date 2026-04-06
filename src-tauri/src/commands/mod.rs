use std::sync::Arc;

use tauri::State;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::clockify::types::{ClockifyUser, ClockifyWorkspace};
use crate::db::queries;
use crate::DbPool;

/// Validate a Clockify API key by fetching the authenticated user.
#[tauri::command]
pub async fn test_clockify_connection(api_key: String) -> Result<ClockifyUser, String> {
    let client = ClockifyClient::new(api_key);
    client.get_current_user().await
}

/// List workspaces accessible with the given API key.
#[tauri::command]
pub async fn get_clockify_workspaces(
    api_key: String,
) -> Result<Vec<ClockifyWorkspace>, String> {
    let client = ClockifyClient::new(api_key);
    client.get_workspaces().await
}

/// Run a full Clockify sync (users, projects, time entries).
/// Reads the API key and workspace ID from the settings table.
#[tauri::command]
pub async fn trigger_sync(db: State<'_, DbPool>) -> Result<String, String> {
    let pool = &db.0;

    let api_key = queries::get_setting(pool, "clockify_api_key")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "Clockify API key not configured".to_string())?;

    let workspace_id = queries::get_setting(pool, "clockify_workspace_id")
        .await
        .map_err(|e| format!("db error: {e}"))?
        .ok_or_else(|| "Clockify workspace ID not configured".to_string())?;

    let client = Arc::new(ClockifyClient::new(api_key));
    let engine = ClockifySyncEngine::new(client, pool.clone(), workspace_id);

    let report = engine.full_sync().await?;

    Ok(format!(
        "Sync complete: {} users, {} projects, {} time entries",
        report.users_synced, report.projects_synced, report.time_entries_synced
    ))
}
