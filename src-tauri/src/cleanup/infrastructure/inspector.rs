use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, MutexGuard};

use serde_json::Value;

use crate::cleanup::domain::types::{
    CleanupRisk, DiscoveredProject, ProjectKind, ProjectStartupCommand,
};

mod facts;
mod hints;
mod metrics;
mod stack;
mod startup;
mod workspace;

const STARTUP_COMMAND_LIMIT: usize = 5;
const WORKSPACE_DISCOVERY_DEPTH: usize = 6;
const SKIPPED_WORKSPACE_DIR_NAMES: [&str; 10] = [
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
const VITE_CONFIG_FILES: &[&str] = &[
    "vite.config.ts",
    "vite.config.js",
    "vite.config.mjs",
    "vite.config.cjs",
    "vite.config.mts",
    "vite.config.cts",
];
const RSPACK_CONFIG_FILES: &[&str] = &[
    "rspack.config.ts",
    "rspack.config.js",
    "rspack.config.mjs",
    "rspack.config.cjs",
];
const WEBPACK_CONFIG_FILES: &[&str] = &[
    "webpack.config.ts",
    "webpack.config.js",
    "webpack.config.mjs",
    "webpack.config.cjs",
];
const UMI_CONFIG_FILES: &[&str] = &[
    ".umirc.ts",
    ".umirc.js",
    ".umirc.mjs",
    ".umirc.cjs",
    "config/config.ts",
    "config/config.js",
    "config/config.mjs",
    "config/config.cjs",
];
const MODERN_CONFIG_FILES: &[&str] = &[
    "modern.config.ts",
    "modern.config.js",
    "modern.config.mjs",
    "modern.config.cjs",
];
const NEXT_CONFIG_FILES: &[&str] = &["next.config.js", "next.config.mjs", "next.config.ts"];
const WORKSPACE_CANDIDATE_FILES: &[&str] = &[
    "package.json",
    "Cargo.toml",
    "pyproject.toml",
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
    "rush.json",
];
const INACTIVE_DAY_PROBE_PATHS: &[&str] = &[
    "",
    ".git",
    ".git/index",
    ".git/HEAD",
    "package.json",
    "pnpm-lock.yaml",
    "bun.lock",
    "bun.lockb",
    "package-lock.json",
    "yarn.lock",
    "Cargo.toml",
    "Cargo.lock",
    "pyproject.toml",
    "src",
    "app",
    "packages",
    "crates",
];

#[derive(Clone, Copy)]
struct HintSeed {
    relative_path: &'static str,
    label: &'static str,
    source: &'static str,
    confidence: u8,
    category: &'static str,
    risk: CleanupRisk,
    recommended: bool,
}

const NEXT_HINT_SEEDS: &[HintSeed] = &[
    HintSeed {
        relative_path: ".next/cache",
        label: "Next.js 缓存目录",
        source: "convention:next-default",
        confidence: 70,
        category: "cache",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: ".next",
        label: "Next.js 构建输出",
        source: "convention:next-default",
        confidence: 65,
        category: "build",
        risk: CleanupRisk::Low,
        recommended: true,
    },
];

const COMMON_HINT_SEEDS: &[HintSeed] = &[
    HintSeed {
        relative_path: "coverage",
        label: "测试覆盖率目录",
        source: "convention:common",
        confidence: 70,
        category: "report",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: ".turbo",
        label: "Turborepo 缓存目录",
        source: "convention:common",
        confidence: 70,
        category: "cache",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: ".next/cache",
        label: "Next 缓存目录",
        source: "convention:common",
        confidence: 65,
        category: "cache",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: "dist",
        label: "通用构建目录 dist",
        source: "convention:common",
        confidence: 60,
        category: "build",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: "build",
        label: "通用构建目录 build",
        source: "convention:common",
        confidence: 60,
        category: "build",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: "out",
        label: "通用构建目录 out",
        source: "convention:common",
        confidence: 55,
        category: "build",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: "target",
        label: "Rust 构建目录",
        source: "convention:common",
        confidence: 65,
        category: "build",
        risk: CleanupRisk::Low,
        recommended: false,
    },
    HintSeed {
        relative_path: ".cache",
        label: "通用缓存目录",
        source: "convention:common",
        confidence: 60,
        category: "cache",
        risk: CleanupRisk::Low,
        recommended: true,
    },
    HintSeed {
        relative_path: "node_modules",
        label: "依赖目录",
        source: "convention:common",
        confidence: 45,
        category: "temp",
        risk: CleanupRisk::Medium,
        recommended: false,
    },
];

#[derive(Debug, Clone)]
pub struct PathHint {
    pub key: String,
    pub label: String,
    pub relative_path: String,
    pub risk: CleanupRisk,
    pub recommended: bool,
    pub source: String,
    pub confidence: u8,
    pub category: String,
}

#[derive(Debug, Clone)]
pub struct ProjectProfile {
    pub package_manager: String,
    pub package_managers: Vec<String>,
    pub bundler: String,
    pub framework: String,
    pub runtime: String,
    pub workspace_units: u32,
    pub startup_commands: Vec<ProjectStartupCommand>,
    pub reclaimable_bytes: u64,
    pub inactive_days: u32,
    pub path_hints: Vec<PathHint>,
}

struct ProjectFacts {
    project_path: PathBuf,
    project_kind: ProjectKind,
    package_json: Option<Value>,
    cargo_toml: Option<String>,
    package_scripts: HashMap<String, String>,
}

struct StackSummary {
    package_manager: String,
    package_managers: Vec<String>,
    bundler: String,
    framework: String,
    runtime: String,
}

#[derive(Default)]
struct InspectionCache {
    profiles_by_project_id: HashMap<String, ProjectProfile>,
}

#[derive(Default)]
pub struct InspectionRuntime {
    cache: Mutex<InspectionCache>,
}

impl InspectionRuntime {
    fn lock_cache(&self) -> MutexGuard<'_, InspectionCache> {
        self.cache.lock().unwrap_or_else(|poisoned| {
            eprintln!("[cleanup] inspector cache lock poisoned; recovering");
            poisoned.into_inner()
        })
    }
}

