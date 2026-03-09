use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use tauri::AppHandle;

use super::planner;
use crate::cleanup::domain::error::CleanupError;
use crate::cleanup::domain::types::{
    CleanupExecutionEntry, CleanupFailedPath, CleanupResult, CleanupStatus,
    ExecuteCleanupProjectResult, ExecuteCleanupRequest,
};

pub struct ExecuteOutput {
    pub run_id: String,
    pub project_results: Vec<ExecuteCleanupProjectResult>,
    pub total_released_bytes: u64,
}

fn now_millis() -> u128 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .unwrap_or(0)
}

fn run_id() -> String {
    format!("run-{}", now_millis())
}

#[cfg(test)]
fn safe_name(text: &str) -> String {
    text.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' {
                ch
            } else {
                '_'
            }
        })
        .collect::<String>()
}

#[cfg(test)]
fn resolve_existing_destination(base_dir: &Path, base_name: &str) -> PathBuf {
    let mut index = 0_u32;
    loop {
        let name = if index == 0 {
            base_name.to_string()
        } else {
            format!("{base_name}-{index}")
        };
        let destination = base_dir.join(name);
        if !destination.exists() {
            return destination;
        }
        if index == u32::MAX {
            return base_dir.join(format!("{base_name}-{}", now_millis()));
        }
        index = index.saturating_add(1);
    }
}

#[cfg(test)]
fn copy_path_recursive(source: &Path, destination: &Path) -> CleanupResult<()> {
    let metadata = fs::symlink_metadata(source)
        .with_context(|| format!("read metadata for {}", source.display()))?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        fs::copy(source, destination)
            .with_context(|| format!("copy {} to {}", source.display(), destination.display()))?;
        return Ok(());
    }
    if metadata.is_dir() {
        fs::create_dir_all(destination)
            .with_context(|| format!("create directory {}", destination.display()))?;
        fs::read_dir(source)
            .with_context(|| format!("read directory {}", source.display()))?
            .collect::<Result<Vec<_>, _>>()
            .with_context(|| format!("collect directory entries {}", source.display()))?
            .into_iter()
            .try_for_each(|entry| {
                let file_name = entry.file_name();
                copy_path_recursive(&entry.path(), &destination.join(file_name))
            })?;
    }
    Ok(())
}

#[cfg(test)]
fn move_path_to_destination(source: &Path, destination: &Path) -> CleanupResult<()> {
    fs::rename(source, destination)
        .with_context(|| format!("move {} to {}", source.display(), destination.display()))
        .or_else(|_| {
            copy_path_recursive(source, destination)?;
            remove_path(source)
        })
}

#[cfg(target_os = "macos")]
#[cfg_attr(test, allow(dead_code))]
fn move_to_system_trash(path: &Path) -> CleanupResult<()> {
    let path_text = path.to_string_lossy().to_string();
    let output = Command::new("osascript")
        .arg("-e")
        .arg("on run argv")
        .arg("-e")
        .arg("set targetPath to POSIX file (item 1 of argv)")
        .arg("-e")
        .arg("tell application \"Finder\" to delete targetPath")
        .arg("-e")
        .arg("end run")
        .arg(&path_text)
        .output()
        .with_context(|| format!("run osascript for {}", path.display()))?;
    if output.status.success() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Err(
        CleanupError::SystemTrashCommandFailed(if stderr.is_empty() { stdout } else { stderr })
            .into(),
    )
}

#[cfg(not(target_os = "macos"))]
fn move_to_system_trash(_path: &Path) -> CleanupResult<()> {
    Err(CleanupError::SystemTrashUnsupported.into())
}

#[cfg(test)]
fn move_to_managed_trash(path: &Path, run_id: &str, safe_trash_root: &Path) -> CleanupResult<()> {
    let trash_dir = safe_trash_root.join(run_id);
    fs::create_dir_all(&trash_dir)
        .with_context(|| format!("create managed trash directory {}", trash_dir.display()))?;
    let raw_name = path.file_name().map_or_else(
        || "item".to_string(),
        |name| name.to_string_lossy().to_string(),
    );
    let base_name = safe_name(&raw_name);
    let destination = resolve_existing_destination(&trash_dir, &base_name);
    move_path_to_destination(path, &destination)
}

#[cfg(test)]
fn move_to_safe_trash(path: &Path, run_id: &str, safe_trash_root: &Path) -> CleanupResult<()> {
    move_to_managed_trash(path, run_id, safe_trash_root)
}

#[cfg(not(test))]
fn move_to_safe_trash(path: &Path, _run_id: &str, _safe_trash_root: &Path) -> CleanupResult<()> {
    move_to_system_trash(path)
}

