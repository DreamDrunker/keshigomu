use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

use anyhow::Context;
use serde_json::Value;
use tauri::{AppHandle, Manager};

use super::error::SettingsError;
use super::types::{current_timestamp, AppSettings, ScanRoot, SettingsResult};

const SETTINGS_FILE_NAME: &str = "settings.json";
const SETTINGS_TEMP_FILE_NAME: &str = "settings.json.tmp";

fn resolve_settings_path(app: &AppHandle) -> SettingsResult<PathBuf> {
    let config_dir = app
        .path()
        .app_config_dir()
        .context("resolve settings config directory")?;
    fs::create_dir_all(&config_dir)
        .with_context(|| format!("create settings config directory {}", config_dir.display()))?;
    Ok(config_dir.join(SETTINGS_FILE_NAME))
}

fn write_settings(app: &AppHandle, settings: &AppSettings) -> SettingsResult<()> {
    let settings_path = resolve_settings_path(app)?;
    let temp_path = settings_path.with_file_name(SETTINGS_TEMP_FILE_NAME);
    let content = serde_json::to_string_pretty(settings).context("serialize settings")?;

    fs::write(&temp_path, content)
        .with_context(|| format!("write temporary settings file {}", temp_path.display()))?;
    fs::rename(&temp_path, &settings_path).with_context(|| {
        format!(
            "replace settings file {} with {}",
            settings_path.display(),
            temp_path.display()
        )
    })
}

fn normalize_settings(settings: &mut AppSettings) {
    settings.version = 1;
    settings.cleanup.global_policy.cleanup_threshold_days =
        settings.cleanup.global_policy.cleanup_threshold_days.max(1);
    settings.cleanup.auto_plan.interval_days = if settings.cleanup.auto_plan.interval_days == 0 {
        settings.cleanup.global_policy.cleanup_threshold_days
    } else {
        settings.cleanup.auto_plan.interval_days.max(1)
    };

    settings
        .cleanup
        .project_policies
        .values_mut()
        .for_each(|policy| {
            policy.inactive_threshold_days = policy.inactive_threshold_days.max(1);
            policy.cache_mtime_days = policy.cache_mtime_days.max(1);
        });

    let mut seen_paths = HashSet::new();
    settings.scan.roots = settings
        .scan
        .roots
        .clone()
        .into_iter()
        .filter(|root| !root.path.trim().is_empty())
        .filter(|root| seen_paths.insert(root.path.clone()))
        .map(|root| ScanRoot {
            path: root.path,
            depth: root.depth.max(1),
        })
        .collect();
}

fn read_settings(app: &AppHandle) -> SettingsResult<Option<AppSettings>> {
    let settings_path = resolve_settings_path(app)?;
    if !settings_path.exists() {
        return Ok(None);
    }

    let content = fs::read_to_string(&settings_path)
        .with_context(|| format!("read settings file {}", settings_path.display()))?;
    if content.trim().is_empty() {
        return Ok(None);
    }

    serde_json::from_str::<AppSettings>(&content)
        .with_context(|| format!("parse settings file {}", settings_path.display()))
        .map(Some)
}

fn merge_json(target: &mut Value, patch: &Value) {
    if let (Some(target_object), Some(patch_object)) = (target.as_object_mut(), patch.as_object()) {
        patch_object.iter().for_each(|(key, patch_value)| {
            if let Some(target_value) = target_object.get_mut(key) {
                merge_json(target_value, patch_value);
                return;
            }
            target_object.insert(key.clone(), patch_value.clone());
        });
        return;
    }
    *target = patch.clone();
}

pub fn load_settings(app: &AppHandle) -> SettingsResult<AppSettings> {
    if let Ok(Some(mut settings)) = read_settings(app) {
        normalize_settings(&mut settings);
        Ok(settings)
    } else {
        let settings = AppSettings::default();
        write_settings(app, &settings)?;
        Ok(settings)
    }
}

pub fn save_settings_patch(app: &AppHandle, patch: &Value) -> SettingsResult<AppSettings> {
    let current_settings = load_settings(app)?;
    let current_revision = current_settings.revision;
    let mut merged_value = serde_json::to_value(current_settings).context("serialize settings")?;

    merge_json(&mut merged_value, patch);

    let mut next_settings = serde_json::from_value::<AppSettings>(merged_value)
        .context("deserialize settings patch")?;
    next_settings.revision = current_revision.saturating_add(1);
    next_settings.updated_at = current_timestamp();
    normalize_settings(&mut next_settings);
    write_settings(app, &next_settings)?;
    Ok(next_settings)
}

