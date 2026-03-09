use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Context;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use super::executor::ExecuteOutput;
use crate::cleanup::domain::types::{
    CleanupHistoryEntry, CleanupHistoryProjectDetail, CleanupResult, CleanupRunType, CleanupStatus,
    ExecuteCleanupProjectResult, ListCleanupHistoryRequest,
};

const HISTORY_FILE_NAME: &str = "cleanup-history.json";
const HISTORY_TEMP_FILE_NAME: &str = "cleanup-history.json.tmp";
const MAX_HISTORY_ENTRIES: usize = 500;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
struct CleanupHistoryState {
    #[serde(default)]
    last_auto_run_at: Option<u64>,
    #[serde(default)]
    entries: Vec<CleanupHistoryEntry>,
}

fn now_seconds() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn resolve_history_path(app: &AppHandle) -> CleanupResult<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("resolve cleanup history config directory")?;
    fs::create_dir_all(&config_dir)
        .with_context(|| format!("create cleanup history directory {}", config_dir.display()))?;
    Ok(config_dir.join(HISTORY_FILE_NAME))
}

fn read_state_from_path(path: &Path) -> CleanupResult<CleanupHistoryState> {
    if !path.exists() {
        return Ok(CleanupHistoryState::default());
    }
    let content = fs::read_to_string(path)
        .with_context(|| format!("read history file {}", path.display()))?;
    if content.trim().is_empty() {
        return Ok(CleanupHistoryState::default());
    }
    serde_json::from_str::<CleanupHistoryState>(&content)
        .with_context(|| format!("parse history file {}", path.display()))
}

fn write_state_to_path(path: &Path, state: &CleanupHistoryState) -> CleanupResult<()> {
    let temp_path = path.with_file_name(HISTORY_TEMP_FILE_NAME);
    let content = serde_json::to_string_pretty(state).context("serialize cleanup history")?;
    fs::write(&temp_path, content)
        .with_context(|| format!("write temporary history file {}", temp_path.display()))?;
    fs::rename(&temp_path, path).with_context(|| {
        format!(
            "replace history file {} with {}",
            path.display(),
            temp_path.display()
        )
    })
}

fn summarize_execution_status(results: &[ExecuteCleanupProjectResult]) -> CleanupStatus {
    let statuses = results
        .iter()
        .map(|result| result.status)
        .collect::<Vec<_>>();
    summarize_status_values(&statuses)
}

fn summarize_status_values(statuses: &[CleanupStatus]) -> CleanupStatus {
    if statuses.is_empty() {
        return CleanupStatus::Skipped;
    }
    if statuses
        .iter()
        .all(|status| *status == CleanupStatus::DryRun)
    {
        return CleanupStatus::DryRun;
    }
    if statuses
        .iter()
        .all(|status| *status == CleanupStatus::Success)
    {
        return CleanupStatus::Success;
    }
    if statuses
        .iter()
        .all(|status| *status == CleanupStatus::Failed)
    {
        return CleanupStatus::Failed;
    }
    if statuses
        .iter()
        .any(|status| *status == CleanupStatus::Partial || *status == CleanupStatus::Failed)
    {
        return CleanupStatus::Partial;
    }
    CleanupStatus::Success
}

fn summarize_project_detail_status(details: &[CleanupHistoryProjectDetail]) -> CleanupStatus {
    let statuses = details
        .iter()
        .map(|detail| detail.status)
        .collect::<Vec<_>>();
    summarize_status_values(&statuses)
}

pub fn last_auto_run_at(app: &AppHandle) -> CleanupResult<Option<u64>> {
    resolve_history_path(app)
        .and_then(|path| read_state_from_path(&path))
        .map(|state| state.last_auto_run_at)
}

pub fn mark_auto_run_now(app: &AppHandle) -> CleanupResult<u64> {
    let now = now_seconds();
    let path = resolve_history_path(app)?;
    let mut state = read_state_from_path(&path)?;
    state.last_auto_run_at = Some(now);
    write_state_to_path(&path, &state)?;
    Ok(now)
}

pub fn append_entry(app: &AppHandle, entry: CleanupHistoryEntry) -> CleanupResult<()> {
    let path = resolve_history_path(app)?;
    let mut state = read_state_from_path(&path)?;
    state.entries.insert(0, entry);
    state.entries.truncate(MAX_HISTORY_ENTRIES);
    write_state_to_path(&path, &state)
}

fn normalize_tag_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

fn parse_run_type_filter(value: Option<&str>) -> Option<CleanupRunType> {
    normalize_tag_filter(value).and_then(|filter| match filter.as_str() {
        "auto" => Some(CleanupRunType::Auto),
        "manual" => Some(CleanupRunType::Manual),
        _ => None,
    })
}