fn remove_path(path: &Path) -> CleanupResult<()> {
    let metadata = fs::symlink_metadata(path)
        .with_context(|| format!("read metadata for {}", path.display()))?;
    if metadata.file_type().is_symlink() || metadata.is_file() {
        return fs::remove_file(path).with_context(|| format!("remove file {}", path.display()));
    }
    if metadata.is_dir() {
        return fs::remove_dir_all(path)
            .with_context(|| format!("remove directory {}", path.display()));
    }
    Ok(())
}

fn item_id_belongs_to_project(item_id: &str, project_id: &str) -> bool {
    item_id
        .rsplit_once(':')
        .is_some_and(|(project_key, _)| project_key == project_id)
}

fn split_entry_item_ids(entry: &CleanupExecutionEntry) -> (Vec<String>, Vec<String>) {
    entry
        .selected_item_ids
        .iter()
        .cloned()
        .partition(|item_id| item_id_belongs_to_project(item_id, &entry.project_id))
}

fn execute_entry(
    dry_run: bool,
    entry: CleanupExecutionEntry,
    run_id: &str,
    safe_trash_root: &Path,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &super::inspector::InspectionRuntime,
) -> ExecuteCleanupProjectResult {
    let safe_mode = entry.safe_mode.unwrap_or(true);
    let (owned_item_ids, foreign_item_ids) = split_entry_item_ids(&entry);
    let resolved_items = planner_runtime.resolve_selected_plan_items(
        inspector_runtime,
        &entry.project_id,
        &owned_item_ids,
    );
    let initial_failed_paths = foreign_item_ids
        .into_iter()
        .map(|item_id| CleanupFailedPath {
            path: item_id,
            reason: CleanupError::ForeignProjectItem.to_string(),
        })
        .chain(
            resolved_items
                .missing_item_ids
                .into_iter()
                .map(|item_id| CleanupFailedPath {
                    path: item_id,
                    reason: CleanupError::MissingCleanupPlanItem.to_string(),
                }),
        )
        .collect::<Vec<_>>();
    let initial_failed_count = u32::try_from(initial_failed_paths.len()).unwrap_or(u32::MAX);
    let (released_bytes, removed_count, failed_count, removed_paths, failed_paths) =
        resolved_items.items.into_iter().fold(
            (
                0_u64,
                0_u32,
                initial_failed_count,
                Vec::<String>::new(),
                initial_failed_paths,
            ),
            |(bytes, count, failed, mut paths, mut failed_paths), item| {
                let path = PathBuf::from(&item.path);
                if !path.exists() {
                    return (bytes, count, failed, paths, failed_paths);
                }
                if dry_run {
                    paths.push(item.path);
                    return (
                        bytes.saturating_add(item.estimated_size_bytes),
                        count.saturating_add(1),
                        failed,
                        paths,
                        failed_paths,
                    );
                }
                let result = if safe_mode {
                    move_to_safe_trash(&path, run_id, safe_trash_root)
                } else {
                    remove_path(&path)
                };
                match result {
                    Ok(()) => {
                        paths.push(item.path);
                        (
                            bytes.saturating_add(item.estimated_size_bytes),
                            count.saturating_add(1),
                            failed,
                            paths,
                            failed_paths,
                        )
                    }
                    Err(error) => {
                        failed_paths.push(CleanupFailedPath {
                            path: item.path,
                            reason: format!("{error:#}"),
                        });
                        (bytes, count, failed.saturating_add(1), paths, failed_paths)
                    }
                }
            },
        );

    let status = if dry_run {
        CleanupStatus::DryRun
    } else if failed_count == 0 {
        CleanupStatus::Success
    } else if removed_count == 0 {
        CleanupStatus::Failed
    } else {
        CleanupStatus::Partial
    };

    ExecuteCleanupProjectResult {
        project_id: entry.project_id,
        released_bytes,
        removed_count,
        status,
        removed_paths,
        failed_paths,
    }
}

fn execute_cleanup_request(
    request: ExecuteCleanupRequest,
    safe_trash_root: &Path,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &super::inspector::InspectionRuntime,
) -> ExecuteOutput {
    let run_id = run_id();
    let dry_run = request.dry_run;
    let project_results = request
        .entries
        .into_iter()
        .map(|entry| {
            execute_entry(
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
    _app: &AppHandle,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &super::inspector::InspectionRuntime,
    request: ExecuteCleanupRequest,
) -> ExecuteOutput {
    execute_cleanup_request(request, Path::new(""), planner_runtime, inspector_runtime)
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
