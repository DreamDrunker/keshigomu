use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::{Mutex, MutexGuard};
use std::time::UNIX_EPOCH;

use regex::Regex;
use serde_json::Value;

use super::size_estimator;
use crate::cleanup::domain::types::{
    CleanupRisk, DiscoveredProject, ProjectKind, ProjectStartupCommand,
};

const WORKSPACE_DISCOVERY_DEPTH: usize = 6;
const STARTUP_COMMAND_LIMIT: usize = 5;
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

fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

fn first_existing_file(project_path: &Path, candidates: &[&str]) -> Option<PathBuf> {
    candidates
        .iter()
        .map(|candidate| project_path.join(candidate))
        .find(|path| path.is_file())
}

fn read_package_json(project_path: &Path) -> Option<Value> {
    read_text(&project_path.join("package.json"))
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
}

fn should_skip_workspace_directory(name: &str) -> bool {
    SKIPPED_WORKSPACE_DIR_NAMES.contains(&name)
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

fn workspace_patterns_from_cargo_toml(project_path: &Path) -> Vec<String> {
    let cargo_toml = read_text(&project_path.join("Cargo.toml")).unwrap_or_default();
    if !cargo_toml.contains("[workspace]") {
        return Vec::new();
    }
    extract_by_pattern(
        &cargo_toml,
        r#"(?s)\[workspace\].*?members\s*=\s*\[(.*?)\]"#,
    )
    .map(|members| quoted_values(&members))
    .unwrap_or_default()
}

fn json_string(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |cursor, key| cursor.get(*key))
        .and_then(|raw| raw.as_str().map(|text| text.trim().to_string()))
        .filter(|text| !text.is_empty())
}

fn has_dep(package_json: &Value, dep_name: &str) -> bool {
    ["dependencies", "devDependencies", "peerDependencies"]
        .iter()
        .filter_map(|section| package_json.get(*section))
        .filter_map(|section| section.as_object())
        .any(|deps| deps.contains_key(dep_name))
}

fn normalize_package_manager(text: &str) -> String {
    let token = text.split('@').next().unwrap_or(text).trim().to_lowercase();
    if token == "pnpm" {
        return "pnpm".to_string();
    }
    if token == "bun" {
        return "bun".to_string();
    }
    if token == "npm" || token == "yarn" {
        return "npm".to_string();
    }
    if token == "cargo" {
        return "cargo".to_string();
    }
    "unknown".to_string()
}

fn push_unique_package_manager(managers: &mut Vec<String>, next: Option<String>) {
    let Some(value) = next else {
        return;
    };
    if value == "unknown" {
        return;
    }
    if managers.iter().any(|existing| existing == &value) {
        return;
    }
    managers.push(value);
}

