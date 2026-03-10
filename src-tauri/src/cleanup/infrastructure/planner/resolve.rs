use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use crate::cleanup::domain::types::DiscoveredProject;

pub(super) fn normalize_allowed_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    roots
        .iter()
        .map(|root| fs::canonicalize(root).unwrap_or_else(|_| root.clone()))
        .collect::<Vec<_>>()
}

fn is_path_within_allowed_roots(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    allowed_roots.is_empty()
        || allowed_roots
            .iter()
            .any(|root| path == root || path.starts_with(root))
}

pub(super) fn resolve_project_path(
    project_id: &str,
    projects_by_id: &HashMap<String, DiscoveredProject>,
    allowed_roots: &[PathBuf],
) -> Option<PathBuf> {
    projects_by_id
        .get(project_id)
        .map(|project| {
            let raw_path = Path::new(&project.path);
            fs::canonicalize(raw_path).unwrap_or_else(|_| raw_path.to_path_buf())
        })
        .filter(|project_path| is_path_within_allowed_roots(project_path, allowed_roots))
        .or_else(|| {
            let as_path = PathBuf::from(project_id);
            if !as_path.exists() {
                return None;
            }
            let normalized_path = fs::canonicalize(&as_path).unwrap_or_else(|_| as_path.clone());
            is_path_within_allowed_roots(&normalized_path, allowed_roots).then_some(normalized_path)
        })
}
