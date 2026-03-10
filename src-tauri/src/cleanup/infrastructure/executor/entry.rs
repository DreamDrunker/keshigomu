use std::path::{Path, PathBuf};

use crate::cleanup::domain::error::CleanupError;
use crate::cleanup::domain::types::{
    CleanupExecutionEntry, CleanupFailedPath, CleanupStatus, ExecuteCleanupProjectResult,
};
use crate::cleanup::infrastructure::{inspector, planner};

use super::trash;

pub(super) fn execute_entry(
    dry_run: bool,
    entry: CleanupExecutionEntry,
    run_id: &str,
    safe_trash_root: &Path,
    planner_runtime: &planner::PlannerRuntime,
    inspector_runtime: &inspector::InspectionRuntime,
) -> ExecuteCleanupProjectResult {
    let CleanupExecutionEntry {
        project_id,
        selected_item_ids,
        safe_mode,
    } = entry;
    let safe_mode = safe_mode.unwrap_or(true);
    let (owned_item_ids, foreign_item_ids): (Vec<_>, Vec<_>) =
        selected_item_ids.into_iter().partition(|item_id| {
            item_id
                .rsplit_once(':')
                .is_some_and(|(project_key, _)| project_key == project_id)
        });
    let planner::CachedPlanItemsOutput {
        items,
        missing_item_ids,
    } = planner_runtime.resolve_selected_plan_items(
        inspector_runtime,
        &project_id,
        &owned_item_ids,
    );
    let initial_failed_paths = foreign_item_ids
        .into_iter()
        .map(|item_id| CleanupFailedPath {
            path: item_id,
            reason: CleanupError::ForeignProjectItem.to_string(),
        })
        .chain(
            missing_item_ids
                .into_iter()
                .map(|item_id| CleanupFailedPath {
                    path: item_id,
                    reason: CleanupError::MissingCleanupPlanItem.to_string(),
                }),
        )
        .collect::<Vec<_>>();
    let initial_failed_count = u32::try_from(initial_failed_paths.len()).unwrap_or(u32::MAX);
    let (released_bytes, removed_count, failed_count, removed_paths, failed_paths) =
        items.into_iter().fold(
            (
                0_u64,
                0_u32,
                initial_failed_count,
                Vec::<String>::new(),
                initial_failed_paths,
            ),
            |(bytes, count, failed, mut removed_paths, mut failed_paths), item| {
                let path = PathBuf::from(&item.path);
                if !path.exists() {
                    return (bytes, count, failed, removed_paths, failed_paths);
                }
                if dry_run {
                    removed_paths.push(item.path);
                    return (
                        bytes.saturating_add(item.estimated_size_bytes),
                        count.saturating_add(1),
                        failed,
                        removed_paths,
                        failed_paths,
                    );
                }

                match if safe_mode {
                    trash::move_to_safe_trash(&path, run_id, safe_trash_root)
                } else {
                    trash::remove_path(&path)
                } {
                    Ok(()) => {
                        removed_paths.push(item.path);
                        (
                            bytes.saturating_add(item.estimated_size_bytes),
                            count.saturating_add(1),
                            failed,
                            removed_paths,
                            failed_paths,
                        )
                    }
                    Err(error) => {
                        failed_paths.push(CleanupFailedPath {
                            path: item.path,
                            reason: format!("{error:#}"),
                        });
                        (
                            bytes,
                            count,
                            failed.saturating_add(1),
                            removed_paths,
                            failed_paths,
                        )
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
        project_id,
        released_bytes,
        removed_count,
        status,
        removed_paths,
        failed_paths,
    }
}
