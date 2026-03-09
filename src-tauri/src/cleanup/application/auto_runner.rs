use std::collections::HashMap;
use std::path::Path;

use tauri::AppHandle;

use crate::cleanup::domain::policy;
use crate::cleanup::domain::types::{
    BuildCleanupPlanRequest, CleanupExecutionEntry, CleanupPlanItem, CleanupResult, CleanupRunType,
    CleanupStatus, DiscoveredProject, ExecuteCleanupRequest, RunAutoCleanupRequest,
    ScanProjectsRequest, ScanRootInput,
};
use crate::cleanup::infrastructure::executor;
use crate::cleanup::infrastructure::history_store;
use crate::cleanup::infrastructure::inspector;
use crate::cleanup::infrastructure::scanner;
use crate::cleanup::CleanupState;
use crate::settings;
use crate::settings::types::AppSettings;

pub struct AutoCleanupOutput {
    pub triggered: bool,
    pub reason: String,
    pub run_id: Option<String>,
}

const SECONDS_PER_DAY: u64 = 86_400;

fn now_seconds() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_secs())
        .unwrap_or(0)
}

fn scan_request_from_settings(settings: &AppSettings) -> ScanProjectsRequest {
    ScanProjectsRequest {
        roots: settings
            .scan
            .roots
            .iter()
            .map(|root| ScanRootInput {
                path: root.path.clone(),
                depth: root.depth.max(1),
            })
            .collect::<Vec<_>>(),
    }
}

fn inactive_days_index(projects: &[DiscoveredProject]) -> HashMap<String, u32> {
    projects
        .iter()
        .map(|project| (project.id.clone(), project.inactive_days.unwrap_or(0)))
        .collect::<HashMap<_, _>>()
}

fn is_cache_item(item: &CleanupPlanItem) -> bool {
    item.category.as_deref().map_or_else(
        || item.path.to_ascii_lowercase().contains("cache"),
        |category| category.eq_ignore_ascii_case("cache"),
    )
}

fn should_select_auto_item(
    item: &CleanupPlanItem,
    effective_policy: &policy::EffectiveProjectPolicy,
    settings: &AppSettings,
) -> bool {
    policy::cleanup_item_is_low_risk(
        item.category.as_deref(),
        &item.path,
        &settings.cleanup.global_policy.risk_profile,
    ) && (!is_cache_item(item)
        || policy::cache_path_meets_mtime_threshold(Path::new(&item.path), effective_policy))
}

fn auto_cleanup_entries(
    state: &CleanupState,
    settings: &AppSettings,
    request: BuildCleanupPlanRequest,
    inactive_days_by_project: &HashMap<String, u32>,
) -> Vec<CleanupExecutionEntry> {
    state
        .planner
        .build_cleanup_plans_with_allowed_roots(&state.inspector, request, &[])
        .plans
        .into_iter()
        .filter_map(|plan| {
            let effective_policy =
                policy::resolve_effective_project_policy(settings, &plan.project_id);
            if !effective_policy.auto_cleanup_enabled {
                return None;
            }
            let inactive_days = inactive_days_by_project
                .get(&plan.project_id)
                .copied()
                .unwrap_or(0);
            if !policy::project_meets_inactive_threshold(inactive_days, &effective_policy) {
                return None;
            }
            let selected_item_ids = plan
                .items
                .into_iter()
                .filter(|item| should_select_auto_item(item, &effective_policy, settings))
                .map(|item| item.item_id)
                .collect::<Vec<_>>();
            if selected_item_ids.is_empty() {
                return None;
            }
            Some(CleanupExecutionEntry {
                safe_mode: Some(effective_policy.safe_mode),
                project_id: plan.project_id,
                selected_item_ids,
            })
        })
        .collect::<Vec<_>>()
}

fn due_for_auto_cleanup(
    request: RunAutoCleanupRequest,
    interval_days: u64,
    last_run: Option<u64>,
) -> bool {
    if request.force {
        return true;
    }
    let Some(last_run_at) = last_run else {
        return true;
    };
    let interval_seconds = interval_days.saturating_mul(SECONDS_PER_DAY);
    now_seconds() >= last_run_at.saturating_add(interval_seconds)
}

