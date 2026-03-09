use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{RwLock, RwLockReadGuard, RwLockWriteGuard};

use super::inspector;
use super::size_estimator;
use crate::cleanup::domain::types::{
    BuildCleanupPlanRequest, CleanupPlanItem, DiscoveredProject, ProjectCleanupPlan, ProjectKind,
};

#[derive(Default)]
struct RuntimeScanCache {
    projects_by_id: HashMap<String, DiscoveredProject>,
    plan_items_by_id: HashMap<String, CleanupPlanItem>,
    plans_by_project_key: HashMap<String, ProjectCleanupPlan>,
}

impl RuntimeScanCache {
    fn remember_plan_items(&mut self, plans: &[ProjectCleanupPlan]) {
        for plan in plans {
            for item in &plan.items {
                self.plan_items_by_id
                    .insert(item.item_id.clone(), item.clone());
            }
        }
    }

    fn invalidate_projects(&mut self, project_ids: &[String]) {
        for project_id in project_ids {
            self.plans_by_project_key.remove(project_id);
        }
        self.plan_items_by_id.retain(|item_id, _| {
            project_ids
                .iter()
                .all(|project_id| !item_id.starts_with(&format!("{project_id}:")))
        });
    }

    fn resolve_plan_items(&self, item_ids: &[String]) -> CachedPlanItemsOutput {
        item_ids.iter().fold(
            CachedPlanItemsOutput {
                items: Vec::new(),
                missing_item_ids: Vec::new(),
            },
            |mut output, item_id| {
                self.plan_items_by_id.get(item_id).cloned().map_or_else(
                    || output.missing_item_ids.push(item_id.clone()),
                    |item| output.items.push(item),
                );
                output
            },
        )
    }
}

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
    cache: RwLock<RuntimeScanCache>,
}

impl PlannerRuntime {
    fn read_cache(&self) -> RwLockReadGuard<'_, RuntimeScanCache> {
        self.cache.read().unwrap_or_else(|poisoned| {
            eprintln!("[cleanup] planner cache lock poisoned; recovering");
            poisoned.into_inner()
        })
    }

    fn write_cache(&self) -> RwLockWriteGuard<'_, RuntimeScanCache> {
        self.cache.write().unwrap_or_else(|poisoned| {
            eprintln!("[cleanup] planner cache lock poisoned; recovering");
            poisoned.into_inner()
        })
    }
}

fn build_plan_for_project(
    inspector_runtime: &inspector::InspectionRuntime,
    project_id: String,
    project_path: &Path,
    project_kind: ProjectKind,
) -> ProjectCleanupPlan {
    let base_path = fs::canonicalize(project_path).unwrap_or_else(|_| project_path.to_path_buf());
    let profile =
        inspector::profile_for_project(inspector_runtime, &project_id).unwrap_or_else(|| {
            inspector::inspect_and_cache(inspector_runtime, &project_id, &base_path, project_kind)
        });
    let mut items = profile
        .path_hints
        .iter()
        .filter_map(|hint| {
            let candidate_path = base_path.join(&hint.relative_path);
            if !candidate_path.exists() {
                return None;
            }
            let normalized_candidate_path =
                fs::canonicalize(&candidate_path).unwrap_or_else(|_| candidate_path.clone());
            Some(CleanupPlanItem {
                item_id: format!("{project_id}:{}", hint.key),
                label: hint.label.clone(),
                path: normalized_candidate_path.to_string_lossy().to_string(),
                estimated_size_bytes: size_estimator::estimate_path_size_bytes(
                    &normalized_candidate_path,
                ),
                risk: hint.risk,
                recommended: hint.recommended,
                source: Some(hint.source.clone()),
                confidence: Some(hint.confidence),
                category: Some(hint.category.clone()),
            })
        })
        .collect::<Vec<_>>();
    items.sort_by(|left, right| right.estimated_size_bytes.cmp(&left.estimated_size_bytes));

    ProjectCleanupPlan { project_id, items }
}

fn normalize_allowed_roots(roots: &[PathBuf]) -> Vec<PathBuf> {
    roots
        .iter()
        .map(|root| fs::canonicalize(root).unwrap_or_else(|_| root.clone()))
        .collect::<Vec<_>>()
}

fn is_path_within_allowed_roots(path: &Path, allowed_roots: &[PathBuf]) -> bool {
    allowed_roots.is_empty()
        || allowed_roots
            .iter()
            .any(|root| path == root || path.starts_with(root))
}

