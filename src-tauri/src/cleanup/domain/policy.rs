use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;

use crate::cleanup::domain::types::{CleanupRisk, ProjectCleanupPlan};
use crate::settings::types::{AppSettings, CleanupRiskProfile};

#[derive(Debug, Clone)]
pub struct EffectiveProjectPolicy {
    pub safe_mode: bool,
    pub auto_cleanup_enabled: bool,
    pub inactive_threshold_days: u32,
    pub cache_mtime_days: u32,
}

const SECONDS_PER_DAY: u64 = 86_400;

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn normalize_days(days: u32) -> u32 {
    days.max(1)
}

fn normalize_path_for_risk(path: &str) -> String {
    path.replace('\\', "/").to_ascii_lowercase()
}

fn is_dependencies_path(path: &str) -> bool {
    path.ends_with("/node_modules") || path.contains("/node_modules/")
}

fn is_rust_target_path(path: &str) -> bool {
    path.ends_with("/target") || path.contains("/target/")
}

pub fn resolve_cleanup_item_risk(
    category: Option<&str>,
    path: &str,
    risk_profile: &CleanupRiskProfile,
) -> CleanupRisk {
    let normalized_path = normalize_path_for_risk(path);
    if is_dependencies_path(&normalized_path) {
        return risk_profile.dependencies;
    }
    if is_rust_target_path(&normalized_path) {
        return risk_profile.rust_target;
    }
    if category.is_some_and(|value| value.eq_ignore_ascii_case("cache")) {
        return risk_profile.cache;
    }
    if category.is_some_and(|value| value.eq_ignore_ascii_case("build")) {
        return risk_profile.build;
    }
    if category.is_some_and(|value| value.eq_ignore_ascii_case("report")) {
        return risk_profile.report;
    }
    risk_profile.temp
}

pub fn cleanup_item_is_low_risk(
    category: Option<&str>,
    path: &str,
    risk_profile: &CleanupRiskProfile,
) -> bool {
    resolve_cleanup_item_risk(category, path, risk_profile) == CleanupRisk::Low
}

pub fn apply_risk_profile_to_plans(
    plans: &mut [ProjectCleanupPlan],
    risk_profile: &CleanupRiskProfile,
) {
    for plan in plans {
        for item in &mut plan.items {
            item.risk =
                resolve_cleanup_item_risk(item.category.as_deref(), &item.path, risk_profile);
        }
    }
}

pub fn resolve_effective_project_policy(
    settings: &AppSettings,
    project_id: &str,
) -> EffectiveProjectPolicy {
    let global_days = normalize_days(settings.cleanup.global_policy.cleanup_threshold_days);
    settings
        .cleanup
        .project_policies
        .get(project_id)
        .filter(|policy| policy.enabled)
        .map(|policy| EffectiveProjectPolicy {
            safe_mode: policy.safe_mode,
            auto_cleanup_enabled: policy.auto_cleanup_enabled,
            inactive_threshold_days: normalize_days(policy.inactive_threshold_days),
            cache_mtime_days: normalize_days(policy.cache_mtime_days),
        })
        .unwrap_or(EffectiveProjectPolicy {
            safe_mode: settings.cleanup.global_policy.safe_mode,
            auto_cleanup_enabled: settings.cleanup.auto_plan.enabled,
            inactive_threshold_days: global_days,
            cache_mtime_days: global_days,
        })
}

pub fn project_meets_inactive_threshold(
    inactive_days: u32,
    policy: &EffectiveProjectPolicy,
) -> bool {
    inactive_days >= policy.inactive_threshold_days
}

fn modified_seconds(path: &Path) -> Option<u64> {
    fs::metadata(path)
        .ok()
        .and_then(|metadata| metadata.modified().ok())
        .and_then(|modified| modified.duration_since(UNIX_EPOCH).ok())
        .map(|duration| duration.as_secs())
}

pub fn cache_path_meets_mtime_threshold(path: &Path, policy: &EffectiveProjectPolicy) -> bool {
    modified_seconds(path).is_some_and(|modified_at| {
        let age_days = now_seconds().saturating_sub(modified_at) / SECONDS_PER_DAY;
        age_days >= u64::from(policy.cache_mtime_days)
    })
}