fn parse_status_filter(value: Option<&str>) -> Option<CleanupStatus> {
    normalize_tag_filter(value).and_then(|filter| match filter.as_str() {
        "dryrun" | "dry_run" | "dry-run" => Some(CleanupStatus::DryRun),
        "success" => Some(CleanupStatus::Success),
        "failed" => Some(CleanupStatus::Failed),
        "partial" => Some(CleanupStatus::Partial),
        "skipped" => Some(CleanupStatus::Skipped),
        _ => None,
    })
}

fn normalize_project_filter(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToString::to_string)
}

fn entry_matches_filters(
    entry: &CleanupHistoryEntry,
    run_type_filter: Option<CleanupRunType>,
    status_filter: Option<CleanupStatus>,
    project_id_filter: Option<&str>,
) -> bool {
    let matches_run_type = run_type_filter.is_none_or(|filter| entry.run_type == filter);
    let matches_status = status_filter.is_none_or(|filter| entry.status == filter);
    let matches_project = project_id_filter.is_none_or(|filter| {
        entry
            .project_details
            .iter()
            .any(|detail| detail.project_id == filter)
    });
    matches_run_type && matches_status && matches_project
}

fn filter_entries(
    entries: &[CleanupHistoryEntry],
    request: &ListCleanupHistoryRequest,
) -> Vec<CleanupHistoryEntry> {
    let run_type_filter = parse_run_type_filter(request.run_type.as_deref());
    let status_filter = parse_status_filter(request.status.as_deref());
    let project_id_filter = normalize_project_filter(request.project_id.as_deref());
    entries
        .iter()
        .filter(|entry| {
            entry_matches_filters(
                entry,
                run_type_filter,
                status_filter,
                project_id_filter.as_deref(),
            )
        })
        .map(|entry| {
            project_id_filter.as_deref().map_or_else(
                || entry.clone(),
                |project_id| {
                    let project_details = entry
                        .project_details
                        .iter()
                        .filter(|detail| detail.project_id == project_id)
                        .cloned()
                        .collect::<Vec<_>>();
                    let project_count = u32::try_from(project_details.len()).unwrap_or(u32::MAX);
                    let item_count = project_details
                        .iter()
                        .map(|detail| detail.removed_count)
                        .sum();
                    let released_bytes = project_details.iter().fold(0_u64, |sum, detail| {
                        sum.saturating_add(detail.released_bytes)
                    });
                    CleanupHistoryEntry {
                        project_count,
                        item_count,
                        released_bytes,
                        status: summarize_project_detail_status(&project_details),
                        project_details,
                        ..entry.clone()
                    }
                },
            )
        })
        .collect::<Vec<_>>()
}

pub fn list_entries(
    app: &AppHandle,
    request: &ListCleanupHistoryRequest,
) -> CleanupResult<(u32, Vec<CleanupHistoryEntry>)> {
    let state = resolve_history_path(app).and_then(|path| read_state_from_path(&path))?;
    let filtered_entries = filter_entries(&state.entries, request);
    let total = u32::try_from(filtered_entries.len()).unwrap_or(u32::MAX);
    if request.limit == 0 {
        return Ok((total, Vec::new()));
    }
    let start = usize::try_from(request.offset).unwrap_or(usize::MAX);
    if start >= filtered_entries.len() {
        return Ok((total, Vec::new()));
    }
    let take = usize::try_from(request.limit).unwrap_or(usize::MAX);
    let end = start.saturating_add(take).min(filtered_entries.len());
    Ok((total, filtered_entries[start..end].to_vec()))
}

pub fn history_entry_for_execution(
    output: &ExecuteOutput,
    run_type: CleanupRunType,
) -> CleanupHistoryEntry {
    CleanupHistoryEntry {
        run_id: output.run_id.clone(),
        executed_at: now_seconds().to_string(),
        run_type,
        project_count: u32::try_from(output.project_results.len()).unwrap_or(u32::MAX),
        item_count: output
            .project_results
            .iter()
            .map(|result| result.removed_count)
            .sum(),
        released_bytes: output.total_released_bytes,
        status: summarize_execution_status(&output.project_results),
        project_details: output
            .project_results
            .iter()
            .map(|result| CleanupHistoryProjectDetail {
                project_id: result.project_id.clone(),
                removed_count: result.removed_count,
                released_bytes: result.released_bytes,
                status: result.status,
                removed_paths: result.removed_paths.clone(),
                failed_paths: result.failed_paths.clone(),
            })
            .collect::<Vec<_>>(),
    }
}

