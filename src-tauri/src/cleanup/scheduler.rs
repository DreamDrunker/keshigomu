use std::time::Duration;

use tauri::{AppHandle, Manager};
use tokio::time::sleep;

use super::application::service::CleanupApplication;
use super::domain::types::RunAutoCleanupRequest;
use super::CleanupState;

const AUTO_CLEANUP_STARTUP_DELAY: Duration = Duration::from_secs(12);
const AUTO_CLEANUP_POLL_INTERVAL: Duration = Duration::from_secs(60 * 60);

pub fn start_background_auto_cleanup(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        sleep(AUTO_CLEANUP_STARTUP_DELAY).await;
        loop {
            let app_handle = app.clone();
            tauri::async_runtime::spawn_blocking(move || {
                let state = app_handle.state::<CleanupState>();
                CleanupApplication::new(&app_handle, state.inner())
                    .run_auto_cleanup(RunAutoCleanupRequest { force: false })
            })
            .await
            .map_err(|error| eprintln!("[cleanup] background auto cleanup task failed: {error}"))
            .ok()
            .and_then(|result| {
                result
                    .map_err(|error| eprintln!("[cleanup] background auto cleanup failed: {error}"))
                    .ok()
            });
            sleep(AUTO_CLEANUP_POLL_INTERVAL).await;
        }
    });
}
