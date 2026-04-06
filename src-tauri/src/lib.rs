mod clockify;
mod commands;
mod db;
mod huly;
mod sync;

use sqlx::SqlitePool;
use tauri::Manager;

/// Managed state wrapper so Tauri commands can access the database pool.
pub struct DbPool(pub SqlitePool);

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to TeamForge.", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");

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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
