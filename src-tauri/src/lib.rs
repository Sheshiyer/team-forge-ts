mod clockify;
mod commands;
mod db;
mod github;
mod huly;
mod ops;
mod slack;
mod sync;
mod vault;

use std::sync::{Arc, Mutex};

use sqlx::SqlitePool;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};

use crate::clockify::client::ClockifyClient;
use crate::clockify::sync::ClockifySyncEngine;
use crate::db::queries;
use crate::huly::client::HulyClient;
use crate::huly::sync::HulySyncEngine;
use crate::slack::client::SlackClient;
use crate::slack::sync::SlackSyncEngine;
use crate::sync::scheduler::SyncScheduler;

/// Managed state wrapper so Tauri commands can access the database pool.
pub struct DbPool(pub SqlitePool);

/// Holds the background sync scheduler handle.
pub struct SchedulerState(pub Mutex<Option<SyncScheduler>>);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to TeamForge.", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            // Manage the scheduler state (empty initially)
            app.manage(SchedulerState(Mutex::new(None)));

            // ── System tray icon ──────────────────────────────────
            let tray_menu = Menu::with_items(
                app,
                &[
                    &MenuItem::with_id(app, "show", "Show TeamForge", true, None::<&str>)?,
                    &MenuItem::with_id(app, "live", "Live Crew Check", true, None::<&str>)?,
                    &MenuItem::with_id(app, "timeline", "Weekly Timeline", true, None::<&str>)?,
                    &MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?,
                    &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("teamforge-tray")
                .menu(&tray_menu)
                .tooltip("TeamForge")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(move |app, event| match event.id().as_ref() {
                    "show" => focus_main_window(app),
                    "live" => open_main_route(app, "/live"),
                    "timeline" => open_main_route(app, "/activity"),
                    "sync" => {
                        let app_handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = run_tray_sync(app_handle).await {
                                eprintln!("[teamforge] tray sync failed: {error}");
                            }
                        });
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Make the database available before the first page render so packaged
            // builds cannot boot into a false empty/error state while commands race
            // the async setup path.
            let pool = tauri::async_runtime::block_on(db::queries::init_db(&app_data_dir))
                .map_err(|e| {
                    eprintln!("[teamforge] database init failed: {e}");
                    e
                })?;
            app.manage(DbPool(pool));
            eprintln!("[teamforge] database initialized");

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::test_clockify_connection,
            commands::get_clockify_workspaces,
            commands::trigger_sync,
            commands::get_settings,
            commands::save_setting,
            commands::pick_vault_directory,
            commands::validate_vault_directory,
            commands::launch_paperclip_script,
            commands::open_paperclip_ui,
            commands::get_teamforge_projects,
            commands::get_teamforge_client_profiles,
            commands::get_teamforge_client_profile,
            commands::get_teamforge_onboarding_flows,
            commands::get_teamforge_project_control_plane,
            commands::save_teamforge_project,
            commands::run_teamforge_project_action,
            commands::get_overview,
            commands::get_quota_compliance,
            commands::get_time_entries_view,
            commands::get_project_breakdown,
            commands::get_projects_catalog,
            commands::get_execution_projects,
            commands::get_project_activity,
            commands::get_activity_feed,
            commands::get_presence_status,
            commands::get_employees,
            commands::update_employee_quota,
            commands::get_sync_status,
            commands::get_identity_review_queue,
            commands::set_identity_override,
            commands::refresh_agent_feed,
            commands::get_agent_feed,
            commands::export_agent_feed_snapshot,
            commands::start_background_sync,
            commands::test_huly_connection,
            commands::test_slack_connection,
            commands::trigger_huly_sync,
            commands::sync_github_plans,
            commands::preview_huly_workspace_normalization,
            commands::apply_huly_workspace_normalization,
            commands::get_milestones,
            commands::get_time_discrepancies,
            commands::get_estimation_accuracy,
            commands::get_priority_distribution,
            commands::get_team_snapshot,
            commands::refresh_team_snapshot,
            commands::get_departments,
            commands::get_org_chart,
            commands::apply_org_chart_mapping,
            commands::get_leave_requests,
            commands::get_holidays,
            commands::save_manual_leave,
            commands::delete_manual_leave,
            commands::save_manual_holiday,
            commands::delete_manual_holiday,
            commands::get_chat_activity,
            commands::get_board_cards,
            commands::get_meeting_load,
            commands::get_employee_summary,
            commands::get_naming_compliance,
            commands::get_issues_with_naming,
            commands::get_standup_report,
            commands::get_clients,
            commands::get_client_detail,
            commands::get_active_project_issues,
            commands::get_sprint_detail,
            commands::get_monthly_hours,
            commands::get_skills_matrix,
            commands::get_onboarding_flows,
            commands::sync_cloud_credentials,
            commands::sync_cloud_integrations,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

fn focus_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn open_main_route(app: &tauri::AppHandle, route: &str) {
    focus_main_window(app);
    let _ = app.emit("tray:navigate", route.to_string());
}

async fn run_tray_sync(app: tauri::AppHandle) -> Result<(), String> {
    let db = app
        .try_state::<DbPool>()
        .ok_or_else(|| "database not ready".to_string())?;
    let pool = db.0.clone();

    let api_key = queries::get_setting(&pool, "clockify_api_key")
        .await
        .map_err(|e| format!("read clockify api key: {e}"))?;
    let workspace_id = queries::get_setting(&pool, "clockify_workspace_id")
        .await
        .map_err(|e| format!("read clockify workspace: {e}"))?;

    if let (Some(api_key), Some(workspace_id)) = (api_key, workspace_id) {
        if !api_key.is_empty() && !workspace_id.is_empty() {
            let client = Arc::new(ClockifyClient::new(api_key));
            let engine = ClockifySyncEngine::new(client, pool.clone(), workspace_id);
            engine.full_sync().await?;
        }
    }

    let token = queries::get_setting(&pool, "huly_token")
        .await
        .map_err(|e| format!("read huly token: {e}"))?;

    if let Some(token) = token {
        if !token.is_empty() {
            let client = HulyClient::connect(None, &token).await?;
            let engine = HulySyncEngine::new(Arc::new(client), pool.clone());
            engine.full_sync().await?;
        }
    }

    let slack_token = queries::get_setting(&pool, "slack_bot_token")
        .await
        .map_err(|e| format!("read slack token: {e}"))?;

    if let Some(token) = slack_token {
        if !token.trim().is_empty() {
            let engine = SlackSyncEngine::new(Arc::new(SlackClient::new(token)), pool.clone());
            engine.sync_message_deltas().await?;
        }
    }

    queries::refresh_agent_feed_projection(&pool)
        .await
        .map_err(|e| format!("refresh agent feed projection: {e}"))?;

    Ok(())
}