pub fn reset_settings_section(app: &AppHandle, section: String) -> SettingsResult<AppSettings> {
    let mut current_settings = load_settings(app)?;
    let default_settings = AppSettings::default();

    match section.as_str() {
        "appearance" => current_settings.appearance = default_settings.appearance,
        "project" => current_settings.project = default_settings.project,
        "scan" => current_settings.scan = default_settings.scan,
        "cleanup" => current_settings.cleanup = default_settings.cleanup,
        _ => return Err(SettingsError::UnknownSettingsSection(section).into()),
    }

    current_settings.revision = current_settings.revision.saturating_add(1);
    current_settings.updated_at = current_timestamp();
    normalize_settings(&mut current_settings);
    write_settings(app, &current_settings)?;
    Ok(current_settings)
}

#[cfg(test)]
mod tests {
    use super::{merge_json, normalize_settings};
    use crate::cleanup::domain::types::CleanupRisk;
    use crate::settings::types::{
        AppSettings, CleanupProjectPolicyOverride, ScanRoot,
    };
    use serde_json::json;

    #[test]
    fn normalize_settings_clamps_thresholds_and_dedupes_scan_roots() {
        let mut settings = AppSettings::default();
        settings.version = 9;
        settings.cleanup.global_policy.cleanup_threshold_days = 0;
        settings.cleanup.auto_plan.interval_days = 0;
        settings.cleanup.project_policies.insert(
            "project-a".to_string(),
            CleanupProjectPolicyOverride {
                enabled: true,
                safe_mode: false,
                auto_cleanup_enabled: false,
                inactive_threshold_days: 0,
                cache_mtime_days: 0,
            },
        );
        settings.scan.roots = vec![
            ScanRoot {
                path: String::new(),
                depth: 0,
            },
            ScanRoot {
                path: "/tmp/code".to_string(),
                depth: 0,
            },
            ScanRoot {
                path: "/tmp/code".to_string(),
                depth: 9,
            },
            ScanRoot {
                path: "/tmp/work".to_string(),
                depth: 2,
            },
        ];

        normalize_settings(&mut settings);

        assert_eq!(settings.version, 1);
        assert_eq!(settings.cleanup.global_policy.cleanup_threshold_days, 1);
        assert_eq!(settings.cleanup.auto_plan.interval_days, 1);
        assert_eq!(
            settings.cleanup.project_policies["project-a"].inactive_threshold_days,
            1
        );
        assert_eq!(
            settings.cleanup.project_policies["project-a"].cache_mtime_days,
            1
        );
        assert_eq!(
            settings
                .scan
                .roots
                .iter()
                .map(|root| (root.path.as_str(), root.depth))
                .collect::<Vec<_>>(),
            vec![("/tmp/code", 1), ("/tmp/work", 2)]
        );
    }

    #[test]
    fn merge_json_merges_nested_objects_and_preserves_existing_keys() {
        let mut target = json!({
            "cleanup": {
                "autoPlan": {
                    "enabled": true,
                    "intervalDays": 30
                },
                "globalPolicy": {
                    "safeMode": true,
                    "riskProfile": {
                        "cache": "low",
                        "build": "low"
                    }
                }
            }
        });
        let patch = json!({
            "cleanup": {
                "autoPlan": {
                    "enabled": false
                },
                "globalPolicy": {
                    "riskProfile": {
                        "build": "medium"
                    }
                }
            }
        });

        merge_json(&mut target, &patch);

        assert_eq!(target["cleanup"]["autoPlan"]["enabled"], json!(false));
        assert_eq!(target["cleanup"]["autoPlan"]["intervalDays"], json!(30));
        assert_eq!(
            target["cleanup"]["globalPolicy"]["riskProfile"]["cache"],
            json!(CleanupRisk::Low)
        );
        assert_eq!(
            target["cleanup"]["globalPolicy"]["riskProfile"]["build"],
            json!(CleanupRisk::Medium)
        );
    }
}
