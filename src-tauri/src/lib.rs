// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
mod cleanup;
mod settings;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {name}! You've been greeted from Rust!")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
/// Starts the Tauri application runtime and registers all commands/plugins.
///
/// # Panics
///
/// Panics if the Tauri runtime fails to start.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(cleanup::CleanupState::default())
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                use tauri::{Manager, TitleBarStyle};
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.set_title_bar_style(TitleBarStyle::Overlay);
                    let _ = window.set_title("");
                }
            }
            cleanup::start_background_tasks(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            settings::load_settings,
            settings::save_settings_patch,
            settings::reset_settings_section,
            cleanup::scan_projects,
            cleanup::build_cleanup_plan,
            cleanup::execute_cleanup,
            cleanup::run_auto_cleanup,
            cleanup::list_cleanup_history
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
