use crate::cleanup::domain::types::ProjectTechProfile;

use super::facts::{first_existing_file, has_dep, json_string};
use super::{
    ProjectFacts, StackSummary, MODERN_CONFIG_FILES, NEXT_CONFIG_FILES, RSPACK_CONFIG_FILES,
    UMI_CONFIG_FILES, VITE_CONFIG_FILES, WEBPACK_CONFIG_FILES,
};

const TS_CONFIG_FILES: &[&str] = &[
    "tsconfig.json",
    "tsconfig.app.json",
    "tsconfig.node.json",
    "tsconfig.base.json",
    "tsconfig.build.json",
];

pub(super) fn infer_stack(facts: &ProjectFacts) -> StackSummary {
    let package_managers = detect_package_managers(facts);
    let bundler = detect_bundler(facts);
    StackSummary {
        package_manager: package_managers[0].clone(),
        bundler: bundler.clone(),
        tech_profile: ProjectTechProfile {
            languages: detect_languages(facts),
            frameworks: detect_frameworks(facts),
            build_tools: detect_build_tools(&bundler),
            command_runner: detect_command_runner(facts, &package_managers),
        },
        package_managers,
    }
}

fn detect_package_managers(facts: &ProjectFacts) -> Vec<String> {
    let mut managers = Vec::<String>::new();
    push_unique_package_manager(
        &mut managers,
        facts
            .package_json
            .as_ref()
            .and_then(|value| json_string(value, &["packageManager"]))
            .map(|text| normalize_package_manager(&text)),
    );
    push_unique_package_manager(
        &mut managers,
        facts
            .project_path
            .join("pnpm-lock.yaml")
            .is_file()
            .then_some("pnpm".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        (facts.project_path.join("bun.lock").is_file()
            || facts.project_path.join("bun.lockb").is_file())
        .then_some("bun".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        (facts.project_path.join("package-lock.json").is_file()
            || facts.project_path.join("npm-shrinkwrap.json").is_file()
            || facts.project_path.join("yarn.lock").is_file())
        .then_some("npm".to_string()),
    );
    push_unique_package_manager(
        &mut managers,
        has_rust_workspace(facts).then_some("cargo".to_string()),
    );
    if !managers.is_empty() {
        return managers;
    }
    if facts.package_json.is_some() {
        return vec!["npm".to_string()];
    }
    vec!["unknown".to_string()]
}

fn detect_bundler(facts: &ProjectFacts) -> String {
    if first_existing_file(&facts.project_path, VITE_CONFIG_FILES).is_some()
        || facts
            .package_json
            .as_ref()
            .is_some_and(|value| has_dep(value, "vite"))
    {
        return "vite".to_string();
    }
    if first_existing_file(&facts.project_path, RSPACK_CONFIG_FILES).is_some()
        || facts
            .package_json
            .as_ref()
            .is_some_and(|value| has_dep(value, "@rspack/core") || has_dep(value, "rspack"))
    {
        return "rspack".to_string();
    }
    if first_existing_file(&facts.project_path, WEBPACK_CONFIG_FILES).is_some()
        || facts
            .package_json
            .as_ref()
            .is_some_and(|value| has_dep(value, "webpack"))
    {
        return "webpack".to_string();
    }
    if first_existing_file(&facts.project_path, UMI_CONFIG_FILES).is_some()
        || facts
            .package_json
            .as_ref()
            .is_some_and(|value| has_dep(value, "umi"))
    {
        return "umi".to_string();
    }
    if first_existing_file(&facts.project_path, MODERN_CONFIG_FILES).is_some()
        || facts.package_json.as_ref().is_some_and(|value| {
            has_dep(value, "@modern-js/app-tools") || has_dep(value, "@modern-js/runtime")
        })
    {
        return "modern".to_string();
    }
    if facts
        .package_json
        .as_ref()
        .is_some_and(|value| has_dep(value, "next"))
        || first_existing_file(&facts.project_path, NEXT_CONFIG_FILES).is_some()
    {
        return "next".to_string();
    }
    "unknown".to_string()
}

fn detect_languages(facts: &ProjectFacts) -> Vec<String> {
    let mut languages = Vec::<String>::new();
    if has_typescript_project(facts) {
        push_unique_label(&mut languages, "TypeScript");
    }
    if facts.package_json.is_some() && languages.is_empty() {
        push_unique_label(&mut languages, "JavaScript");
    }
    if has_rust_workspace(facts) {
        push_unique_label(&mut languages, "Rust");
    }
    if facts.project_path.join("pyproject.toml").is_file() {
        push_unique_label(&mut languages, "Python");
    }
    languages
}

fn detect_frameworks(facts: &ProjectFacts) -> Vec<String> {
    let mut frameworks = Vec::<String>::new();
    if let Some(framework) = detect_frontend_framework(facts) {
        push_unique_label(&mut frameworks, &framework);
    }
    if is_tauri_project(facts) {
        push_unique_label(&mut frameworks, "Tauri");
    }
    frameworks
}

fn detect_frontend_framework(facts: &ProjectFacts) -> Option<String> {
    let value = facts.package_json.as_ref()?;
    has_dep(value, "next")
        .then(|| "Next.js".to_string())
        .or_else(|| has_dep(value, "solid-js").then(|| "Solid".to_string()))
        .or_else(|| has_dep(value, "react").then(|| "React".to_string()))
        .or_else(|| has_dep(value, "vue").then(|| "Vue".to_string()))
        .or_else(|| has_dep(value, "svelte").then(|| "Svelte".to_string()))
}

fn has_typescript_project(facts: &ProjectFacts) -> bool {
    facts
        .package_json
        .as_ref()
        .is_some_and(|value| has_dep(value, "typescript"))
        || first_existing_file(&facts.project_path, TS_CONFIG_FILES).is_some()
}

fn detect_build_tools(bundler: &str) -> Vec<String> {
    match bundler {
        "vite" => vec!["Vite".to_string()],
        "rspack" => vec!["Rspack".to_string()],
        "webpack" => vec!["Webpack".to_string()],
        "umi" => vec!["Umi".to_string()],
        "modern" => vec!["Modern.js".to_string()],
        _ => Vec::new(),
    }
}

fn detect_command_runner(facts: &ProjectFacts, package_managers: &[String]) -> Option<String> {
    package_managers
        .iter()
        .find_map(|package_manager| match package_manager.as_str() {
            "bun" => Some("Bun".to_string()),
            "pnpm" => Some("pnpm".to_string()),
            "npm" => Some("npm".to_string()),
            "cargo" => Some("cargo".to_string()),
            _ => None,
        })
        .or_else(|| {
            facts
                .project_path
                .join("pyproject.toml")
                .is_file()
                .then(|| "Python".to_string())
        })
}

fn has_rust_workspace(facts: &ProjectFacts) -> bool {
    facts.project_path.join("Cargo.toml").is_file() || facts.project_path.join("src-tauri/Cargo.toml").is_file()
}

fn is_tauri_project(facts: &ProjectFacts) -> bool {
    facts.project_path.join("src-tauri/Cargo.toml").is_file()
        || facts.project_path.join("src-tauri/tauri.conf.json").is_file()
        || facts.project_path.join("src-tauri/tauri.conf.json5").is_file()
        || facts.package_scripts.contains_key("tauri")
        || facts.package_json.as_ref().is_some_and(|value| {
            has_dep(value, "@tauri-apps/api") || has_dep(value, "@tauri-apps/cli")
        })
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
    if value == "unknown" || managers.iter().any(|existing| existing == &value) {
        return;
    }
    managers.push(value);
}

fn push_unique_label(labels: &mut Vec<String>, value: &str) {
    if labels.iter().any(|existing| existing == value) {
        return;
    }
    labels.push(value.to_string());
}
