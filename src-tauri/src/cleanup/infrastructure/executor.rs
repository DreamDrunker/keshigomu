use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::AppHandle;
use tauri::Manager;

use super::{inspector, planner};
use crate::cleanup::domain::types::{ExecuteCleanupProjectResult, ExecuteCleanupRequest};

mod entry;
mod trash;

pub struct ExecuteOutput {
    pub run_id: String,
    pub project_results: Vec<ExecuteCleanupProjectResult>,
    pub total_released_bytes: u64,
}

fn run_id() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| format!("run-{}", duration.as_millis()))
        .unwrap_or_else(|_| "run-0".to_string())
}

fn resolve_safe_trash_root(app: &AppHandle) -> PathBuf {
    app.path()
        .app_cache_dir()
        .or_else(|_| app.path().app_config_dir())
        .map(|base| base.join("cleanup-safe-trash"))
        .unwrap_or_else(|_| std::env::temp_dir().join("keshigomu-cleanup-safe-trash"))
}

fn execute_cleanup_request(
    request: ExecuteCleanupRequest,
    safe_trash_root: &Path,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &inspector::InspectionRuntime,
) -> ExecuteOutput {
    let run_id = run_id();
    let dry_run = request.dry_run;
    let project_results = request
        .entries
        .into_iter()
        .map(|entry| {
            entry::execute_entry(
                dry_run,
                entry,
                &run_id,
                safe_trash_root,
                planner_runtime,
                inspector_runtime,
            )
        })
        .collect::<Vec<_>>();
    let total_released_bytes = project_results
        .iter()
        .fold(0_u64, |sum, item| sum.saturating_add(item.released_bytes));

    ExecuteOutput {
        run_id,
        project_results,
        total_released_bytes,
    }
}

pub fn execute_cleanup(
    app: &AppHandle,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &inspector::InspectionRuntime,
    request: ExecuteCleanupRequest,
) -> ExecuteOutput {
    let safe_trash_root = resolve_safe_trash_root(app);
    execute_cleanup_request(
        request,
        &safe_trash_root,
        planner_runtime,
        inspector_runtime,
    )
}

