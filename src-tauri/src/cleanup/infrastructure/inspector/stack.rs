use super::facts::{first_existing_file, has_dep, json_string};
use super::{
    ProjectFacts, StackSummary, MODERN_CONFIG_FILES, NEXT_CONFIG_FILES, RSPACK_CONFIG_FILES,
    UMI_CONFIG_FILES, VITE_CONFIG_FILES, WEBPACK_CONFIG_FILES,
};

pub(super) fn infer_stack(facts: &ProjectFacts) -> StackSummary {
    let package_managers = detect_package_managers(facts);
    StackSummary {
        package_manager: package_managers[0].clone(),
        bundler: detect_bundler(facts),
        framework: detect_framework(facts),
        runtime: detect_runtime(facts),
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
        facts
            .project_path
            .join("Cargo.toml")
            .is_file()
            .then_some("cargo".to_string()),
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

fn detect_framework(facts: &ProjectFacts) -> String {
    let Some(value) = facts.package_json.as_ref() else {
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

fn detect_runtime(facts: &ProjectFacts) -> String {
    facts
        .project_path
        .join("Cargo.toml")
        .is_file()
        .then_some("rust".to_string())
        .or_else(|| {
            facts
                .project_path
                .join("pyproject.toml")
                .is_file()
                .then_some("python".to_string())
        })
        .or_else(|| {
            facts
                .package_json
                .as_ref()
                .and_then(|value| json_string(value, &["engines", "node"]))
                .map(|node_version| format!("node {node_version}"))
        })
        .or_else(|| facts.package_json.as_ref().map(|_| "node".to_string()))
        .unwrap_or_else(|| "unknown".to_string())
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
