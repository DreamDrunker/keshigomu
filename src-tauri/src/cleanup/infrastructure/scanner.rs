use std::collections::{hash_map::DefaultHasher, HashSet};
use std::fs;
use std::hash::{Hash, Hasher};
use std::path::Path;

use serde_json::Value;

use crate::cleanup::domain::types::{
    DiscoveredProject, ProjectKind, ScanProjectsRequest, ScanRootInput,
};
use crate::cleanup::infrastructure::paths;

pub struct ScanProjectsOutput {
    pub accepted_roots: Vec<ScanRootInput>,
    pub projects: Vec<DiscoveredProject>,
    pub warnings: Vec<String>,
}

#[derive(Default)]
struct ScanTraversal {
    projects: Vec<DiscoveredProject>,
    warnings: Vec<String>,
}

#[derive(Default)]
struct DiscoverProjectsState {
    accepted_roots: Vec<ScanRootInput>,
    seen_roots: HashSet<String>,
    seen_projects: HashSet<String>,
    projects: Vec<DiscoveredProject>,
    warnings: Vec<String>,
}

impl DiscoverProjectsState {
    fn accept_root(mut self, root: ScanRootInput) -> Self {
        let trimmed_path = root.path.trim();
        if trimmed_path.is_empty() {
            return self;
        }

        let resolved_path = paths::resolve_path_from_user_input(trimmed_path);
        let normalized_depth = root.depth.max(1);
        let normalized_path = paths::canonicalize_or_path(&resolved_path);
        let normalized_path_text = normalized_path.to_string_lossy().into_owned();

        if !self.seen_roots.insert(normalized_path_text.clone()) {
            return self;
        }

        self.accepted_roots.push(ScanRootInput {
            path: normalized_path_text.clone(),
            depth: normalized_depth,
        });

        let traversal = scan_root(&normalized_path, normalized_depth, &normalized_path_text);
        self.warnings.extend(traversal.warnings);
        traversal.projects.into_iter().for_each(|project| {
            if self.seen_projects.insert(project.path.clone()) {
                self.projects.push(project);
            }
        });

        self
    }

    fn finish(self) -> ScanProjectsOutput {
        let mut projects = self.projects;
        projects.sort_by(|left, right| left.path.cmp(&right.path));
        ScanProjectsOutput {
            accepted_roots: self.accepted_roots,
            projects: classify_project_kinds(projects),
            warnings: self.warnings,
        }
    }
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
        .unwrap_or_else(|| path.to_string_lossy().into_owned())
}

fn detect_project(path: &Path) -> Option<DiscoveredProject> {
    let workspace_root = WORKSPACE_MARKER_FILES
        .iter()
        .any(|name| path.join(name).is_file());
    let git_root = path.join(".git").exists();
    let package_like = PACKAGE_MARKER_FILES
        .iter()
        .any(|name| path.join(name).is_file());
    if !workspace_root && !package_like {
        return None;
    }

    let normalized_path = paths::canonicalize_or_path(path);
    let path_text = normalized_path.to_string_lossy().into_owned();
    let project_name = project_name_from_package_json(&normalized_path)
        .unwrap_or_else(|| fallback_project_name(&normalized_path));
    let id = {
        let mut hasher = DefaultHasher::new();
        path_text.hash(&mut hasher);
        format!("project-{:x}", hasher.finish())
    };

    Some(DiscoveredProject {
        id,
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

fn classify_project_kinds(projects: Vec<DiscoveredProject>) -> Vec<DiscoveredProject> {
    let root_paths = projects
        .iter()
        .filter(|project| project.kind == ProjectKind::RepoRoot)
        .map(|project| project.path.clone())
        .collect::<Vec<_>>();

    projects
        .into_iter()
        .map(|project| DiscoveredProject {
            kind: if root_paths
                .iter()
                .any(|root_path| root_path == &project.path)
            {
                ProjectKind::RepoRoot
            } else if root_paths
                .iter()
                .any(|root_path| is_nested_project_path(&project.path, root_path))
            {
                ProjectKind::Package
            } else {
                ProjectKind::Single
            },
            ..project
        })
        .collect()
}

fn visit_directory(path: &Path, depth: u32, max_depth: u32) -> ScanTraversal {
    let initial = ScanTraversal {
        projects: detect_project(path).into_iter().collect(),
        warnings: Vec::new(),
    };
    if depth >= max_depth {
        return initial;
    }

    let entries = match fs::read_dir(path) {
        Ok(entries) => entries,
        Err(error) => {
            return ScanTraversal {
                warnings: vec![format!(
                    "failed to read directory {}: {}",
                    path.to_string_lossy(),
                    error
                )],
                ..initial
            };
        }
    };

    entries.fold(initial, |mut output, entry| {
        let entry = match entry {
            Ok(entry) => entry,
            Err(error) => {
                output.warnings.push(format!(
                    "failed to read directory entry under {}: {}",
                    path.to_string_lossy(),
                    error
                ));
                return output;
            }
        };
        let entry_path = entry.path();

        let file_type = match entry.file_type() {
            Ok(file_type) => file_type,
            Err(error) => {
                output.warnings.push(format!(
                    "failed to inspect entry {}: {}",
                    entry_path.to_string_lossy(),
                    error
                ));
                return output;
            }
        };
        if file_type.is_symlink() || !file_type.is_dir() {
            return output;
        }

        let entry_name = entry.file_name();
        let entry_name = entry_name.to_string_lossy();
        if SKIPPED_DIR_NAMES.contains(&entry_name.as_ref()) {
            return output;
        }

        let child = visit_directory(&entry_path, depth.saturating_add(1), max_depth);
        output.projects.extend(child.projects);
        output.warnings.extend(child.warnings);
        output
    })
}

fn scan_root(path: &Path, max_depth: u32, path_text: &str) -> ScanTraversal {
    if !path.exists() {
        return ScanTraversal {
            warnings: vec![format!("scan root does not exist: {path_text}")],
            ..ScanTraversal::default()
        };
    }
    if !path.is_dir() {
        return ScanTraversal {
            warnings: vec![format!("scan root is not a directory: {path_text}")],
            ..ScanTraversal::default()
        };
    }

    visit_directory(path, 0, max_depth)
}

pub fn discover_projects(request: ScanProjectsRequest) -> ScanProjectsOutput {
    request
        .roots
        .into_iter()
        .fold(DiscoverProjectsState::default(), |state, root| {
            state.accept_root(root)
        })
        .finish()
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
