use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::db::queries;
use crate::sync::alerts;

/// Background sync scheduler that polls Clockify on intervals.
pub struct SyncScheduler {
    cancel_tx: watch::Sender<bool>,
    handles: Vec<JoinHandle<()>>,
}

impl SyncScheduler {
    /// Start background polling. Returns None if settings are not configured.
    pub async fn start(pool: SqlitePool, app_handle: tauri::AppHandle) -> Option<Self> {
        // Check if settings are configured
        let api_key = queries::get_setting(&pool, "clockify_api_key")
            .await
            .ok()
            .flatten()?;
        let workspace_id = queries::get_setting(&pool, "clockify_workspace_id")
            .await
            .ok()
            .flatten()?;

        if api_key.is_empty() || workspace_id.is_empty() {
            return None;
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let client = Arc::new(ClockifyClient::new(api_key));
        let mut handles = Vec::new();

        // 1. Presence polling every 30 seconds + tray tooltip update
        {
            let pool = pool.clone();
            let client = client.clone();
            let ws = workspace_id.clone();
            let mut rx = cancel_rx.clone();
            let ah = app_handle.clone();
            handles.push(tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_secs(30)) => {}
                        _ = rx.changed() => { break; }
                    }
                    let engine = ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                    if let Err(e) = engine.sync_presence().await {
                        eprintln!("[scheduler] presence sync error: {e}");
                    }

                    // Update tray tooltip with active count
                    update_tray_tooltip(&ah, &pool).await;
                }
            }));
        }

        // 2. Time entries every 5 minutes
        {
            let pool = pool.clone();
            let client = client.clone();
            let ws = workspace_id.clone();
            let mut rx = cancel_rx.clone();
            handles.push(tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_secs(300)) => {}
                        _ = rx.changed() => { break; }
                    }
                    let engine = ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                    if let Err(e) = engine.sync_time_entries().await {
                        eprintln!("[scheduler] time entries sync error: {e}");
                    }
                }
            }));
        }

        // 3. Users + projects every 60 minutes, plus quota alerts
        {
            let pool = pool.clone();
            let client = client.clone();
            let ws = workspace_id.clone();
            let mut rx = cancel_rx.clone();
            let ah = app_handle.clone();
            handles.push(tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {}
                        _ = rx.changed() => { break; }
                    }
                    let engine = ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                    if let Err(e) = engine.sync_users().await {
                        eprintln!("[scheduler] users sync error: {e}");
                    }
                    if let Err(e) = engine.sync_projects().await {
                        eprintln!("[scheduler] projects sync error: {e}");
                    }

                    // Check quota alerts after hourly sync
                    if let Err(e) = alerts::check_quota_alerts(&ah, &pool).await {
                        eprintln!("[scheduler] quota alert error: {e}");
                    }
                }
            }));
        }

        eprintln!("[scheduler] background sync started");
        Some(Self { cancel_tx, handles })
    }

    /// Stop all background tasks.
    pub fn stop(self) {
        let _ = self.cancel_tx.send(true);
        for h in self.handles {
            h.abort();
        }
        eprintln!("[scheduler] background sync stopped");
    }
}

/// Query the database for active/total employee counts and update the tray tooltip.
async fn update_tray_tooltip(app_handle: &tauri::AppHandle, pool: &SqlitePool) {
    let active: Result<(i64,), _> = sqlx::query_as(
        "SELECT COUNT(*)
         FROM presence p
         JOIN employees e ON e.id = p.employee_id
         WHERE e.is_active = 1 AND p.clockify_timer_active = 1",
    )
    .fetch_one(pool)
    .await;

    let total: Result<(i64,), _> =
        sqlx::query_as("SELECT COUNT(*) FROM employees WHERE is_active = 1")
            .fetch_one(pool)
            .await;

    if let (Ok((active_count,)), Ok((total_count,))) = (active, total) {
        let tooltip = format!("TeamForge - {}/{} active", active_count, total_count);
        if let Some(tray) = app_handle.tray_by_id("teamforge-tray") {
            let _ = tray.set_tooltip(Some(&tooltip));
        }
    }
}
