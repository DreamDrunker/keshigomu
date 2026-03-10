use std::collections::HashSet;
use std::fs;
use std::path::Path;

use regex::Regex;
use serde_json::Value;

use crate::cleanup::domain::types::ProjectKind;

use super::{
    ProjectFacts, SKIPPED_WORKSPACE_DIR_NAMES, WORKSPACE_CANDIDATE_FILES, WORKSPACE_DISCOVERY_DEPTH,
};

pub(super) fn infer_workspace_units(facts: &ProjectFacts) -> u32 {
    if facts.project_kind != ProjectKind::RepoRoot {
        return 1;
    }

    let mut candidates = HashSet::new();
    collect_nested_workspace_candidates(
        &facts.project_path,
        &facts.project_path,
        1,
        &mut candidates,
    );
    if candidates.is_empty() {
        return 1;
    }

    let mut workspace_patterns = workspace_patterns_from_package_json(facts.package_json.as_ref());
    workspace_patterns_from_cargo_toml(facts.cargo_toml.as_deref())
        .into_iter()
        .for_each(|pattern| push_unique_string(&mut workspace_patterns, Some(pattern)));

    let scoped_count = if workspace_patterns.is_empty() {
        candidates.len()
    } else {
        let filtered = candidates
            .iter()
            .filter(|candidate| {
                workspace_patterns
                    .iter()
                    .any(|pattern| workspace_pattern_matches(pattern, candidate))
            })
            .count();
        if filtered == 0 {
            candidates.len()
        } else {
            filtered
        }
    };

    u32::try_from(scoped_count.max(1)).unwrap_or(u32::MAX)
}

fn workspace_patterns_from_package_json(package_json: Option<&Value>) -> Vec<String> {
    let Some(package_json) = package_json else {
        return Vec::new();
    };
    let mut patterns = Vec::new();
    package_json
        .get("workspaces")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(normalize_workspace_pattern)
        .for_each(|pattern| push_unique_string(&mut patterns, Some(pattern)));
    package_json
        .get("workspaces")
        .and_then(|workspaces| workspaces.get("packages"))
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter_map(normalize_workspace_pattern)
        .for_each(|pattern| push_unique_string(&mut patterns, Some(pattern)));
    patterns
}

fn workspace_patterns_from_cargo_toml(cargo_toml: Option<&str>) -> Vec<String> {
    let cargo_toml = cargo_toml.unwrap_or_default();
    if !cargo_toml.contains("[workspace]") {
        return Vec::new();
    }
    extract_by_pattern(cargo_toml, r#"(?s)\[workspace\].*?members\s*=\s*\[(.*?)\]"#)
        .map(|members| quoted_values(&members))
        .unwrap_or_default()
}

fn collect_nested_workspace_candidates(
    project_path: &Path,
    current_path: &Path,
    depth: usize,
    candidates: &mut HashSet<String>,
) {
    if depth > WORKSPACE_DISCOVERY_DEPTH {
        return;
    }

    let Ok(entries) = fs::read_dir(current_path) else {
        return;
    };

    entries.flatten().for_each(|entry| {
        let Ok(file_type) = entry.file_type() else {
            return;
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            return;
        }

        let entry_name = entry.file_name();
        let entry_name = entry_name.to_string_lossy();
        if SKIPPED_WORKSPACE_DIR_NAMES.contains(&entry_name.as_ref()) {
            return;
        }

        let entry_path = entry.path();
        if is_workspace_candidate(&entry_path) {
            if let Some(relative_path) = relative_project_path(project_path, &entry_path) {
                candidates.insert(relative_path);
            }
        }
        collect_nested_workspace_candidates(
            project_path,
            &entry_path,
            depth.saturating_add(1),
            candidates,
        );
    });
}

fn relative_project_path(project_path: &Path, nested_path: &Path) -> Option<String> {
    nested_path
        .strip_prefix(project_path)
        .ok()
        .and_then(|relative_path| normalize_relative_path(&relative_path.to_string_lossy()))
}

fn is_workspace_candidate(path: &Path) -> bool {
    WORKSPACE_CANDIDATE_FILES
        .iter()
        .any(|name| path.join(name).is_file())
}

fn workspace_pattern_matches(pattern: &str, relative_path: &str) -> bool {
    let pattern_segments = pattern
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    let path_segments = relative_path
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    glob_segments_match(&pattern_segments, &path_segments)
}

fn glob_segments_match(pattern: &[&str], path: &[&str]) -> bool {
    match pattern {
        [] => path.is_empty(),
        ["**", rest @ ..] => {
            (0..=path.len()).any(|index| glob_segments_match(rest, &path[index..]))
        }
        [segment, rest @ ..] => {
            !path.is_empty()
                && (*segment == "*" || *segment == path[0])
                && glob_segments_match(rest, &path[1..])
        }
    }
}

fn normalize_workspace_pattern(text: &str) -> Option<String> {
    let normalized = text.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') {
        return None;
    }
    let segments = normalized
        .trim_start_matches("./")
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() || segments.contains(&"..") {
        return None;
    }
    Some(segments.join("/"))
}

fn normalize_relative_path(text: &str) -> Option<String> {
    let normalized = text.trim().replace('\\', "/");
    if normalized.is_empty() || normalized.starts_with('/') {
        return None;
    }
    let segments = normalized
        .trim_start_matches("./")
        .split('/')
        .filter(|segment| !segment.is_empty())
        .collect::<Vec<_>>();
    if segments.is_empty() || segments.contains(&"..") {
        return None;
    }
    Some(segments.join("/"))
}

fn quoted_values(text: &str) -> Vec<String> {
    Regex::new(r#""([^"]+)"|'([^']+)'"#)
        .ok()
        .map(|regex| {
            regex
                .captures_iter(text)
                .filter_map(|captures| {
                    captures
                        .get(1)
                        .or_else(|| captures.get(2))
                        .map(|value| value.as_str())
                })
                .filter_map(normalize_workspace_pattern)
                .collect::<Vec<_>>()
        })
        .unwrap_or_default()
}

fn extract_by_pattern(content: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()
        .and_then(|regex| regex.captures(content))
        .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))
}

fn push_unique_string(values: &mut Vec<String>, next: Option<String>) {
    let Some(value) = next else {
        return;
    };
    if values.iter().any(|existing| existing == &value) {
        return;
    }
    values.push(value);
}