fn inspect_project(project_path: &Path, project_kind: ProjectKind) -> ProjectProfile {
    let facts = facts::collect_project_facts(project_path, project_kind);
    let stack = stack::infer_stack(&facts);
    let workspace_units = workspace::infer_workspace_units(&facts);
    let startup_commands = startup::infer_startup_commands(&facts, &stack);
    let path_hints = hints::infer_path_hints(&facts, &stack);

    ProjectProfile {
        package_manager: stack.package_manager,
        package_managers: stack.package_managers,
        bundler: stack.bundler,
        framework: stack.framework,
        runtime: stack.runtime,
        workspace_units,
        startup_commands,
        reclaimable_bytes: metrics::estimate_reclaimable_bytes(&facts.project_path, &path_hints),
        inactive_days: metrics::estimate_inactive_days(&facts.project_path),
        path_hints,
    }
}

pub fn inspect_and_cache(
    runtime: &InspectionRuntime,
    project_id: &str,
    project_path: &Path,
    project_kind: ProjectKind,
) -> ProjectProfile {
    let profile = inspect_project(project_path, project_kind);
    runtime
        .lock_cache()
        .profiles_by_project_id
        .insert(project_id.to_string(), profile.clone());
    profile
}

pub fn profile_for_project(
    runtime: &InspectionRuntime,
    project_id: &str,
) -> Option<ProjectProfile> {
    runtime
        .lock_cache()
        .profiles_by_project_id
        .get(project_id)
        .cloned()
}