fn remaining_days(interval_days: u64, last_run: u64) -> u64 {
    let interval_seconds = interval_days.saturating_mul(SECONDS_PER_DAY);
    let next_run = last_run.saturating_add(interval_seconds);
    if now_seconds() >= next_run {
        return 0;
    }
    let remaining_seconds = next_run.saturating_sub(now_seconds());
    (remaining_seconds.saturating_add(SECONDS_PER_DAY - 1)) / SECONDS_PER_DAY
}

pub fn run_auto_cleanup(
    app: &AppHandle,
    state: &CleanupState,
    request: RunAutoCleanupRequest,
) -> CleanupResult<AutoCleanupOutput> {
    let Ok(_guard) = state.auto_cleanup_run_lock.try_lock() else {
        return Ok(AutoCleanupOutput {
            triggered: false,
            reason: "auto cleanup is already running".to_string(),
            run_id: None,
        });
    };

    let settings = settings::store::load_settings(app)?;
    if !settings.cleanup.auto_plan.enabled && !request.force {
        return Ok(AutoCleanupOutput {
            triggered: false,
            reason: "auto cleanup disabled".to_string(),
            run_id: None,
        });
    }

    let interval_days = u64::from(settings.cleanup.auto_plan.interval_days.max(1));
    let last_run = history_store::last_auto_run_at(app)?;
    if !due_for_auto_cleanup(request, interval_days, last_run) {
        let remaining = last_run.map_or(interval_days, |last_run_at| {
            remaining_days(interval_days, last_run_at)
        });
        return Ok(AutoCleanupOutput {
            triggered: false,
            reason: format!("next auto cleanup in {remaining} day(s)"),
            run_id: None,
        });
    }

    let scan_output = scanner::discover_projects(scan_request_from_settings(&settings));
    let projects = inspector::enrich_discovered_projects(&state.inspector, scan_output.projects);
    if projects.is_empty() {
        let _ = history_store::mark_auto_run_now(app);
        return Ok(AutoCleanupOutput {
            triggered: false,
            reason: "no projects discovered".to_string(),
            run_id: None,
        });
    }

    let inactive_days_by_project = inactive_days_index(&projects);
    state.planner.remember_discovered_projects(&projects);
    let entries = auto_cleanup_entries(
        state,
        &settings,
        BuildCleanupPlanRequest {
            project_ids: projects
                .iter()
                .map(|project| project.id.clone())
                .collect::<Vec<_>>(),
        },
        &inactive_days_by_project,
    );
    if entries.is_empty() {
        let _ = history_store::mark_auto_run_now(app);
        return Ok(AutoCleanupOutput {
            triggered: false,
            reason: "no low-risk cleanup items".to_string(),
            run_id: None,
        });
    }

    let executed_project_ids = entries
        .iter()
        .map(|entry| entry.project_id.clone())
        .collect::<Vec<_>>();
    let output = executor::execute_cleanup(
        app,
        &state.planner,
        &state.inspector,
        ExecuteCleanupRequest {
            dry_run: false,
            entries,
        },
    );
    state
        .planner
        .invalidate_project_plan_cache(&executed_project_ids);
    let entry = history_store::history_entry_for_execution(&output, CleanupRunType::Auto);
    let _ = history_store::append_entry(app, entry);
    let _ = history_store::mark_auto_run_now(app);

    let failed_projects = output
        .project_results
        .iter()
        .filter(|result| result.status == CleanupStatus::Failed)
        .count();
    let succeeded_projects = output.project_results.len().saturating_sub(failed_projects);

    Ok(AutoCleanupOutput {
        triggered: true,
        reason: format!(
            "executed auto cleanup: {succeeded_projects} succeeded, {failed_projects} failed",
        ),
        run_id: Some(output.run_id),
    })
}
