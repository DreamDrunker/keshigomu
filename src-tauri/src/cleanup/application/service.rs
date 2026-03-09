use std::path::PathBuf;

use anyhow::Context;
use tauri::AppHandle;

use super::auto_runner;
use crate::cleanup::domain::error::CleanupError;
use crate::cleanup::domain::policy;
use crate::cleanup::domain::types::{
    BuildCleanupPlanRequest, BuildCleanupPlanResponse, CleanupExecutionEntry, CleanupResult,
    CleanupRunType, CommandMeta, ExecuteCleanupRequest, ExecuteCleanupResponse,
    ListCleanupHistoryRequest, ListCleanupHistoryResponse, RunAutoCleanupRequest,
    RunAutoCleanupResponse, ScanProjectsRequest, ScanProjectsResponse,
};
use crate::cleanup::infrastructure::executor;
use crate::cleanup::infrastructure::history_store;
use crate::cleanup::infrastructure::inspector;
use crate::cleanup::infrastructure::scanner;
use crate::cleanup::CleanupState;
use crate::settings;

const SCAN_PROJECTS_MESSAGE: &str = "scan projects implemented";
const BUILD_CLEANUP_PLAN_MESSAGE: &str = "build cleanup plan implemented";
const EXECUTE_CLEANUP_MESSAGE: &str = "execute cleanup implemented";
const RUN_AUTO_CLEANUP_MESSAGE: &str = "auto cleanup implemented";
const LIST_CLEANUP_HISTORY_MESSAGE: &str = "list cleanup history implemented";

pub struct CleanupApplication<'a> {
    app: &'a AppHandle,
    state: &'a CleanupState,
}

impl<'a> CleanupApplication<'a> {
    pub fn new(app: &'a AppHandle, state: &'a CleanupState) -> Self {
        Self { app, state }
    }

    pub fn scan_projects(&self, request: ScanProjectsRequest) -> ScanProjectsResponse {
        let output = scanner::discover_projects(request);
        let projects =
            inspector::enrich_discovered_projects(&self.state.inspector, output.projects);
        self.state.planner.remember_discovered_projects(&projects);
        ScanProjectsResponse {
            meta: CommandMeta {
                implemented: true,
                message: SCAN_PROJECTS_MESSAGE.to_string(),
            },
            accepted_roots: output.accepted_roots,
            projects,
            warnings: output.warnings,
        }
    }

    pub fn build_cleanup_plan(
        &self,
        request: BuildCleanupPlanRequest,
    ) -> CleanupResult<BuildCleanupPlanResponse> {
        let allowed_roots = self.allowed_scan_roots()?;
        let mut output = self.state.planner.build_cleanup_plans_with_allowed_roots(
            &self.state.inspector,
            request,
            &allowed_roots,
        );
        let risk_profile = settings::store::load_settings(self.app)
            .context("load settings for risk profile")?
            .cleanup
            .global_policy
            .risk_profile;
        policy::apply_risk_profile_to_plans(&mut output.plans, &risk_profile);
        let message = if output.missing_project_ids.is_empty() {
            BUILD_CLEANUP_PLAN_MESSAGE.to_string()
        } else {
            format!(
                "{BUILD_CLEANUP_PLAN_MESSAGE}; {} project ids not found in scan cache",
                output.missing_project_ids.len()
            )
        };

        Ok(BuildCleanupPlanResponse {
            meta: CommandMeta {
                implemented: true,
                message,
            },
            plans: output.plans,
        })
    }

    pub fn execute_cleanup(
        &self,
        request: ExecuteCleanupRequest,
    ) -> CleanupResult<ExecuteCleanupResponse> {
        let entries = self.resolve_execution_entries(request.entries)?;
        let executed_project_ids = entries
            .iter()
            .map(|entry| entry.project_id.clone())
            .collect::<Vec<_>>();
        let output = executor::execute_cleanup(
            self.app,
            &self.state.planner,
            &self.state.inspector,
            ExecuteCleanupRequest {
                dry_run: request.dry_run,
                entries,
            },
        );
        self.state
            .planner
            .invalidate_project_plan_cache(&executed_project_ids);
        history_store::append_entry(
            self.app,
            history_store::history_entry_for_execution(&output, CleanupRunType::Manual),
        )
        .map_err(|error| {
            eprintln!("[cleanup] persist history failed: {error}");
            error
        })
        .ok();

        Ok(ExecuteCleanupResponse {
            meta: CommandMeta {
                implemented: true,
                message: EXECUTE_CLEANUP_MESSAGE.to_string(),
            },
            run_id: output.run_id,
            project_results: output.project_results,
            total_released_bytes: output.total_released_bytes,
        })
    }

    pub fn run_auto_cleanup(
        &self,
        request: RunAutoCleanupRequest,
    ) -> CleanupResult<RunAutoCleanupResponse> {
        let output = auto_runner::run_auto_cleanup(self.app, self.state, request)?;
        Ok(RunAutoCleanupResponse {
            meta: CommandMeta {
                implemented: true,
                message: RUN_AUTO_CLEANUP_MESSAGE.to_string(),
            },
            triggered: output.triggered,
            reason: output.reason,
            run_id: output.run_id,
        })
    }

    pub fn list_cleanup_history(
        &self,
        request: &ListCleanupHistoryRequest,
    ) -> CleanupResult<ListCleanupHistoryResponse> {
        let (total, entries) = history_store::list_entries(self.app, request)?;
        Ok(ListCleanupHistoryResponse {
            meta: CommandMeta {
                implemented: true,
                message: LIST_CLEANUP_HISTORY_MESSAGE.to_string(),
            },
            total,
            entries,
        })
    }

    fn allowed_scan_roots(&self) -> CleanupResult<Vec<PathBuf>> {
        let settings =
            settings::store::load_settings(self.app).context("load settings for scan roots")?;
        let roots = settings
            .scan
            .roots
            .iter()
            .map(|root| Self::resolve_scan_root_path(&root.path))
            .map(|root| std::fs::canonicalize(&root).unwrap_or(root))
            .collect::<Vec<_>>();
        if roots.is_empty() {
            return Err(CleanupError::ScanRootsEmpty.into());
        }
        Ok(roots)
    }

    fn resolve_execution_entries(
        &self,
        entries: Vec<CleanupExecutionEntry>,
    ) -> CleanupResult<Vec<CleanupExecutionEntry>> {
        let settings =
            settings::store::load_settings(self.app).context("load settings for execution")?;
        Ok(entries
            .into_iter()
            .map(|entry| CleanupExecutionEntry {
                safe_mode: Some(entry.safe_mode.unwrap_or_else(|| {
                    policy::resolve_effective_project_policy(&settings, &entry.project_id).safe_mode
                })),
                ..entry
            })
            .collect::<Vec<_>>())
    }

    fn resolve_scan_root_path(path: &str) -> PathBuf {
        let expanded_path = Self::expand_home_path(path.trim());
        if expanded_path.is_absolute() {
            return expanded_path;
        }
        std::env::current_dir()
            .unwrap_or_else(|_| PathBuf::from("."))
            .join(expanded_path)
    }

    fn expand_home_path(path: &str) -> PathBuf {
        let home_dir = std::env::var("HOME").unwrap_or_default();
        if path == "~" {
            return PathBuf::from(home_dir);
        }
        path.strip_prefix("~/").map_or_else(
            || PathBuf::from(path),
            |rest| PathBuf::from(home_dir).join(rest),
        )
    }
}