pub fn enrich_discovered_projects(
    runtime: &InspectionRuntime,
    projects: Vec<DiscoveredProject>,
) -> Vec<DiscoveredProject> {
    projects
        .into_iter()
        .map(|project| {
            let profile =
                inspect_and_cache(runtime, &project.id, Path::new(&project.path), project.kind);
            DiscoveredProject {
                package_manager: Some(profile.package_manager),
                package_managers: Some(profile.package_managers),
                bundler: Some(profile.bundler),
                framework: Some(profile.framework),
                runtime: Some(profile.runtime),
                workspace_units: profile.workspace_units,
                startup_commands: profile.startup_commands,
                reclaimable_bytes: Some(profile.reclaimable_bytes),
                inactive_days: Some(profile.inactive_days),
                ..project
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::{enrich_discovered_projects, InspectionRuntime};
    use crate::cleanup::domain::types::{DiscoveredProject, ProjectKind};
    use std::fs;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    const TEST_UNKNOWN: &str = "unknown";

    fn test_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("keshigomu-{name}-{stamp}"))
    }

    fn test_project(path: &PathBuf, kind: ProjectKind) -> DiscoveredProject {
        DiscoveredProject {
            id: format!("project-{}", path.display()),
            path: path.to_string_lossy().to_string(),
            name: path
                .file_name()
                .map(|name| name.to_string_lossy().to_string())
                .unwrap_or_else(|| "project".to_string()),
            kind,
            reclaimable_bytes: None,
            inactive_days: None,
            package_manager: None,
            package_managers: None,
            bundler: None,
            framework: None,
            runtime: None,
            workspace_units: 1,
            startup_commands: Vec::new(),
        }
    }

    #[test]
    fn enrich_detects_cargo_for_rust_project() {
        let project_dir = test_temp_dir("inspect-rust");
        let _ = fs::create_dir_all(&project_dir);
        let _ = fs::write(
            project_dir.join("Cargo.toml"),
            "[package]\nname = \"sample\"\nversion = \"0.1.0\"\n",
        );
        let projects = vec![test_project(&project_dir, ProjectKind::Single)];
        let runtime = InspectionRuntime::default();
        let enriched = enrich_discovered_projects(&runtime, projects);

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(enriched.len(), 1);
        assert_eq!(enriched[0].package_manager.as_deref(), Some("cargo"));
        assert_eq!(
            enriched[0].package_managers.clone().unwrap_or_default(),
            vec!["cargo".to_string()]
        );
        assert_eq!(enriched[0].runtime.as_deref(), Some("rust"));
        assert_eq!(enriched[0].bundler.as_deref(), Some(TEST_UNKNOWN));
        assert_eq!(enriched[0].framework.as_deref(), Some(TEST_UNKNOWN));
        assert_eq!(enriched[0].workspace_units, 1);
        assert_eq!(
            enriched[0]
                .startup_commands
                .iter()
                .map(|command| command.command.as_str())
                .collect::<Vec<_>>(),
            vec!["cargo build"]
        );
    }

    #[test]
    fn enrich_infers_workspace_units_and_tauri_commands() {
        let project_dir = test_temp_dir("inspect-workspace");
        let _ = fs::create_dir_all(project_dir.join("apps/web"));
        let _ = fs::create_dir_all(project_dir.join("packages/ui"));
        let _ = fs::create_dir_all(project_dir.join("src-tauri"));
        let _ = fs::write(
            project_dir.join("package.json"),
            r#"{
  "name": "workspace-root",
  "packageManager": "bun@1.2.0",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "tauri": "tauri"
  },
  "dependencies": {
    "vite": "^6.0.0",
    "solid-js": "^1.9.0"
  }
}"#,
        );
        let _ = fs::write(project_dir.join("bun.lock"), "");
        let _ = fs::write(
            project_dir.join("apps/web/package.json"),
            r#"{"name":"@workspace/web"}"#,
        );
        let _ = fs::write(
            project_dir.join("packages/ui/package.json"),
            r#"{"name":"@workspace/ui"}"#,
        );
        let _ = fs::write(
            project_dir.join("src-tauri/Cargo.toml"),
            "[package]\nname = \"workspace-backend\"\nversion = \"0.1.0\"\n",
        );

        let runtime = InspectionRuntime::default();
        let enriched = enrich_discovered_projects(
            &runtime,
            vec![test_project(&project_dir, ProjectKind::RepoRoot)],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(enriched.len(), 1);
        assert_eq!(enriched[0].package_manager.as_deref(), Some("bun"));
        assert_eq!(enriched[0].bundler.as_deref(), Some("vite"));
        assert_eq!(enriched[0].framework.as_deref(), Some("solid"));
        assert_eq!(enriched[0].workspace_units, 2);
        assert_eq!(
            enriched[0]
                .startup_commands
                .iter()
                .map(|command| command.command.as_str())
                .collect::<Vec<_>>(),
            vec![
                "bun run tauri dev",
                "bun run tauri build",
                "bun run dev",
                "bun run build",
                "bun run preview",
            ]
        );
    }
}
