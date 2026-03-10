use std::collections::HashMap;

use crate::cleanup::domain::types::ProjectStartupCommand;

use super::{ProjectFacts, StackSummary, STARTUP_COMMAND_LIMIT};

pub(super) fn infer_startup_commands(
    facts: &ProjectFacts,
    stack: &StackSummary,
) -> Vec<ProjectStartupCommand> {
    let scripts = &facts.package_scripts;
    let mut commands = Vec::new();

    if let Some(package_manager) = preferred_script_runner(&stack.package_managers)
        .or_else(|| (!scripts.is_empty()).then_some("npm"))
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

        let dev_script = find_script_name(&facts.package_scripts, &["dev"], |name| {
            name.ends_with(":dev") && name != "tauri:dev"
        });
        dev_script.as_deref().map(|script_name| {
            push_startup_command(
                &mut commands,
                "本地开发",
                package_script_command(package_manager, script_name, &[]),
            )
        });

        let start_script = find_script_name(&facts.package_scripts, &["start"], |name| {
            name.ends_with(":start") && name != "tauri:start"
        });
        start_script
            .as_deref()
            .filter(|script_name| {
                !has_same_script_body(&facts.package_scripts, script_name, dev_script.as_deref())
            })
            .map(|script_name| {
                push_startup_command(
                    &mut commands,
                    "启动",
                    package_script_command(package_manager, script_name, &[]),
                )
            });

        find_script_name(&facts.package_scripts, &["build"], |name| {
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

        find_script_name(&facts.package_scripts, &["preview", "serve"], |name| {
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

    if commands.is_empty() && facts.project_path.join("Cargo.toml").is_file() {
        has_runnable_cargo_target(facts)
            .then(|| push_startup_command(&mut commands, "运行", "cargo run".to_string()));
        push_startup_command(&mut commands, "构建", "cargo build".to_string());
    }

    commands.truncate(STARTUP_COMMAND_LIMIT);
    commands
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

fn has_runnable_cargo_target(facts: &ProjectFacts) -> bool {
    facts.project_path.join("src/main.rs").is_file()
        || facts
            .cargo_toml
            .as_deref()
            .is_some_and(|content| content.contains("[[bin]]") || content.contains("default-run"))
}
