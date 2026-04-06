mod clockify;
mod commands;
mod db;
mod huly;
mod sync;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Welcome to TeamForge.", name)
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .invoke_handler(tauri::generate_handler![greet])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
