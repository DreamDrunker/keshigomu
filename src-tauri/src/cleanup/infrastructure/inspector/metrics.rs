use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::UNIX_EPOCH;

use crate::cleanup::infrastructure::size_estimator;

use super::{PathHint, INACTIVE_DAY_PROBE_PATHS};

const SECONDS_PER_DAY: u64 = 86_400;

pub(super) fn estimate_reclaimable_bytes(project_path: &Path, hints: &[PathHint]) -> u64 {
    let paths = existing_hint_paths(project_path, hints);
    if paths.is_empty() {
        return 0;
    }
    size_estimator::estimate_paths_size_bytes(&paths)
}

pub(super) fn estimate_inactive_days(project_path: &Path) -> u32 {
    let latest_modified = git_last_commit_seconds(project_path)
        .or_else(|| {
            INACTIVE_DAY_PROBE_PATHS
                .iter()
                .map(|relative_path| {
                    if relative_path.is_empty() {
                        project_path.to_path_buf()
                    } else {
                        project_path.join(relative_path)
                    }
                })
                .filter(|path| path.exists())
                .filter_map(|path| modified_seconds(&path))
                .max()
                .or_else(|| modified_seconds(project_path))
        })
        .unwrap_or_else(now_seconds);

    u32::try_from((now_seconds().saturating_sub(latest_modified)) / SECONDS_PER_DAY)
        .unwrap_or(u32::MAX)
}

fn existing_hint_paths(project_path: &Path, hints: &[PathHint]) -> Vec<PathBuf> {
    let mut deduped = hints
        .iter()
        .map(|hint| project_path.join(&hint.relative_path))
        .filter(|path| path.exists())
        .map(|path| fs::canonicalize(&path).unwrap_or(path))
        .fold(Vec::<PathBuf>::new(), |mut paths, path| {
            if paths.iter().any(|existing| existing == &path) {
                return paths;
            }
            paths.push(path);
            paths
        });

    deduped.sort_by_key(|path| path.components().count());
    deduped
        .into_iter()
        .fold(Vec::<PathBuf>::new(), |mut paths, path| {
            if paths.iter().any(|existing| is_nested_path(&path, existing)) {
                return paths;
            }
            paths.push(path);
            paths
        })
}

fn git_last_commit_seconds(project_path: &Path) -> Option<u64> {
    let output = Command::new("git")
        .arg("-C")
        .arg(project_path)
        .arg("log")
        .arg("-1")
        .arg("--format=%ct")
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    String::from_utf8(output.stdout)
        .ok()
        .and_then(|text| text.trim().parse::<u64>().ok())
}

fn modified_seconds(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn is_nested_path(path: &Path, parent_path: &Path) -> bool {
    path != parent_path && path.starts_with(parent_path)
}