#[cfg(test)]
mod tests {
    use super::{
        apply_risk_profile_to_plans, cache_path_meets_mtime_threshold, cleanup_item_is_low_risk,
        project_meets_inactive_threshold, resolve_effective_project_policy,
    };
    use crate::cleanup::domain::types::{CleanupPlanItem, CleanupRisk, ProjectCleanupPlan};
    use crate::settings::types::{AppSettings, CleanupProjectPolicyOverride, CleanupRiskProfile};
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_temp_dir(name: &str) -> std::path::PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("keshigomu-policy-{name}-{stamp}"))
    }

    #[test]
    fn resolve_effective_policy_uses_global_defaults() {
        let settings = AppSettings::default();
        let policy = resolve_effective_project_policy(&settings, "missing-project");
        assert!(policy.safe_mode);
        assert!(policy.auto_cleanup_enabled);
        assert_eq!(policy.inactive_threshold_days, 30);
        assert_eq!(policy.cache_mtime_days, 30);
    }

    #[test]
    fn resolve_effective_policy_uses_enabled_project_override() {
        let mut settings = AppSettings::default();
        settings.cleanup.project_policies.insert(
            "project-1".to_string(),
            CleanupProjectPolicyOverride {
                enabled: true,
                safe_mode: false,
                auto_cleanup_enabled: false,
                inactive_threshold_days: 7,
                cache_mtime_days: 3,
            },
        );
        let policy = resolve_effective_project_policy(&settings, "project-1");
        assert!(!policy.safe_mode);
        assert!(!policy.auto_cleanup_enabled);
        assert_eq!(policy.inactive_threshold_days, 7);
        assert_eq!(policy.cache_mtime_days, 3);
    }

    #[test]
    fn project_threshold_check_respects_inactive_days() {
        let settings = AppSettings::default();
        let policy = resolve_effective_project_policy(&settings, "missing-project");
        assert!(!project_meets_inactive_threshold(10, &policy));
        assert!(project_meets_inactive_threshold(31, &policy));
    }

    #[test]
    fn cache_mtime_threshold_allows_old_paths_and_blocks_new_paths() {
        let dir = test_temp_dir("mtime");
        let _ = fs::create_dir_all(&dir);
        let file_path = dir.join("cache.bin");
        let _ = fs::write(&file_path, vec![1_u8; 4]);

        let mut settings = AppSettings::default();
        settings.cleanup.project_policies.insert(
            "project-1".to_string(),
            CleanupProjectPolicyOverride {
                enabled: true,
                safe_mode: true,
                auto_cleanup_enabled: true,
                inactive_threshold_days: 1,
                cache_mtime_days: 1,
            },
        );
        let policy = resolve_effective_project_policy(&settings, "project-1");
        assert!(!cache_path_meets_mtime_threshold(&file_path, &policy));

        let _ = fs::remove_file(&file_path);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn cleanup_item_risk_uses_global_profile() {
        let profile = CleanupRiskProfile {
            cache: CleanupRisk::Medium,
            build: CleanupRisk::Low,
            report: CleanupRisk::Low,
            temp: CleanupRisk::Medium,
            dependencies: CleanupRisk::Medium,
            rust_target: CleanupRisk::Low,
        };
        assert!(!cleanup_item_is_low_risk(
            Some("cache"),
            "/tmp/.cache",
            &profile
        ));
        assert!(cleanup_item_is_low_risk(
            Some("build"),
            "/tmp/dist",
            &profile
        ));
        assert!(!cleanup_item_is_low_risk(
            Some("temp"),
            "/tmp/node_modules",
            &profile
        ));
    }

    #[test]
    fn apply_risk_profile_rewrites_plan_risk() {
        let profile = CleanupRiskProfile {
            cache: CleanupRisk::Low,
            build: CleanupRisk::Low,
            report: CleanupRisk::Medium,
            temp: CleanupRisk::Low,
            dependencies: CleanupRisk::Medium,
            rust_target: CleanupRisk::Medium,
        };
        let mut plans = vec![ProjectCleanupPlan {
            project_id: "project-1".to_string(),
            items: vec![
                CleanupPlanItem {
                    item_id: "project-1:deps".to_string(),
                    label: "node_modules".to_string(),
                    path: "/tmp/project/node_modules".to_string(),
                    estimated_size_bytes: 1,
                    risk: CleanupRisk::Low,
                    recommended: false,
                    source: None,
                    confidence: None,
                    category: Some("temp".to_string()),
                },
                CleanupPlanItem {
                    item_id: "project-1:target".to_string(),
                    label: "target".to_string(),
                    path: "/tmp/project/target".to_string(),
                    estimated_size_bytes: 1,
                    risk: CleanupRisk::Low,
                    recommended: false,
                    source: None,
                    confidence: None,
                    category: Some("build".to_string()),
                },
            ],
        }];

        apply_risk_profile_to_plans(&mut plans, &profile);

        assert_eq!(plans[0].items[0].risk, CleanupRisk::Medium);
        assert_eq!(plans[0].items[1].risk, CleanupRisk::Medium);
    }
}
