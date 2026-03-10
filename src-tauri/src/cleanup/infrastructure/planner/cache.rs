use std::collections::{HashMap, HashSet};
use std::sync::{RwLockReadGuard, RwLockWriteGuard};

use crate::cleanup::domain::types::{CleanupPlanItem, DiscoveredProject, ProjectCleanupPlan};

use super::{CachedPlanItemsOutput, PlannerRuntime};

#[derive(Default)]
pub(super) struct RuntimeScanCache {
    pub(super) projects_by_id: HashMap<String, DiscoveredProject>,
    pub(super) plan_items_by_id: HashMap<String, CleanupPlanItem>,
    pub(super) plans_by_project_key: HashMap<String, ProjectCleanupPlan>,
}

impl RuntimeScanCache {
    fn remember_plan_items(&mut self, plans: &[ProjectCleanupPlan]) {
        plans.iter().for_each(|plan| {
            plan.items.iter().for_each(|item| {
                self.plan_items_by_id
                    .insert(item.item_id.clone(), item.clone());
            });
        });
    }

    fn invalidate_projects(&mut self, project_ids: &[String]) {
        project_ids.iter().for_each(|project_id| {
            self.plans_by_project_key.remove(project_id);
        });
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

impl PlannerRuntime {
    pub(super) fn read_cache(&self) -> RwLockReadGuard<'_, RuntimeScanCache> {
        self.cache.read().unwrap_or_else(|poisoned| {
            eprintln!("[cleanup] planner cache lock poisoned; recovering");
            poisoned.into_inner()
        })
    }

    pub(super) fn write_cache(&self) -> RwLockWriteGuard<'_, RuntimeScanCache> {
        self.cache.write().unwrap_or_else(|poisoned| {
            eprintln!("[cleanup] planner cache lock poisoned; recovering");
            poisoned.into_inner()
        })
    }

    pub(super) fn remember_plan_items(&self, plans: &[ProjectCleanupPlan]) {
        self.write_cache().remember_plan_items(plans);
    }

    pub(super) fn resolve_plan_items(&self, item_ids: &[String]) -> CachedPlanItemsOutput {
        self.read_cache().resolve_plan_items(item_ids)
    }

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
}
