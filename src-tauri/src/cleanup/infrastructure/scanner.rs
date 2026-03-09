use std::collections::{hash_map::DefaultHasher, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::cleanup::domain::types::{
    DiscoveredProject, ProjectKind, ScanProjectsRequest, ScanRootInput,
};

pub struct ScanProjectsOutput {
    pub accepted_roots: Vec<ScanRootInput>,
    pub projects: Vec<DiscoveredProject>,
    pub warnings: Vec<String>,
}

const SKIPPED_DIR_NAMES: [&str; 10] = [
    ".git",
    "node_modules",
    ".next",
    ".turbo",
    "target",
    "dist",
    "build",
    "coverage",
    ".idea",
    ".vscode",
];

const WORKSPACE_MARKER_FILES: [&str; 5] = [
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
    "rush.json",
];

const PACKAGE_MARKER_FILES: [&str; 3] = ["package.json", "Cargo.toml", "pyproject.toml"];

fn expand_home_path(path: &str) -> PathBuf {
    let home_dir = std::env::var("HOME").unwrap_or_default();
    if path == "~" {
        return PathBuf::from(home_dir);
    }
    if let Some(rest) = path.strip_prefix("~/") {
        return PathBuf::from(home_dir).join(rest);
    }
    PathBuf::from(path)
}

fn resolve_root_path(path: &str) -> PathBuf {
    let expanded_path = expand_home_path(path.trim());
    if expanded_path.is_absolute() {
        return expanded_path;
    }
    std::env::current_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
        .join(expanded_path)
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn normalize_existing_path(path: &Path) -> PathBuf {
    fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

fn project_id_for_path(path: &str) -> String {
    let mut hasher = DefaultHasher::new();
    path.hash(&mut hasher);
    format!("project-{:x}", hasher.finish())
}

fn file_exists(path: &Path, name: &str) -> bool {
    path.join(name).is_file()
}

fn is_workspace_root(path: &Path) -> bool {
    WORKSPACE_MARKER_FILES
        .iter()
        .any(|name| file_exists(path, name))
}

fn has_package_marker(path: &Path) -> bool {
    PACKAGE_MARKER_FILES
        .iter()
        .any(|name| file_exists(path, name))
}

fn project_name_from_package_json(path: &Path) -> Option<String> {
    let package_path = path.join("package.json");
    let content = fs::read_to_string(package_path).ok()?;
    let value = serde_json::from_str::<Value>(&content).ok()?;
    let name = value.get("name")?.as_str()?.trim();
    if name.is_empty() {
        return None;
    }
    Some(name.to_string())
}

fn fallback_project_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .filter(|name| !name.trim().is_empty())
        .unwrap_or_else(|| path_to_string(path))
}

fn detect_project(path: &Path) -> Option<DiscoveredProject> {
    let workspace_root = is_workspace_root(path);
    let git_root = path.join(".git").exists();
    let package_like = has_package_marker(path);
    if !workspace_root && !package_like {
        return None;
    }

    let normalized_path = normalize_existing_path(path);
    let path_text = path_to_string(&normalized_path);
    let project_name = project_name_from_package_json(&normalized_path)
        .unwrap_or_else(|| fallback_project_name(&normalized_path));

    Some(DiscoveredProject {
        id: project_id_for_path(&path_text),
        path: path_text,
        name: project_name,
        kind: if workspace_root || git_root {
            ProjectKind::RepoRoot
        } else {
            ProjectKind::Single
        },
        reclaimable_bytes: None,
        inactive_days: None,
        package_manager: None,
        package_managers: None,
        bundler: None,
        framework: None,
        runtime: None,
        workspace_units: 1,
        startup_commands: Vec::new(),
    })
}

fn is_nested_project_path(path: &str, parent_path: &str) -> bool {
    path != parent_path
        && path.starts_with(parent_path)
        && path
            .get(parent_path.len()..)
            .is_some_and(|suffix| suffix.starts_with('/'))
}

fn classify_project_kinds(projects: &mut [DiscoveredProject]) {
    let root_paths = projects
        .iter()
        .filter(|project| project.kind == ProjectKind::RepoRoot)
        .map(|project| project.path.clone())
        .collect::<Vec<_>>();

    for project in projects.iter_mut() {
        if root_paths
            .iter()
            .any(|root_path| root_path == &project.path)
        {
            project.kind = ProjectKind::RepoRoot;
            continue;
        }
        if root_paths
            .iter()
            .any(|root_path| is_nested_project_path(&project.path, root_path))
        {
            project.kind = ProjectKind::Package;
            continue;
        }
        project.kind = ProjectKind::Single;
    }
}

fn should_skip_directory(name: &str) -> bool {
    SKIPPED_DIR_NAMES.contains(&name)
}

fn visit_directory(
    path: &Path,
    depth: u32,
    max_depth: u32,
    seen_projects: &mut HashSet<String>,
    projects: &mut Vec<DiscoveredProject>,
    warnings: &mut Vec<String>,
) {
    if let Some(project) = detect_project(path) {
        if seen_projects.insert(project.path.clone()) {
            projects.push(project);
        }
    }
    if depth >= max_depth {
        return;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            warnings.push(format!(
                "failed to read directory {}: {}",
                path_to_string(path),
                error
            ));
            return;
        }
    };

    entries.for_each(|entry| {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                warnings.push(format!(
                    "failed to read directory entry under {}: {}",
                    path_to_string(path),
                    error
                ));
                return;
            }
        };

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                warnings.push(format!(
                    "failed to inspect entry {}: {}",
                    path_to_string(&entry.path()),
                    error
                ));
                return;
            }
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            return;
        }

        let entry_name = entry.file_name();
        let entry_name = entry_name.to_string_lossy();
        if should_skip_directory(&entry_name) {
            return;
        }

        visit_directory(
            &entry.path(),
            depth.saturating_add(1),
            max_depth,
            seen_projects,
            projects,
            warnings,
        );
    });
}

