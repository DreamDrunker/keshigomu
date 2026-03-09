mod application;
pub(crate) mod domain;
mod infrastructure;
mod scheduler;

use tauri::{AppHandle, Manager};

use domain::types::{
    BuildCleanupPlanRequest, BuildCleanupPlanResponse, CleanupResult, ExecuteCleanupRequest,
    ExecuteCleanupResponse, ListCleanupHistoryRequest, ListCleanupHistoryResponse,
    RunAutoCleanupRequest, RunAutoCleanupResponse, ScanProjectsRequest, ScanProjectsResponse,
};

#[derive(Default)]
pub struct CleanupState {
    planner: infrastructure::planner::PlannerRuntime,
    inspector: infrastructure::inspector::InspectionRuntime,
    auto_cleanup_run_lock: std::sync::Mutex<()>,
}

pub fn start_background_tasks(app: &AppHandle) {
    scheduler::start_background_auto_cleanup(app.clone());
}

async fn run_cleanup_task<T, F>(task_name: &str, task: F) -> Result<T, String>
where
    T: Send + 'static,
    F: FnOnce() -> CleanupResult<T> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(task)
        .await
        .map_err(|error| format!("{task_name} task failed: {error}"))?
        .map_err(|error| format!("{error:#}"))
}

#[tauri::command]
pub async fn scan_projects(
    app: AppHandle,
    request: ScanProjectsRequest,
) -> Result<ScanProjectsResponse, String> {
    run_cleanup_task("scan_projects", move || {
        let state = app.state::<CleanupState>();
        Ok(
            application::service::CleanupApplication::new(&app, state.inner())
                .scan_projects(request),
        )
    })
    .await
}

#[tauri::command]
pub async fn build_cleanup_plan(
    app: AppHandle,
    request: BuildCleanupPlanRequest,
) -> Result<BuildCleanupPlanResponse, String> {
    run_cleanup_task("build_cleanup_plan", move || {
        let state = app.state::<CleanupState>();
        application::service::CleanupApplication::new(&app, state.inner())
            .build_cleanup_plan(request)
    })
    .await
}

#[tauri::command]
pub async fn execute_cleanup(
    app: AppHandle,
    request: ExecuteCleanupRequest,
) -> Result<ExecuteCleanupResponse, String> {
    run_cleanup_task("execute_cleanup", move || {
        let state = app.state::<CleanupState>();
        application::service::CleanupApplication::new(&app, state.inner()).execute_cleanup(request)
    })
    .await
}

#[tauri::command]
pub async fn run_auto_cleanup(
    app: AppHandle,
    request: RunAutoCleanupRequest,
) -> Result<RunAutoCleanupResponse, String> {
    run_cleanup_task("run_auto_cleanup", move || {
        let state = app.state::<CleanupState>();
        application::service::CleanupApplication::new(&app, state.inner()).run_auto_cleanup(request)
    })
    .await
}

#[tauri::command]
pub async fn list_cleanup_history(
    app: AppHandle,
    request: ListCleanupHistoryRequest,
) -> Result<ListCleanupHistoryResponse, String> {
    run_cleanup_task("list_cleanup_history", move || {
        application::service::CleanupApplication::new(&app, app.state::<CleanupState>().inner())
            .list_cleanup_history(&request)
    })
    .await
}