#[cfg(test)]
mod tests {
    use super::{filter_entries, summarize_execution_status};
    use crate::cleanup::domain::types::{
        CleanupHistoryEntry, CleanupHistoryProjectDetail, CleanupRunType, CleanupStatus,
        ExecuteCleanupProjectResult, ListCleanupHistoryRequest,
    };

    fn make_history_entry(
        run_id: &str,
        run_type: CleanupRunType,
        status: CleanupStatus,
        project_ids: &[&str],
    ) -> CleanupHistoryEntry {
        CleanupHistoryEntry {
            run_id: run_id.to_string(),
            executed_at: "1".to_string(),
            run_type,
            project_count: u32::try_from(project_ids.len()).unwrap_or(u32::MAX),
            item_count: 1,
            released_bytes: 1,
            status,
            project_details: project_ids
                .iter()
                .map(|project_id| CleanupHistoryProjectDetail {
                    project_id: (*project_id).to_string(),
                    removed_count: 1,
                    released_bytes: 1,
                    status,
                    removed_paths: vec![],
                    failed_paths: vec![],
                })
                .collect::<Vec<_>>(),
        }
    }

    #[test]
    fn summarize_status_prefers_partial_on_mixed_results() {
        let results = vec![
            ExecuteCleanupProjectResult {
                project_id: "a".to_string(),
                released_bytes: 1,
                removed_count: 1,
                status: CleanupStatus::Success,
                removed_paths: vec![],
                failed_paths: vec![],
            },
            ExecuteCleanupProjectResult {
                project_id: "b".to_string(),
                released_bytes: 1,
                removed_count: 1,
                status: CleanupStatus::Failed,
                removed_paths: vec![],
                failed_paths: vec![],
            },
        ];
        assert_eq!(summarize_execution_status(&results), CleanupStatus::Partial);
    }

    #[test]
    fn summarize_status_returns_success_for_success_results() {
        let results = vec![ExecuteCleanupProjectResult {
            project_id: "a".to_string(),
            released_bytes: 1,
            removed_count: 1,
            status: CleanupStatus::Success,
            removed_paths: vec![],
            failed_paths: vec![],
        }];
        assert_eq!(summarize_execution_status(&results), CleanupStatus::Success);
    }

    #[test]
    fn filter_entries_supports_run_type_status_and_project_id() {
        let entries = vec![
            make_history_entry(
                "r1",
                CleanupRunType::Manual,
                CleanupStatus::Success,
                &["p1"],
            ),
            make_history_entry("r2", CleanupRunType::Auto, CleanupStatus::Partial, &["p2"]),
            make_history_entry(
                "r3",
                CleanupRunType::Auto,
                CleanupStatus::Failed,
                &["p1", "p3"],
            ),
        ];

        let run_type_filtered = filter_entries(
            &entries,
            &ListCleanupHistoryRequest {
                limit: 10,
                offset: 0,
                run_type: Some("auto".to_string()),
                status: None,
                project_id: None,
            },
        );
        assert_eq!(run_type_filtered.len(), 2);
        assert!(run_type_filtered
            .iter()
            .all(|entry| entry.run_type == CleanupRunType::Auto));

        let status_filtered = filter_entries(
            &entries,
            &ListCleanupHistoryRequest {
                limit: 10,
                offset: 0,
                run_type: None,
                status: Some("failed".to_string()),
                project_id: None,
            },
        );
        assert_eq!(status_filtered.len(), 1);
        assert_eq!(status_filtered[0].run_id, "r3");

        let project_filtered = filter_entries(
            &entries,
            &ListCleanupHistoryRequest {
                limit: 10,
                offset: 0,
                run_type: None,
                status: None,
                project_id: Some("p1".to_string()),
            },
        );
        assert_eq!(project_filtered.len(), 2);
        assert!(project_filtered.iter().any(|entry| entry.run_id == "r1"));
        assert!(project_filtered.iter().any(|entry| entry.run_id == "r3"));

        let combined_filtered = filter_entries(
            &entries,
            &ListCleanupHistoryRequest {
                limit: 10,
                offset: 0,
                run_type: Some("auto".to_string()),
                status: Some("failed".to_string()),
                project_id: Some("p1".to_string()),
            },
        );
        assert_eq!(combined_filtered.len(), 1);
        assert_eq!(combined_filtered[0].run_id, "r3");
        assert_eq!(combined_filtered[0].project_details.len(), 1);
        assert_eq!(combined_filtered[0].project_details[0].project_id, "p1");
        assert_eq!(combined_filtered[0].project_count, 1);
    }
}