fn resolve_project_path(
    project_id: &str,
    projects_by_id: &HashMap<String, DiscoveredProject>,
    allowed_roots: &[PathBuf],
) -> Option<PathBuf> {
    projects_by_id
        .get(project_id)
        .map(|project| {
            let raw_path = Path::new(&project.path);
            fs::canonicalize(raw_path).unwrap_or_else(|_| raw_path.to_path_buf())
        })
        .filter(|project_path| is_path_within_allowed_roots(project_path, allowed_roots))
        .or_else(|| {
            let as_path = PathBuf::from(project_id);
            if !as_path.exists() {
                return None;
            }
            let normalized_path = fs::canonicalize(&as_path).unwrap_or_else(|_| as_path.clone());
            is_path_within_allowed_roots(&normalized_path, allowed_roots).then_some(normalized_path)
        })
}

impl PlannerRuntime {
    pub fn remember_discovered_projects(&self, projects: &[DiscoveredProject]) {
        let mut cache = self.write_cache();
        cache.projects_by_id = projects
            .iter()
            .cloned()
            .map(|project| (project.id.clone(), project))
            .collect::<HashMap<_, _>>();
        cache.plan_items_by_id.clear();
        cache.plans_by_project_key.clear();
    }

    pub fn build_cleanup_plans_with_allowed_roots(
        &self,
        inspector_runtime: &inspector::InspectionRuntime,
        request: BuildCleanupPlanRequest,
        allowed_roots: &[PathBuf],
    ) -> BuildPlanOutput {
        let (projects_by_id, cached_plans_by_project_key) = {
            let cache = self.read_cache();
            (
                cache.projects_by_id.clone(),
                cache.plans_by_project_key.clone(),
            )
        };
        let normalized_allowed_roots = normalize_allowed_roots(allowed_roots);
        let mut output = BuildPlanOutput {
            plans: Vec::new(),
            missing_project_ids: Vec::new(),
        };
        let mut newly_built_plans = Vec::<ProjectCleanupPlan>::new();

        request.project_ids.into_iter().for_each(|project_id| {
            if let Some(cached_plan) = cached_plans_by_project_key.get(&project_id).cloned() {
                output.plans.push(cached_plan);
                return;
            }
            if let Some(project_path) =
                resolve_project_path(&project_id, &projects_by_id, &normalized_allowed_roots)
            {
                let project_kind = projects_by_id
                    .get(&project_id)
                    .map(|project| project.kind)
                    .unwrap_or(ProjectKind::Single);
                let plan = build_plan_for_project(
                    inspector_runtime,
                    project_id.clone(),
                    &project_path,
                    project_kind,
                );
                newly_built_plans.push(plan.clone());
                output.plans.push(plan);
                return;
            }

            output.missing_project_ids.push(project_id.clone());
            output.plans.push(ProjectCleanupPlan {
                project_id,
                items: Vec::new(),
            });
        });

        let mut cache = self.write_cache();
        for plan in &newly_built_plans {
            cache
                .plans_by_project_key
                .insert(plan.project_id.clone(), plan.clone());
        }
        cache.remember_plan_items(&output.plans);
        output
    }

    pub fn invalidate_project_plan_cache(&self, project_ids: &[String]) {
        if project_ids.is_empty() {
            return;
        }
        let unique_project_ids = project_ids
            .iter()
            .cloned()
            .collect::<HashSet<_>>()
            .into_iter()
            .collect::<Vec<_>>();
        self.write_cache().invalidate_projects(&unique_project_ids);
    }

    pub fn resolve_selected_plan_items(
        &self,
        inspector_runtime: &inspector::InspectionRuntime,
        project_id: &str,
        selected_item_ids: &[String],
    ) -> CachedPlanItemsOutput {
        let mut resolved = self.read_cache().resolve_plan_items(selected_item_ids);
        if resolved.missing_item_ids.is_empty() {
            return resolved;
        }

        self.build_cleanup_plans_with_allowed_roots(
            inspector_runtime,
            BuildCleanupPlanRequest {
                project_ids: vec![project_id.to_string()],
            },
            &[],
        );

        let refetched = self
            .read_cache()
            .resolve_plan_items(&resolved.missing_item_ids);
        resolved.items.extend(refetched.items);
        resolved.missing_item_ids = refetched.missing_item_ids;
        resolved
    }
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
        if let Some(parent) = path.parent() {
            let _ = fs::create_dir_all(parent);
        }
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
