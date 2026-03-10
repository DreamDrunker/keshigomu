use std::fs;
use std::path::Path;

use crate::cleanup::domain::types::{
    BuildCleanupPlanRequest, CleanupPlanItem, ProjectCleanupPlan, ProjectKind,
};
use crate::cleanup::infrastructure::{inspector, size_estimator};

use super::{resolve, BuildPlanOutput, CachedPlanItemsOutput, PlannerRuntime};

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

impl PlannerRuntime {
    pub fn build_cleanup_plans_with_allowed_roots(
        &self,
        inspector_runtime: &inspector::InspectionRuntime,
        request: BuildCleanupPlanRequest,
        allowed_roots: &[std::path::PathBuf],
    ) -> BuildPlanOutput {
        let (projects_by_id, cached_plans_by_project_key) = {
            let cache = self.read_cache();
            (
                cache.projects_by_id.clone(),
                cache.plans_by_project_key.clone(),
            )
        };
        let normalized_allowed_roots = resolve::normalize_allowed_roots(allowed_roots);
        let (output, newly_built_plans) = request.project_ids.into_iter().fold(
            (
                BuildPlanOutput {
                    plans: Vec::new(),
                    missing_project_ids: Vec::new(),
                },
                Vec::<ProjectCleanupPlan>::new(),
            ),
            |(mut output, mut newly_built_plans), project_id| {
                if let Some(cached_plan) = cached_plans_by_project_key.get(&project_id).cloned() {
                    output.plans.push(cached_plan);
                    return (output, newly_built_plans);
                }
                if let Some(project_path) = resolve::resolve_project_path(
                    &project_id,
                    &projects_by_id,
                    &normalized_allowed_roots,
                ) {
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
                    return (output, newly_built_plans);
                }

                output.missing_project_ids.push(project_id.clone());
                output.plans.push(ProjectCleanupPlan {
                    project_id,
                    items: Vec::new(),
                });
                (output, newly_built_plans)
            },
        );

        {
            let mut cache = self.write_cache();
            newly_built_plans.iter().for_each(|plan| {
                cache
                    .plans_by_project_key
                    .insert(plan.project_id.clone(), plan.clone());
            });
        }
        self.remember_plan_items(&output.plans);
        output
    }

    pub fn resolve_selected_plan_items(
        &self,
        inspector_runtime: &inspector::InspectionRuntime,
        project_id: &str,
        selected_item_ids: &[String],
    ) -> CachedPlanItemsOutput {
        let mut resolved = self.resolve_plan_items(selected_item_ids);
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

        let refetched = self.resolve_plan_items(&resolved.missing_item_ids);
        resolved.items.extend(refetched.items);
        resolved.missing_item_ids = refetched.missing_item_ids;
        resolved
    }
}
