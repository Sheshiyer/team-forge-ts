use std::sync::Arc;

use sqlx::SqlitePool;
use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::db::queries;

/// Background sync scheduler that polls Clockify on intervals.
pub struct SyncScheduler {
    cancel_tx: watch::Sender<bool>,
    handles: Vec<JoinHandle<()>>,
}

impl SyncScheduler {
    /// Start background polling. Returns None if settings are not configured.
    pub async fn start(pool: SqlitePool) -> Option<Self> {
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

        // 1. Presence polling every 30 seconds
        {
            let pool = pool.clone();
            let client = client.clone();
            let ws = workspace_id.clone();
            let mut rx = cancel_rx.clone();
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

        // 3. Users + projects every 60 minutes
        {
            let pool = pool.clone();
            let client = client.clone();
            let ws = workspace_id.clone();
            let mut rx = cancel_rx.clone();
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
