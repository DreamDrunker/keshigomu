use std::collections::BTreeMap;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::cleanup::domain::types::CleanupRisk;

pub type SettingsResult<T> = anyhow::Result<T>;

fn default_auto_cleanup_enabled() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub version: u32,
    pub revision: u64,
    pub updated_at: String,
    pub appearance: AppearanceSettings,
    pub project: ProjectSettings,
    pub scan: ScanSettings,
    pub cleanup: CleanupSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppearanceSettings {
    pub active_theme: String,
    pub custom_theme: BTreeMap<String, String>,
    pub custom_css_text: String,
    pub custom_css_file_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSettings {
    pub monorepo_mode: String,
    pub selected_project_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRoot {
    pub path: String,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanSettings {
    pub roots: Vec<ScanRoot>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupGlobalPolicy {
    pub safe_mode: bool,
    pub cleanup_threshold_days: u32,
    #[serde(default)]
    pub risk_profile: CleanupRiskProfile,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupRiskProfile {
    pub cache: CleanupRisk,
    pub build: CleanupRisk,
    pub report: CleanupRisk,
    pub temp: CleanupRisk,
    pub dependencies: CleanupRisk,
    pub rust_target: CleanupRisk,
}

impl Default for CleanupRiskProfile {
    fn default() -> Self {
        Self {
            cache: CleanupRisk::Low,
            build: CleanupRisk::Low,
            report: CleanupRisk::Low,
            temp: CleanupRisk::Low,
            dependencies: CleanupRisk::Medium,
            rust_target: CleanupRisk::Low,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupAutoPlan {
    pub enabled: bool,
    pub interval_days: u32,
}

impl Default for CleanupAutoPlan {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_days: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupProjectPolicyOverride {
    pub enabled: bool,
    pub safe_mode: bool,
    #[serde(default = "default_auto_cleanup_enabled")]
    pub auto_cleanup_enabled: bool,
    pub inactive_threshold_days: u32,
    pub cache_mtime_days: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupSettings {
    pub global_policy: CleanupGlobalPolicy,
    #[serde(default)]
    pub auto_plan: CleanupAutoPlan,
    pub project_policies: BTreeMap<String, CleanupProjectPolicyOverride>,
    pub project_plan_selections: BTreeMap<String, Vec<String>>,
}

pub(crate) fn current_timestamp() -> String {
    SystemTime::now().duration_since(UNIX_EPOCH).map_or_else(
        |_| "0".to_string(),
        |duration| duration.as_secs().to_string(),
    )
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            revision: 0,
            updated_at: current_timestamp(),
            appearance: AppearanceSettings {
                active_theme: "system".to_string(),
                custom_theme: BTreeMap::new(),
                custom_css_text: String::new(),
                custom_css_file_name: String::new(),
            },
            project: ProjectSettings {
                monorepo_mode: "repoRootOnly".to_string(),
                selected_project_id: String::new(),
            },
            scan: ScanSettings {
                roots: vec![
                    ScanRoot {
                        path: "~/Code".to_string(),
                        depth: 4,
                    },
                    ScanRoot {
                        path: "~/Work".to_string(),
                        depth: 3,
                    },
                    ScanRoot {
                        path: "/Volumes/Archive/Projects".to_string(),
                        depth: 2,
                    },
                ],
            },
            cleanup: CleanupSettings {
                global_policy: CleanupGlobalPolicy {
                    safe_mode: true,
                    cleanup_threshold_days: 30,
                    risk_profile: CleanupRiskProfile::default(),
                },
                auto_plan: CleanupAutoPlan {
                    enabled: true,
                    interval_days: 30,
                },
                project_policies: BTreeMap::new(),
                project_plan_selections: BTreeMap::new(),
            },
        }
    }
}