fn detect_package_managers(project_path: &Path, package_json: Option<&Value>) -> Vec<String> {
    let mut managers = Vec::<String>::new();
    push_unique_package_manager(
        &mut managers,
        package_json
            .and_then(|value| json_string(value, &["packageManager"]))
            .map(|text| normalize_package_manager(&text)),
    );
    push_unique_package_manager(
        &mut managers,
        project_path
            .join("pnpm-lock.yaml")
            .is_file()
            .then_some("pnpm".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        (project_path.join("bun.lock").is_file() || project_path.join("bun.lockb").is_file())
            .then_some("bun".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        (project_path.join("package-lock.json").is_file()
            || project_path.join("npm-shrinkwrap.json").is_file()
            || project_path.join("yarn.lock").is_file())
        .then_some("npm".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        project_path
            .join("Cargo.toml")
            .is_file()
            .then_some("cargo".to_string()),
    );
    if !managers.is_empty() {
        return managers;
    }
    if package_json.is_some() {
        return vec!["npm".to_string()];
    }
    vec!["unknown".to_string()]
}

fn detect_bundler(project_path: &Path, package_json: Option<&Value>) -> String {
    let has_vite_config = first_existing_file(
        project_path,
        &[
            "vite.config.ts",
            "vite.config.js",
            "vite.config.mjs",
            "vite.config.cjs",
            "vite.config.mts",
            "vite.config.cts",
        ],
    )
    .is_some();
    let has_rspack_config = first_existing_file(
        project_path,
        &[
            "rspack.config.ts",
            "rspack.config.js",
            "rspack.config.mjs",
            "rspack.config.cjs",
        ],
    )
    .is_some();
    let has_webpack_config = first_existing_file(
        project_path,
        &[
            "webpack.config.ts",
            "webpack.config.js",
            "webpack.config.mjs",
            "webpack.config.cjs",
        ],
    )
    .is_some();
    let has_umi_config = first_existing_file(
        project_path,
        &[
            ".umirc.ts",
            ".umirc.js",
            ".umirc.mjs",
            ".umirc.cjs",
            "config/config.ts",
            "config/config.js",
            "config/config.mjs",
            "config/config.cjs",
        ],
    )
    .is_some();
    let has_modern_config = first_existing_file(
        project_path,
        &[
            "modern.config.ts",
            "modern.config.js",
            "modern.config.mjs",
            "modern.config.cjs",
        ],
    )
    .is_some();

    if has_vite_config || package_json.is_some_and(|value| has_dep(value, "vite")) {
        return "vite".to_string();
    }
    if has_rspack_config
        || package_json
            .is_some_and(|value| has_dep(value, "@rspack/core") || has_dep(value, "rspack"))
    {
        return "rspack".to_string();
    }
    if has_webpack_config || package_json.is_some_and(|value| has_dep(value, "webpack")) {
        return "webpack".to_string();
    }
    if has_umi_config || package_json.is_some_and(|value| has_dep(value, "umi")) {
        return "umi".to_string();
    }
    if has_modern_config
        || package_json.is_some_and(|value| {
            has_dep(value, "@modern-js/app-tools") || has_dep(value, "@modern-js/runtime")
        })
    {
        return "modern".to_string();
    }
    if package_json.is_some_and(|value| has_dep(value, "next"))
        || first_existing_file(
            project_path,
            &["next.config.js", "next.config.mjs", "next.config.ts"],
        )
        .is_some()
    {
        return "next".to_string();
    }
    "unknown".to_string()
}

fn detect_framework(package_json: Option<&Value>) -> String {
    let Some(value) = package_json else {
        return "unknown".to_string();
    };
    if has_dep(value, "solid-js") {
        return "solid".to_string();
    }
    if has_dep(value, "react") {
        return "react".to_string();
    }
    if has_dep(value, "vue") {
        return "vue".to_string();
    }
    if has_dep(value, "svelte") {
        return "svelte".to_string();
    }
    if has_dep(value, "next") {
        return "next".to_string();
    }
    "unknown".to_string()
}

fn detect_runtime(project_path: &Path, package_json: Option<&Value>) -> String {
    project_path
        .join("Cargo.toml")
        .is_file()
        .then_some("rust".to_string())
        .or_else(|| {
            project_path
                .join("pyproject.toml")
                .is_file()
                .then_some("python".to_string())
        })
        .or_else(|| {
            package_json
                .and_then(|value| json_string(value, &["engines", "node"]))
                .map(|node_version| format!("node {node_version}"))
        })
        .or_else(|| package_json.map(|_| "node".to_string()))
        .unwrap_or_else(|| "unknown".to_string())
}

fn package_scripts(package_json: Option<&Value>) -> HashMap<String, String> {
    package_json
        .and_then(|value| value.get("scripts"))
        .and_then(Value::as_object)
        .map(|scripts| {
            scripts
                .iter()
                .filter_map(|(name, raw)| {
                    raw.as_str()
                        .map(str::trim)
                        .filter(|command| !command.is_empty())
                        .map(|command| (name.clone(), command.to_string()))
                })
                .collect::<HashMap<_, _>>()
        })
        .unwrap_or_default()
}

fn preferred_script_runner(package_managers: &[String]) -> Option<&str> {
    package_managers.iter().find_map(|package_manager| {
        matches!(package_manager.as_str(), "bun" | "pnpm" | "npm")
            .then_some(package_manager.as_str())
    })
}

fn package_script_command(package_manager: &str, script: &str, args: &[&str]) -> String {
    let suffix = (!args.is_empty()).then(|| args.join(" "));
    match package_manager {
        "bun" => suffix.map_or_else(
            || format!("bun run {script}"),
            |suffix| format!("bun run {script} {suffix}"),
        ),
        "pnpm" => suffix.map_or_else(
            || format!("pnpm {script}"),
            |suffix| format!("pnpm {script} {suffix}"),
        ),
        "npm" => suffix.map_or_else(
            || format!("npm run {script}"),
            |suffix| format!("npm run {script} -- {suffix}"),
        ),
        _ => suffix.map_or_else(
            || format!("{package_manager} run {script}"),
            |suffix| format!("{package_manager} run {script} {suffix}"),
        ),
    }
}

fn has_same_script_body(
    scripts: &HashMap<String, String>,
    candidate_name: &str,
    reference_name: Option<&str>,
) -> bool {
    reference_name
        .and_then(|name| scripts.get(name))
        .zip(scripts.get(candidate_name))
        .is_some_and(|(left, right)| left == right)
}

fn find_script_name(
    scripts: &HashMap<String, String>,
    exact_names: &[&str],
    matcher: impl Fn(&str) -> bool,
) -> Option<String> {
    exact_names
        .iter()
        .find(|name| scripts.contains_key(**name))
        .map(|name| (*name).to_string())
        .or_else(|| {
            scripts
                .keys()
                .find_map(|name| matcher(name).then_some(name.clone()))
        })
}

fn push_startup_command(commands: &mut Vec<ProjectStartupCommand>, label: &str, command: String) {
    if commands.iter().any(|existing| existing.command == command) {
        return;
    }
    commands.push(ProjectStartupCommand {
        label: label.to_string(),
        command,
    });
}

fn has_runnable_cargo_target(project_path: &Path) -> bool {
    project_path.join("src/main.rs").is_file()
        || read_text(&project_path.join("Cargo.toml"))
            .is_some_and(|content| content.contains("[[bin]]") || content.contains("default-run"))
}

fn infer_startup_commands(
    project_path: &Path,
    package_json: Option<&Value>,
    package_managers: &[String],
) -> Vec<ProjectStartupCommand> {
    let scripts = package_scripts(package_json);
    let mut commands = Vec::new();

    if let Some(package_manager) =
        preferred_script_runner(package_managers).or_else(|| (!scripts.is_empty()).then_some("npm"))
    {
        scripts.contains_key("tauri").then(|| {
            push_startup_command(
                &mut commands,
                "桌面调试",
                package_script_command(package_manager, "tauri", &["dev"]),
            );
            push_startup_command(
                &mut commands,
                "桌面构建",
                package_script_command(package_manager, "tauri", &["build"]),
            );
        });

        let dev_script = find_script_name(&scripts, &["dev"], |name| {
            name.ends_with(":dev") && name != "tauri:dev"
        });
        dev_script.as_deref().map(|script_name| {
            push_startup_command(
                &mut commands,
                "本地开发",
                package_script_command(package_manager, script_name, &[]),
            )
        });

        let start_script = find_script_name(&scripts, &["start"], |name| {
            name.ends_with(":start") && name != "tauri:start"
        });
        start_script
            .as_deref()
            .filter(|script_name| {
                !has_same_script_body(&scripts, script_name, dev_script.as_deref())
            })
            .map(|script_name| {
                push_startup_command(
                    &mut commands,
                    "启动",
                    package_script_command(package_manager, script_name, &[]),
                )
            });

        find_script_name(&scripts, &["build"], |name| {
            name.ends_with(":build") && name != "tauri:build"
        })
        .as_deref()
        .map(|script_name| {
            push_startup_command(
                &mut commands,
                "构建",
                package_script_command(package_manager, script_name, &[]),
            )
        });

        find_script_name(&scripts, &["preview", "serve"], |name| {
            name.ends_with(":preview") || name.ends_with(":serve")
        })
        .as_deref()
        .map(|script_name| {
            push_startup_command(
                &mut commands,
                "预览",
                package_script_command(package_manager, script_name, &[]),
            )
        });
    }

    if commands.is_empty() && project_path.join("Cargo.toml").is_file() {
        has_runnable_cargo_target(project_path)
            .then(|| push_startup_command(&mut commands, "运行", "cargo run".to_string()));
        push_startup_command(&mut commands, "构建", "cargo build".to_string());
    }

    commands.truncate(STARTUP_COMMAND_LIMIT);
    commands
}

const SECONDS_PER_DAY: u64 = 86_400;

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn modified_seconds(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

fn is_nested_path(path: &Path, parent_path: &Path) -> bool {
    path != parent_path && path.starts_with(parent_path)
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

fn estimate_reclaimable_bytes(project_path: &Path, hints: &[PathHint]) -> u64 {
    let paths = existing_hint_paths(project_path, hints);
    if paths.is_empty() {
        return 0;
    }
    size_estimator::estimate_paths_size_bytes(&paths)
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

fn estimate_inactive_days(project_path: &Path) -> u32 {
    let latest_modified = git_last_commit_seconds(project_path)
        .or_else(|| {
            [
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
            ]
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

fn normalize_relative_path(text: &str) -> Option<String> {
    let normalized = text.trim().replace('\\', "/");
    if normalized.is_empty() {
        return None;
    }
    if normalized.starts_with('/') {
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

fn is_workspace_candidate(path: &Path) -> bool {
    [
        "package.json",
        "Cargo.toml",
        "pyproject.toml",
        "pnpm-workspace.yaml",
        "lerna.json",
        "nx.json",
        "turbo.json",
        "rush.json",
    ]
    .iter()
    .any(|name| path.join(name).is_file())
}

fn relative_project_path(project_path: &Path, nested_path: &Path) -> Option<String> {
    nested_path
        .strip_prefix(project_path)
        .ok()
        .and_then(|relative_path| normalize_relative_path(&relative_path.to_string_lossy()))
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

    let entries = match fs::read_dir(current_path) {
        Ok(entries) => entries,
        Err(_) => return,
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
        if should_skip_workspace_directory(&entry_name) {
            return;
        }

        let entry_path = entry.path();
        if is_workspace_candidate(&entry_path) {
            relative_project_path(project_path, &entry_path)
                .map(|relative_path| candidates.insert(relative_path));
        }
        collect_nested_workspace_candidates(
            project_path,
            &entry_path,
            depth.saturating_add(1),
            candidates,
        );
    });
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

fn infer_workspace_units(
    project_path: &Path,
    project_kind: ProjectKind,
    package_json: Option<&Value>,
) -> u32 {
    if project_kind != ProjectKind::RepoRoot {
        return 1;
    }

    let mut candidates = HashSet::new();
    collect_nested_workspace_candidates(project_path, project_path, 1, &mut candidates);
    if candidates.is_empty() {
        return 1;
    }

    let mut workspace_patterns = workspace_patterns_from_package_json(package_json);
    workspace_patterns_from_cargo_toml(project_path)
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

fn key_for_path(path: &str) -> String {
    path.chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() {
                ch.to_ascii_lowercase()
            } else {
                '-'
            }
        })
        .collect::<String>()
}

fn extract_by_pattern(content: &str, pattern: &str) -> Option<String> {
    Regex::new(pattern)
        .ok()
        .and_then(|regex| regex.captures(content))
        .and_then(|captures| captures.get(1).map(|value| value.as_str().to_string()))
}

fn is_editor_metadata_path(path: &str) -> bool {
    path.split('/')
        .any(|segment| segment == ".idea" || segment == ".vscode")
}

fn push_hint(hints: &mut Vec<PathHint>, hint: PathHint) {
    if hints
        .iter()
        .any(|existing| existing.relative_path == hint.relative_path)
    {
        return;
    }
    hints.push(hint);
}

#[allow(clippy::too_many_arguments)]
fn add_hint(
    hints: &mut Vec<PathHint>,
    relative_path: &str,
    label: &str,
    source: &str,
    confidence: u8,
    category: &str,
    risk: CleanupRisk,
    recommended: bool,
) {
    if let Some(path) = normalize_relative_path(relative_path) {
        if is_editor_metadata_path(&path) {
            return;
        }
        push_hint(
            hints,
            PathHint {
                key: key_for_path(&path),
                label: label.to_string(),
                relative_path: path,
                risk,
                recommended,
                source: source.to_string(),
                confidence,
                category: category.to_string(),
            },
        );
    }
}

fn add_vite_hints(project_path: &Path, package_json: Option<&Value>, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) = first_existing_file(
        project_path,
        &[
            "vite.config.ts",
            "vite.config.js",
            "vite.config.mjs",
            "vite.config.cjs",
            "vite.config.mts",
            "vite.config.cts",
        ],
    )
    .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(out_dir) = extract_by_pattern(&content, r#"outDir\s*:\s*["'`]([^"'`]+)["'`]"#) {
            add_hint(
                hints,
                &out_dir,
                "Vite 构建输出",
                &format!("{}:build.outDir", config_path.display()),
                95,
                "build",
                CleanupRisk::Low,
                true,
            );
        }
        if let Some(cache_dir) =
            extract_by_pattern(&content, r#"cacheDir\s*:\s*["'`]([^"'`]+)["'`]"#)
        {
            add_hint(
                hints,
                &cache_dir,
                "Vite 缓存目录",
                &format!("{}:cacheDir", config_path.display()),
                95,
                "cache",
                CleanupRisk::Low,
                true,
            );
        }
    }

    if let Some(out_dir) = package_json
        .and_then(|value| json_string(value, &["scripts", "build"]))
        .and_then(|script| extract_by_pattern(&script, r#"--outDir(?:=|\s+)([^\s"'`]+)"#))
    {
        add_hint(
            hints,
            &out_dir,
            "Vite 构建输出",
            "package.json:scripts.build",
            80,
            "build",
            CleanupRisk::Low,
            true,
        );
    }

    add_hint(
        hints,
        "dist",
        "Vite 默认构建目录",
        "convention:vite-default",
        60,
        "build",
        CleanupRisk::Low,
        true,
    );
    add_hint(
        hints,
        "node_modules/.vite",
        "Vite 预构建缓存",
        "convention:vite-default",
        60,
        "cache",
        CleanupRisk::Low,
        true,
    );
}

fn add_webpack_family_hints(project_path: &Path, bundler: &str, hints: &mut Vec<PathHint>) {
    let candidate_files = if bundler == "rspack" {
        vec![
            "rspack.config.ts",
            "rspack.config.js",
            "rspack.config.mjs",
            "rspack.config.cjs",
        ]
    } else {
        vec![
            "webpack.config.ts",
            "webpack.config.js",
            "webpack.config.mjs",
            "webpack.config.cjs",
        ]
    };

    if let Some((config_path, content)) = first_existing_file(project_path, &candidate_files)
        .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(out_dir) = extract_by_pattern(
            &content,
            r#"(?s)output\s*:\s*\{.*?path\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]"#,
        )
        .or_else(|| {
            extract_by_pattern(
                &content,
                r#"(?s)output\s*:\s*\{.*?path\s*:\s*["'`]([^"'`]+)["'`]"#,
            )
        }) {
            add_hint(
                hints,
                &out_dir,
                "构建输出目录",
                &format!("{}:output.path", config_path.display()),
                95,
                "build",
                CleanupRisk::Low,
                true,
            );
        }
        if let Some(cache_dir) = extract_by_pattern(
            &content,
            r#"cacheDirectory\s*:\s*(?:path\.resolve\([^,]+,\s*)?["'`]([^"'`]+)["'`]"#,
        ) {
            add_hint(
                hints,
                &cache_dir,
                "构建缓存目录",
                &format!("{}:cache.cacheDirectory", config_path.display()),
                90,
                "cache",
                CleanupRisk::Low,
                true,
            );
        }
    }

    add_hint(
        hints,
        "dist",
        "默认构建目录",
        &format!("convention:{bundler}-default"),
        55,
        "build",
        CleanupRisk::Low,
        true,
    );
    add_hint(
        hints,
        "node_modules/.cache",
        "构建工具缓存",
        &format!("convention:{bundler}-default"),
        55,
        "cache",
        CleanupRisk::Low,
        true,
    );
}

fn add_umi_hints(project_path: &Path, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) = first_existing_file(
        project_path,
        &[
            ".umirc.ts",
            ".umirc.js",
            ".umirc.mjs",
            ".umirc.cjs",
            "config/config.ts",
            "config/config.js",
            "config/config.mjs",
            "config/config.cjs",
        ],
    )
    .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(output_path) =
            extract_by_pattern(&content, r#"outputPath\s*:\s*["'`]([^"'`]+)["'`]"#)
                .or_else(|| {
                    extract_by_pattern(
                        &content,
                        r#"outputPath\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]\)"#,
                    )
                })
                .or_else(|| {
                    extract_by_pattern(&content, r#"outputPath\s*:\s*[^,\n]*["'`]([^"'`]+)["'`]"#)
                })
        {
            add_hint(
                hints,
                &output_path,
                "Umi 构建输出",
                &format!("{}:outputPath", config_path.display()),
                95,
                "build",
                CleanupRisk::Low,
                true,
            );
        }
    }

    add_hint(
        hints,
        "dist",
        "Umi 默认构建目录",
        "convention:umi-default",
        55,
        "build",
        CleanupRisk::Low,
        true,
    );
}

fn add_modern_hints(project_path: &Path, hints: &mut Vec<PathHint>) {
    if let Some((config_path, content)) = first_existing_file(
        project_path,
        &[
            "modern.config.ts",
            "modern.config.js",
            "modern.config.mjs",
            "modern.config.cjs",
        ],
    )
    .and_then(|config_path| read_text(&config_path).map(|content| (config_path, content)))
    {
        if let Some(output_path) =
            extract_by_pattern(&content, r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*["'`]([^"'`]+)["'`]"#)
            .or_else(|| {
                extract_by_pattern(
                    &content,
                    r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*path\.resolve\([^,]+,\s*["'`]([^"'`]+)["'`]\)"#,
                )
            })
            .or_else(|| {
                extract_by_pattern(
                    &content,
                    r#"(?s)distPath\s*:\s*\{.*?root\s*:\s*[^,\n]*["'`]([^"'`]+)["'`]"#,
                )
            })
        {
            add_hint(
                hints,
                &output_path,
                "Modern.js 构建输出",
                &format!("{}:output.distPath.root", config_path.display()),
                95,
                "build",
                CleanupRisk::Low,
                true,
            );
        }
    }

    add_hint(
        hints,
        "dist",
        "Modern.js 默认构建目录",
        "convention:modern-default",
        55,
        "build",
        CleanupRisk::Low,
        true,
    );
}

fn add_common_hints(hints: &mut Vec<PathHint>) {
    for (path, label, source, confidence, category, risk, recommended) in [
        (
            "coverage",
            "测试覆盖率目录",
            "convention:common",
            70_u8,
            "report",
            CleanupRisk::Low,
            true,
        ),
        (
            ".turbo",
            "Turborepo 缓存目录",
            "convention:common",
            70_u8,
            "cache",
            CleanupRisk::Low,
            true,
        ),
        (
            ".next/cache",
            "Next 缓存目录",
            "convention:common",
            65_u8,
            "cache",
            CleanupRisk::Low,
            true,
        ),
        (
            "dist",
            "通用构建目录 dist",
            "convention:common",
            60_u8,
            "build",
            CleanupRisk::Low,
            true,
        ),
        (
            "build",
            "通用构建目录 build",
            "convention:common",
            60_u8,
            "build",
            CleanupRisk::Low,
            true,
        ),
        (
            "out",
            "通用构建目录 out",
            "convention:common",
            55_u8,
            "build",
            CleanupRisk::Low,
            true,
        ),
        (
            "target",
            "Rust 构建目录",
            "convention:common",
            65_u8,
            "build",
            CleanupRisk::Low,
            false,
        ),
        (
            ".cache",
            "通用缓存目录",
            "convention:common",
            60_u8,
            "cache",
            CleanupRisk::Low,
            true,
        ),
        (
            "node_modules",
            "依赖目录",
            "convention:common",
            45_u8,
            "temp",
            CleanupRisk::Medium,
            false,
        ),
    ] {
        add_hint(
            hints,
            path,
            label,
            source,
            confidence,
            category,
            risk,
            recommended,
        );
    }
}

fn inspect_project(project_path: &Path, project_kind: ProjectKind) -> ProjectProfile {
    let package_json = read_package_json(project_path);
    let package_managers = detect_package_managers(project_path, package_json.as_ref());
    let package_manager = package_managers[0].clone();
    let bundler = detect_bundler(project_path, package_json.as_ref());
    let framework = detect_framework(package_json.as_ref());
    let runtime = detect_runtime(project_path, package_json.as_ref());
    let workspace_units = infer_workspace_units(project_path, project_kind, package_json.as_ref());
    let startup_commands =
        infer_startup_commands(project_path, package_json.as_ref(), &package_managers);

    let mut path_hints = Vec::<PathHint>::new();
    if bundler == "vite" {
        add_vite_hints(project_path, package_json.as_ref(), &mut path_hints);
    } else if bundler == "webpack" || bundler == "rspack" {
        add_webpack_family_hints(project_path, &bundler, &mut path_hints);
    } else if bundler == "umi" {
        add_umi_hints(project_path, &mut path_hints);
    } else if bundler == "modern" {
        add_modern_hints(project_path, &mut path_hints);
    } else if bundler == "next" {
        add_hint(
            &mut path_hints,
            ".next/cache",
            "Next.js 缓存目录",
            "convention:next-default",
            70,
            "cache",
            CleanupRisk::Low,
            true,
        );
        add_hint(
            &mut path_hints,
            ".next",
            "Next.js 构建输出",
            "convention:next-default",
            65,
            "build",
            CleanupRisk::Low,
            true,
        );
    }
    add_common_hints(&mut path_hints);

    ProjectProfile {
        package_manager,
        package_managers,
        bundler,
        framework,
        runtime,
        workspace_units,
        startup_commands,
        reclaimable_bytes: estimate_reclaimable_bytes(project_path, &path_hints),
        inactive_days: estimate_inactive_days(project_path),
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
        .map(|mut project| {
            let profile =
                inspect_and_cache(runtime, &project.id, Path::new(&project.path), project.kind);
            project.package_manager = Some(profile.package_manager);
            project.package_managers = Some(profile.package_managers);
            project.bundler = Some(profile.bundler);
            project.framework = Some(profile.framework);
            project.runtime = Some(profile.runtime);
            project.workspace_units = profile.workspace_units;
            project.startup_commands = profile.startup_commands;
            project.reclaimable_bytes = Some(profile.reclaimable_bytes);
            project.inactive_days = Some(profile.inactive_days);
            project
        })
        .collect::<Vec<_>>()
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
