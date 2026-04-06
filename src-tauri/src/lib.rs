mod clockify;
mod commands;
mod db;
mod huly;
mod sync;

use std::sync::Mutex;

use sqlx::SqlitePool;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;

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
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

            // Manage the scheduler state (empty initially)
            app.manage(SchedulerState(Mutex::new(None)));

            // ── System tray icon ──────────────────────────────────
            let tray_menu = Menu::with_items(app, &[
                &MenuItem::with_id(app, "show", "Show TeamForge", true, None::<&str>)?,
                &MenuItem::with_id(app, "sync", "Sync Now", true, None::<&str>)?,
                &MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?,
            ])?;

            let _tray = TrayIconBuilder::with_id("teamforge-tray")
                .menu(&tray_menu)
                .tooltip("TeamForge")
                .icon(app.default_window_icon().unwrap().clone())
                .on_menu_event(move |app, event| {
                    match event.id().as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match db::queries::init_db(&app_data_dir).await {
                    Ok(pool) => {
                        handle.manage(DbPool(pool));
                        eprintln!("[teamforge] database initialized");
                    }
                    Err(e) => {
                        eprintln!("[teamforge] database init failed: {e}");
                    }
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            commands::test_clockify_connection,
            commands::get_clockify_workspaces,
            commands::trigger_sync,
            commands::get_settings,
            commands::save_setting,
            commands::get_overview,
            commands::get_quota_compliance,
            commands::get_time_entries_view,
            commands::get_project_breakdown,
            commands::get_activity_feed,
            commands::get_presence_status,
            commands::get_employees,
            commands::update_employee_quota,
            commands::get_sync_status,
            commands::start_background_sync,
            commands::test_huly_connection,
            commands::trigger_huly_sync,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
