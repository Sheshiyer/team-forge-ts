use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::db::queries;
use crate::huly::client::HulyClient;
use crate::huly::sync::HulySyncEngine;
use crate::slack::client::SlackClient;
use crate::slack::sync::SlackSyncEngine;
use crate::sync::alerts;

/// Background sync scheduler that polls integrations on intervals.
pub struct SyncScheduler {
    cancel_tx: watch::Sender<bool>,
    handles: Vec<JoinHandle<()>>,
}

impl SyncScheduler {
    /// Start background polling. Returns None if no integration is configured.
    pub async fn start(pool: SqlitePool, app_handle: tauri::AppHandle) -> Option<Self> {
        // Integrations are independent; scheduler can run with either Clockify or Huly.
        let clockify_api_key = queries::get_setting(&pool, "clockify_api_key")
            .await
            .ok()
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let clockify_workspace_id = queries::get_setting(&pool, "clockify_workspace_id")
            .await
            .ok()
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let huly_token = queries::get_setting(&pool, "huly_token")
            .await
            .ok()
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());
        let slack_bot_token = queries::get_setting(&pool, "slack_bot_token")
            .await
            .ok()
            .flatten()
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty());

        let clockify_config = match (clockify_api_key, clockify_workspace_id) {
            (Some(api_key), Some(workspace_id)) => Some((api_key, workspace_id)),
            _ => None,
        };

        if clockify_config.is_none() && huly_token.is_none() && slack_bot_token.is_none() {
            return None;
        }

        let (cancel_tx, cancel_rx) = watch::channel(false);
        let mut handles = Vec::new();

        if let Some((api_key, workspace_id)) = clockify_config {
            let client = Arc::new(ClockifyClient::new(api_key));

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
                        let engine =
                            ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                        if let Err(e) = engine.sync_presence().await {
                            eprintln!("[scheduler] clockify presence sync error: {e}");
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
                        let engine =
                            ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                        if let Err(e) = engine.sync_time_entries().await {
                            eprintln!("[scheduler] clockify time entries sync error: {e}");
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
                        let engine =
                            ClockifySyncEngine::new(client.clone(), pool.clone(), ws.clone());
                        if let Err(e) = engine.sync_users().await {
                            eprintln!("[scheduler] clockify users sync error: {e}");
                        }
                        if let Err(e) = engine.sync_projects().await {
                            eprintln!("[scheduler] clockify projects sync error: {e}");
                        }

                        // Check quota alerts after hourly sync
                        if let Err(e) = alerts::check_quota_alerts(&ah, &pool).await {
                            eprintln!("[scheduler] quota alert error: {e}");
                        }
                    }
                }));
            }
        }

        if let Some(token) = huly_token {
            match HulyClient::connect(None, &token).await {
                Ok(client) => {
                    let client = Arc::new(client);

                    // 4. Huly issue activity every 10 minutes
                    {
                        let pool = pool.clone();
                        let client = client.clone();
                        let mut rx = cancel_rx.clone();
                        handles.push(tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    _ = tokio::time::sleep(std::time::Duration::from_secs(600)) => {}
                                    _ = rx.changed() => { break; }
                                }
                                let engine = HulySyncEngine::new(client.clone(), pool.clone());
                                if let Err(e) = engine.sync_issues().await {
                                    eprintln!("[scheduler] huly issues sync error: {e}");
                                }
                            }
                        }));
                    }

                    // 5. Huly presence every 2 minutes
                    {
                        let pool = pool.clone();
                        let client = client.clone();
                        let mut rx = cancel_rx.clone();
                        handles.push(tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {}
                                    _ = rx.changed() => { break; }
                                }
                                let engine = HulySyncEngine::new(client.clone(), pool.clone());
                                if let Err(e) = engine.sync_presence().await {
                                    eprintln!("[scheduler] huly presence sync error: {e}");
                                }
                            }
                        }));
                    }

                    // 6. Huly team cache refresh every 60 minutes
                    {
                        let pool = pool.clone();
                        let client = client.clone();
                        let mut rx = cancel_rx.clone();
                        handles.push(tokio::spawn(async move {
                            loop {
                                tokio::select! {
                                    _ = tokio::time::sleep(std::time::Duration::from_secs(3600)) => {}
                                    _ = rx.changed() => { break; }
                                }
                                let engine = HulySyncEngine::new(client.clone(), pool.clone());
                                if let Err(e) = engine.sync_team_cache().await {
                                    eprintln!("[scheduler] huly team cache sync error: {e}");
                                }
                            }
                        }));
                    }
                }
                Err(error) => {
                    eprintln!("[scheduler] huly scheduler disabled: failed to connect: {error}");
                }
            }
        }

        if let Some(token) = slack_bot_token {
            let client = Arc::new(SlackClient::new(token));
            let pool = pool.clone();
            let mut rx = cancel_rx.clone();
            handles.push(tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_secs(180)) => {}
                        _ = rx.changed() => { break; }
                    }
                    let engine = SlackSyncEngine::new(client.clone(), pool.clone());
                    if let Err(e) = engine.sync_message_deltas().await {
                        eprintln!("[scheduler] slack delta sync error: {e}");
                    }
                }
            }));
        }

        // Keep agent_feed projection materialized on a fixed cadence so Paperclip polling stays cheap.
        {
            let pool = pool.clone();
            let mut rx = cancel_rx.clone();
            handles.push(tokio::spawn(async move {
                loop {
                    tokio::select! {
                        _ = tokio::time::sleep(std::time::Duration::from_secs(120)) => {}
                        _ = rx.changed() => { break; }
                    }
                    if let Err(e) = queries::refresh_agent_feed_projection(&pool).await {
                        eprintln!("[scheduler] agent_feed projection refresh error: {e}");
                    }
                }
            }));
        }

        if handles.is_empty() {
            return None;
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
