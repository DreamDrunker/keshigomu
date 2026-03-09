mod application;
mod error;
pub(crate) mod store;
pub mod types;

use serde_json::Value;
use tauri::AppHandle;

use types::{AppSettings, SettingsResult};

async fn run_settings_task<T, F>(task_name: &str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> SettingsResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{task_name} task failed: {error}"))?
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn load_settings(app: AppHandle) -> Result<AppSettings, String> {
    run_settings_task("load_settings", move || {
        application::SettingsApplication::new(&app).load()
    })
    .await
}

#[tauri::command]
pub async fn save_settings_patch(app: AppHandle, patch: Value) -> Result<AppSettings, String> {
    run_settings_task("save_settings_patch", move || {
        application::SettingsApplication::new(&app).save_patch(&patch)
    })
    .await
}

#[tauri::command]
pub async fn reset_settings_section(
    app: AppHandle,
    section: String,
) -> Result<AppSettings, String> {
    run_settings_task("reset_settings_section", move || {
        application::SettingsApplication::new(&app).reset_section(section)
    })
    .await
}
