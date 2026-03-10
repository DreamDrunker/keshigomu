use std::sync::RwLock;

use crate::cleanup::domain::types::{CleanupPlanItem, ProjectCleanupPlan};

mod cache;
mod plan;
mod resolve;

pub struct BuildPlanOutput {
    pub plans: Vec<ProjectCleanupPlan>,
    pub missing_project_ids: Vec<String>,
}

pub struct CachedPlanItemsOutput {
    pub items: Vec<CleanupPlanItem>,
    pub missing_item_ids: Vec<String>,
}

#[derive(Default)]
pub struct PlannerRuntime {
    cache: RwLock<cache::RuntimeScanCache>,
}

#[cfg(test)]
mod tests {
    use super::PlannerRuntime;
    use crate::cleanup::domain::types::{BuildCleanupPlanRequest, DiscoveredProject, ProjectKind};
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::time::{SystemTime, UNIX_EPOCH};

    fn test_temp_dir(name: &str) -> PathBuf {
        let stamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or(0);
        std::env::temp_dir().join(format!("keshigomu-{name}-{stamp}"))
    }

    fn write_file(path: &Path, size: usize) {
        path.parent().map(fs::create_dir_all);
        let _ = fs::write(path, vec![1_u8; size]);
    }

    #[test]
    fn build_plan_supports_path_input_without_scan_cache() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let project_dir = test_temp_dir("plan-path");
        let _ = fs::create_dir_all(&project_dir);
        write_file(&project_dir.join("dist/index.js"), 100);
        write_file(&project_dir.join("node_modules/pkg/index.js"), 50);
        write_file(&project_dir.join(".next/cache/data.bin"), 30);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        let item_paths = output.plans[0]
            .items
            .iter()
            .map(|item| item.path.clone())
            .collect::<Vec<_>>();
        assert!(item_paths
            .iter()
            .any(|item_path| item_path.ends_with("/dist")));
        assert!(item_paths
            .iter()
            .any(|item_path| item_path.ends_with("/node_modules")));
        assert!(item_paths
            .iter()
            .any(|item_path| item_path.ends_with("/.next/cache")));
    }

    #[test]
    fn build_plan_uses_last_scanned_project_cache() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let project_dir = test_temp_dir("plan-cache");
        let _ = fs::create_dir_all(&project_dir);
        write_file(&project_dir.join("coverage/lcov.info"), 80);
        write_file(&project_dir.join(".turbo/cache.bin"), 60);

        planner.remember_discovered_projects(&[DiscoveredProject {
            id: "project-test".to_string(),
            path: project_dir.to_string_lossy().to_string(),
            name: "project-test".to_string(),
            kind: ProjectKind::Single,
            reclaimable_bytes: None,
            inactive_days: None,
            package_manager: None,
            package_managers: None,
            bundler: None,
            framework: None,
            runtime: None,
            workspace_units: 1,
            startup_commands: Vec::new(),
        }]);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec!["project-test".to_string()],
            },
            &[],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.label.contains("覆盖率")));
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.label.contains("Turborepo")));
    }

    #[test]
    fn build_plan_detects_umi_output_path() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let project_dir = test_temp_dir("plan-umi");
        let _ = fs::create_dir_all(project_dir.join("config"));
        let _ = fs::write(
            project_dir.join("package.json"),
            r#"{"name":"faceapp","dependencies":{"umi":"^4.0.0"}}"#,
        );
        let _ = fs::write(
            project_dir.join("config/config.ts"),
            r#"export default { outputPath: "h5" }"#,
        );
        write_file(&project_dir.join("h5/index.html"), 16);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.path.ends_with("/h5")));
    }

    #[test]
    fn build_plan_detects_modern_output_root() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let project_dir = test_temp_dir("plan-modern");
        let _ = fs::create_dir_all(&project_dir);
        let _ = fs::write(
            project_dir.join("package.json"),
            r#"{"name":"repair-order-console","devDependencies":{"@modern-js/app-tools":"^2.68.17"}}"#,
        );
        let _ = fs::write(
            project_dir.join("modern.config.ts"),
            r#"export default { output: { distPath: { root: "roc", html: "html" } } }"#,
        );
        write_file(&project_dir.join("roc/html/index.html"), 16);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.path.ends_with("/roc")));
    }

    #[test]
    fn build_plan_excludes_editor_metadata_paths() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let project_dir = test_temp_dir("plan-editor-metadata");
        let _ = fs::create_dir_all(&project_dir);
        let _ = fs::write(
            project_dir.join("package.json"),
            r#"{"name":"demo","devDependencies":{"vite":"^6.0.0"}}"#,
        );
        let _ = fs::write(
            project_dir.join("vite.config.ts"),
            r#"export default { cacheDir: ".idea/vite", build: { outDir: "dist" } }"#,
        );
        write_file(&project_dir.join(".idea/vite/deps.txt"), 8);
        write_file(&project_dir.join("dist/index.js"), 16);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            &[],
        );

        let _ = fs::remove_dir_all(&project_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.path.ends_with("/dist")));
        assert!(!output.plans[0]
            .items
            .iter()
            .any(|item| item.path.contains("/.idea/") || item.path.ends_with("/.idea")));
    }

    #[test]
    fn build_plan_allows_path_input_within_allowed_scan_roots() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let root_dir = test_temp_dir("plan-allowed-root");
        let project_dir = root_dir.join("apps/demo");
        let _ = fs::create_dir_all(&project_dir);
        write_file(&project_dir.join("dist/index.js"), 64);

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_dir.to_string_lossy().to_string()],
            },
            std::slice::from_ref(&root_dir),
        );

        let _ = fs::remove_dir_all(&root_dir);

        assert_eq!(output.missing_project_ids.len(), 0);
        assert_eq!(output.plans.len(), 1);
        assert!(output.plans[0]
            .items
            .iter()
            .any(|item| item.path.ends_with("/dist")));
    }

    #[test]
    fn build_plan_rejects_path_input_outside_allowed_scan_roots() {
        let planner = PlannerRuntime::default();
        let inspector_runtime =
            crate::cleanup::infrastructure::inspector::InspectionRuntime::default();
        let allowed_root = test_temp_dir("plan-allowed");
        let outside_root = test_temp_dir("plan-outside");
        let _ = fs::create_dir_all(&allowed_root);
        let _ = fs::create_dir_all(&outside_root);
        write_file(&outside_root.join("dist/index.js"), 32);
        let outside_project_id = outside_root.to_string_lossy().to_string();

        let output = planner.build_cleanup_plans_with_allowed_roots(
            &inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![outside_project_id.clone()],
            },
            std::slice::from_ref(&allowed_root),
        );

        let _ = fs::remove_dir_all(&allowed_root);
        let _ = fs::remove_dir_all(&outside_root);

        assert_eq!(output.missing_project_ids, vec![outside_project_id.clone()]);
        assert_eq!(output.plans.len(), 1);
        assert_eq!(output.plans[0].project_id, outside_project_id);
        assert!(output.plans[0].items.is_empty());
    }
}