#[cfg(test)]
mod tests {
    use super::execute_cleanup_request;
    use crate::cleanup::domain::types::{
        BuildCleanupPlanRequest, CleanupExecutionEntry, CleanupStatus, ExecuteCleanupRequest,
    };
    use crate::cleanup::infrastructure::inspector::InspectionRuntime;
    use crate::cleanup::infrastructure::planner::PlannerRuntime;
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("keshigomu-exec-{name}-{stamp}"))
    }

    #[test]
    fn execute_cleanup_dry_run_counts_selected_items() {
        let planner_runtime = PlannerRuntime::default();
        let inspection_runtime = InspectionRuntime::default();
        let project_dir = test_temp_dir("dry-run");
        let trash_dir = test_temp_dir("dry-run-trash");
        let _ = fs::create_dir_all(project_dir.join("dist"));
        let _ = fs::write(project_dir.join("dist/main.js"), vec![1_u8; 32]);

        let plan = planner_runtime.build_cleanup_plans_with_allowed_roots(
            &inspection_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );
        let selected_ids = plan.plans[0]
            .items
            .iter()
            .map(|item| item.item_id.clone())
            .collect::<Vec<_>>();

        let output = execute_cleanup_request(
            ExecuteCleanupRequest {
                dry_run: true,
                entries: vec![CleanupExecutionEntry {
                    project_id: project_dir.to_string_lossy().to_string(),
                    selected_item_ids: selected_ids,
                    safe_mode: Some(true),
                }],
            },
            &trash_dir,
            &planner_runtime,
            &inspection_runtime,
        );

        let _ = fs::remove_dir_all(&project_dir);
        let _ = fs::remove_dir_all(&trash_dir);

        assert_eq!(output.project_results.len(), 1);
        assert_eq!(output.project_results[0].status, CleanupStatus::DryRun);
        assert!(output.project_results[0].removed_count >= 1);
        assert!(output.total_released_bytes > 0);
    }

    #[test]
    fn execute_cleanup_safe_mode_moves_item_to_managed_trash_in_tests() {
        let planner_runtime = PlannerRuntime::default();
        let inspection_runtime = InspectionRuntime::default();
        let project_dir = test_temp_dir("safe-trash");
        let trash_dir = test_temp_dir("safe-trash-bin");
        let _ = fs::create_dir_all(project_dir.join("dist"));
        let _ = fs::write(project_dir.join("dist/main.js"), vec![1_u8; 24]);

        let plan = planner_runtime.build_cleanup_plans_with_allowed_roots(
            &inspection_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );
        let selected_ids = plan.plans[0]
            .items
            .iter()
            .map(|item| item.item_id.clone())
            .collect::<Vec<_>>();

        let output = execute_cleanup_request(
            ExecuteCleanupRequest {
                dry_run: false,
                entries: vec![CleanupExecutionEntry {
                    project_id: project_dir.to_string_lossy().to_string(),
                    selected_item_ids: selected_ids,
                    safe_mode: Some(true),
                }],
            },
            &trash_dir,
            &planner_runtime,
            &inspection_runtime,
        );

        let run_trash_dir = trash_dir.join(&output.run_id);
        let moved_count = fs::read_dir(&run_trash_dir)
            .ok()
            .map_or(0, std::iter::Iterator::count);

        let _ = fs::remove_dir_all(&project_dir);
        let _ = fs::remove_dir_all(&trash_dir);

        assert_eq!(output.project_results.len(), 1);
        assert_eq!(output.project_results[0].status, CleanupStatus::Success);
        assert!(output.project_results[0].removed_count >= 1);
        assert!(moved_count >= 1);
        assert!(!project_dir.join(".keshigomu-trash").exists());
    }

    #[test]
    fn execute_cleanup_reports_missing_plan_items_as_failed() {
        let planner_runtime = PlannerRuntime::default();
        let inspection_runtime = InspectionRuntime::default();
        let output = execute_cleanup_request(
            ExecuteCleanupRequest {
                dry_run: false,
                entries: vec![CleanupExecutionEntry {
                    project_id: "project-1".to_string(),
                    selected_item_ids: vec!["project-1:missing".to_string()],
                    safe_mode: Some(true),
                }],
            },
            Path::new(""),
            &planner_runtime,
            &inspection_runtime,
        );

        assert_eq!(output.project_results.len(), 1);
        assert_eq!(output.project_results[0].status, CleanupStatus::Failed);
        assert_eq!(output.project_results[0].removed_count, 0);
        assert_eq!(output.project_results[0].failed_paths.len(), 1);
        assert_eq!(
            output.project_results[0].failed_paths[0].path,
            "project-1:missing"
        );
    }

    #[test]
    fn execute_cleanup_refetches_plan_when_cache_items_are_missing() {
        let planner_runtime = PlannerRuntime::default();
        let inspection_runtime = InspectionRuntime::default();
        let project_dir = test_temp_dir("missing-cache-items");
        let trash_dir = test_temp_dir("missing-cache-items-trash");
        let _ = fs::create_dir_all(project_dir.join("dist"));
        let _ = fs::write(project_dir.join("dist/main.js"), vec![1_u8; 20]);

        let project_id = project_dir.to_string_lossy().to_string();
        let plan = planner_runtime.build_cleanup_plans_with_allowed_roots(
            &inspection_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_id.clone()],
            },
            &[],
        );
        let selected_ids = plan.plans[0]
            .items
            .iter()
            .map(|item| item.item_id.clone())
            .collect::<Vec<_>>();

        planner_runtime.invalidate_project_plan_cache(std::slice::from_ref(&project_id));

        let output = execute_cleanup_request(
            ExecuteCleanupRequest {
                dry_run: false,
                entries: vec![CleanupExecutionEntry {
                    project_id,
                    selected_item_ids: selected_ids,
                    safe_mode: Some(false),
                }],
            },
            &trash_dir,
            &planner_runtime,
            &inspection_runtime,
        );

        let _ = fs::remove_dir_all(&project_dir);
        let _ = fs::remove_dir_all(&trash_dir);

        assert_eq!(output.project_results.len(), 1);
        assert_eq!(output.project_results[0].status, CleanupStatus::Success);
        assert!(output.project_results[0].removed_count >= 1);
        assert_eq!(output.project_results[0].failed_paths.len(), 0);
    }

    #[test]
    fn execute_cleanup_rejects_item_ids_from_other_projects() {
        let planner_runtime = PlannerRuntime::default();
        let inspection_runtime = InspectionRuntime::default();
        let source_project_dir = test_temp_dir("project-a");
        let foreign_project_dir = test_temp_dir("project-b");
        let trash_dir = test_temp_dir("foreign-item-trash");
        let _ = fs::create_dir_all(source_project_dir.join("dist"));
        let _ = fs::create_dir_all(foreign_project_dir.join("dist"));
        let _ = fs::write(source_project_dir.join("dist/a.js"), vec![1_u8; 8]);
        let _ = fs::write(foreign_project_dir.join("dist/b.js"), vec![1_u8; 8]);

        let project_b_plan = planner_runtime.build_cleanup_plans_with_allowed_roots(
            &inspection_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![foreign_project_dir.to_string_lossy().to_string()],
            },
            &[],
        );
        let foreign_item_id = project_b_plan.plans[0].items[0].item_id.clone();

        let output = execute_cleanup_request(
            ExecuteCleanupRequest {
                dry_run: false,
                entries: vec![CleanupExecutionEntry {
                    project_id: source_project_dir.to_string_lossy().to_string(),
                    selected_item_ids: vec![foreign_item_id.clone()],
                    safe_mode: Some(false),
                }],
            },
            &trash_dir,
            &planner_runtime,
            &inspection_runtime,
        );

        let _ = fs::remove_dir_all(&source_project_dir);
        let _ = fs::remove_dir_all(&foreign_project_dir);
        let _ = fs::remove_dir_all(&trash_dir);

        assert_eq!(output.project_results.len(), 1);
        assert_eq!(output.project_results[0].status, CleanupStatus::Failed);
        assert_eq!(output.project_results[0].removed_count, 0);
        assert_eq!(output.project_results[0].failed_paths.len(), 1);
        assert_eq!(
            output.project_results[0].failed_paths[0].path,
            foreign_item_id
        );
    }
}
