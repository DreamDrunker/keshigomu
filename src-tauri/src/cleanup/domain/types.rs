use serde::{Deserialize, Serialize};

pub type CleanupResult<T> = anyhow::Result<T>;

fn default_cleanup_run_type() -> CleanupRunType {
    CleanupRunType::Manual
}

fn default_workspace_units() -> u32 {
    1
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ProjectKind {
    RepoRoot,
    Package,
    Single,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupRisk {
    Low,
    Medium,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CleanupStatus {
    DryRun,
    Success,
    Failed,
    Partial,
    Skipped,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum CleanupRunType {
    Manual,
    Auto,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommandMeta {
    pub implemented: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanRootInput {
    pub path: String,
    pub depth: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectsRequest {
    pub roots: Vec<ScanRootInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectStartupCommand {
    pub label: String,
    pub command: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub script_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub resolved_command: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ProjectTechProfile {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub languages: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub frameworks: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub build_tools: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command_runner: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscoveredProject {
    pub id: String,
    pub path: String,
    pub name: String,
    pub kind: ProjectKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reclaimable_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub inactive_days: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_manager: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub package_managers: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tech_profile: Option<ProjectTechProfile>,
    #[serde(default = "default_workspace_units")]
    pub workspace_units: u32,
    #[serde(default)]
    pub startup_commands: Vec<ProjectStartupCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScanProjectsResponse {
    pub meta: CommandMeta,
    pub accepted_roots: Vec<ScanRootInput>,
    pub projects: Vec<DiscoveredProject>,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCleanupPlanRequest {
    pub project_ids: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupPlanItem {
    pub item_id: String,
    pub label: String,
    pub path: String,
    pub estimated_size_bytes: u64,
    pub risk: CleanupRisk,
    pub recommended: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub confidence: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub category: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectCleanupPlan {
    pub project_id: String,
    pub items: Vec<CleanupPlanItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildCleanupPlanResponse {
    pub meta: CommandMeta,
    pub plans: Vec<ProjectCleanupPlan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupExecutionEntry {
    pub project_id: String,
    pub selected_item_ids: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub safe_mode: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCleanupRequest {
    pub dry_run: bool,
    pub entries: Vec<CleanupExecutionEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCleanupProjectResult {
    pub project_id: String,
    pub released_bytes: u64,
    pub removed_count: u32,
    pub status: CleanupStatus,
    #[serde(default)]
    pub removed_paths: Vec<String>,
    #[serde(default)]
    pub failed_paths: Vec<CleanupFailedPath>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupFailedPath {
    pub path: String,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteCleanupResponse {
    pub meta: CommandMeta,
    pub run_id: String,
    pub project_results: Vec<ExecuteCleanupProjectResult>,
    pub total_released_bytes: u64,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAutoCleanupRequest {
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RunAutoCleanupResponse {
    pub meta: CommandMeta,
    pub triggered: bool,
    pub reason: String,
    pub run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCleanupHistoryRequest {
    pub limit: u32,
    pub offset: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub run_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub status: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupHistoryProjectDetail {
    pub project_id: String,
    pub removed_count: u32,
    pub released_bytes: u64,
    pub status: CleanupStatus,
    #[serde(default)]
    pub removed_paths: Vec<String>,
    #[serde(default)]
    pub failed_paths: Vec<CleanupFailedPath>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CleanupHistoryEntry {
    pub run_id: String,
    pub executed_at: String,
    #[serde(default = "default_cleanup_run_type")]
    pub run_type: CleanupRunType,
    pub project_count: u32,
    pub item_count: u32,
    pub released_bytes: u64,
    pub status: CleanupStatus,
    #[serde(default)]
    pub project_details: Vec<CleanupHistoryProjectDetail>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCleanupHistoryResponse {
    pub meta: CommandMeta,
    pub total: u32,
    pub entries: Vec<CleanupHistoryEntry>,
}
