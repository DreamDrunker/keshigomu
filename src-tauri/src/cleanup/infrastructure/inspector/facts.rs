use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

use serde_json::Value;

use crate::cleanup::domain::types::ProjectKind;

use super::ProjectFacts;

const DEPENDENCY_SECTIONS: [&str; 3] = ["dependencies", "devDependencies", "peerDependencies"];

pub(super) fn collect_project_facts(
    project_path: &Path,
    project_kind: ProjectKind,
) -> ProjectFacts {
    let package_json = read_package_json(project_path);
    let package_scripts = package_json
        .as_ref()
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
        .unwrap_or_default();

    ProjectFacts {
        project_path: project_path.to_path_buf(),
        project_kind,
        package_json,
        cargo_toml: read_text(&project_path.join("Cargo.toml")),
        package_scripts,
    }
}

pub(super) fn read_text(path: &Path) -> Option<String> {
    fs::read_to_string(path).ok()
}

pub(super) fn first_existing_file(project_path: &Path, candidates: &[&str]) -> Option<PathBuf> {
    candidates
        .iter()
        .map(|candidate| project_path.join(candidate))
        .find(|path| path.is_file())
}

pub(super) fn json_string(value: &Value, path: &[&str]) -> Option<String> {
    path.iter()
        .try_fold(value, |cursor, key| cursor.get(*key))
        .and_then(|raw| raw.as_str().map(|text| text.trim().to_string()))
        .filter(|text| !text.is_empty())
}

pub(super) fn has_dep(package_json: &Value, dep_name: &str) -> bool {
    DEPENDENCY_SECTIONS
        .iter()
        .filter_map(|section| package_json.get(*section))
        .filter_map(|section| section.as_object())
        .any(|deps| deps.contains_key(dep_name))
}

fn read_package_json(project_path: &Path) -> Option<Value> {
    read_text(&project_path.join("package.json"))
        .and_then(|content| serde_json::from_str::<Value>(&content).ok())
}