pub fn discover_projects(request: ScanProjectsRequest) -> ScanProjectsOutput {
    let mut accepted_roots = Vec::<ScanRootInput>::new();
    let mut seen_roots = HashSet::<String>::new();
    let mut seen_projects = HashSet::<String>::new();
    let mut projects = Vec::<DiscoveredProject>::new();
    let mut warnings = Vec::<String>::new();

    request.roots.into_iter().for_each(|root| {
        let trimmed_path = root.path.trim();
        if trimmed_path.is_empty() {
            return;
        }

        let resolved_path = resolve_root_path(trimmed_path);
        let normalized_depth = root.depth.max(1);
        let normalized_path = if resolved_path.exists() {
            normalize_existing_path(&resolved_path)
        } else {
            resolved_path
        };
        let normalized_path_text = path_to_string(&normalized_path);

        if !seen_roots.insert(normalized_path_text.clone()) {
            return;
        }

        accepted_roots.push(ScanRootInput {
            path: normalized_path_text.clone(),
            depth: normalized_depth,
        });

        if !normalized_path.exists() {
            warnings.push(format!("scan root does not exist: {normalized_path_text}"));
            return;
        }
        if !normalized_path.is_dir() {
            warnings.push(format!(
                "scan root is not a directory: {normalized_path_text}"
            ));
            return;
        }

        visit_directory(
            &normalized_path,
            0,
            normalized_depth,
            &mut seen_projects,
            &mut projects,
            &mut warnings,
        );
    });

    projects.sort_by(|left, right| left.path.cmp(&right.path));
    classify_project_kinds(&mut projects);

    ScanProjectsOutput {
        accepted_roots,
        projects,
        warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::discover_projects;
    use crate::cleanup::domain::types::{ProjectKind, ScanProjectsRequest, ScanRootInput};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("keshigomu-scan-{name}-{stamp}"))
    }

    #[test]
    fn discover_projects_marks_nested_package_kind() {
        let root = test_temp_dir("kinds");
        let _ = fs::create_dir_all(root.join(".git"));
        let _ = fs::create_dir_all(root.join("src-tauri"));
        let _ = fs::write(root.join("package.json"), r#"{"name":"tauri-app"}"#);
        let _ = fs::write(
            root.join("src-tauri/Cargo.toml"),
            "[package]\nname=\"backend\"\n",
        );

        let output = discover_projects(ScanProjectsRequest {
            roots: vec![ScanRootInput {
                path: root.to_string_lossy().to_string(),
                depth: 3,
            }],
        });

        let _ = fs::remove_dir_all(&root);

        assert_eq!(output.projects.len(), 2);
        let root_entry = output
            .projects
            .iter()
            .find(|project| project.name == "tauri-app")
            .expect("root project should exist");
        let backend_entry = output
            .projects
            .iter()
            .find(|project| project.path.ends_with("/src-tauri"))
            .expect("backend project should exist");
        assert_eq!(root_entry.kind, ProjectKind::RepoRoot);
        assert_eq!(backend_entry.kind, ProjectKind::Package);
    }
}
