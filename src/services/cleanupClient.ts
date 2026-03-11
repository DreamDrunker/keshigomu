import { invoke } from "@tauri-apps/api/core";

export type CommandMeta = {
  implemented: boolean;
  message: string;
};

export type ScanRootInput = {
  path: string;
  depth: number;
};

export type ScanProjectsRequest = {
  roots: ScanRootInput[];
};

export type ProjectTechProfile = {
  languages?: string[];
  frameworks?: string[];
  buildTools?: string[];
  commandRunner?: string | null;
};

export type DiscoveredProject = {
  id: string;
  path: string;
  name: string;
  kind: string;
  reclaimableBytes?: number;
  inactiveDays?: number;
  packageManager?: string;
  packageManagers?: string[];
  techProfile?: ProjectTechProfile;
  workspaceUnits: number;
  startupCommands: Array<{
    label: string;
    command: string;
    scriptName?: string;
    resolvedCommand?: string;
  }>;
};

export type ScanProjectsResponse = {
  meta: CommandMeta;
  acceptedRoots: ScanRootInput[];
  projects: DiscoveredProject[];
  warnings: string[];
};

export type BuildCleanupPlanRequest = {
  projectIds: string[];
};

export type CleanupPlanItem = {
  itemId: string;
  label: string;
  path: string;
  estimatedSizeBytes: number;
  risk: string;
  recommended: boolean;
  source?: string;
  confidence?: number;
  category?: string;
};

export type ProjectCleanupPlan = {
  projectId: string;
  items: CleanupPlanItem[];
};

export type BuildCleanupPlanResponse = {
  meta: CommandMeta;
  plans: ProjectCleanupPlan[];
};

export type CleanupExecutionEntry = {
  projectId: string;
  selectedItemIds: string[];
  safeMode?: boolean;
};

export type ExecuteCleanupRequest = {
  dryRun: boolean;
  entries: CleanupExecutionEntry[];
};

export type ExecuteCleanupProjectResult = {
  projectId: string;
  releasedBytes: number;
  removedCount: number;
  status: string;
  removedPaths: string[];
  failedPaths: Array<{ path: string; reason: string }>;
};

export type ExecuteCleanupResponse = {
  meta: CommandMeta;
  runId: string;
  projectResults: ExecuteCleanupProjectResult[];
  totalReleasedBytes: number;
};

export type RunAutoCleanupRequest = {
  force: boolean;
};

export type RunAutoCleanupResponse = {
  meta: CommandMeta;
  triggered: boolean;
  reason: string;
  runId: string | null;
};

export type ListCleanupHistoryRequest = {
  limit: number;
  offset: number;
  runType?: "manual" | "auto";
  status?: "success" | "partial" | "failed" | "dryRun" | "skipped";
  projectId?: string;
};

export type CleanupHistoryEntry = {
  runId: string;
  executedAt: string;
  runType: "manual" | "auto";
  projectCount: number;
  itemCount: number;
  releasedBytes: number;
  status: string;
  projectDetails: Array<{
    projectId: string;
    removedCount: number;
    releasedBytes: number;
    status: string;
    removedPaths: string[];
    failedPaths: Array<{ path: string; reason: string }>;
  }>;
};

export type ListCleanupHistoryResponse = {
  meta: CommandMeta;
  total: number;
  entries: CleanupHistoryEntry[];
};

export const scanProjects = (request: ScanProjectsRequest) =>
  invoke<ScanProjectsResponse>("scan_projects", { request });

export const buildCleanupPlan = (request: BuildCleanupPlanRequest) =>
  invoke<BuildCleanupPlanResponse>("build_cleanup_plan", { request });

export const executeCleanup = (request: ExecuteCleanupRequest) =>
  invoke<ExecuteCleanupResponse>("execute_cleanup", { request });

export const runAutoCleanup = (request: RunAutoCleanupRequest) =>
  invoke<RunAutoCleanupResponse>("run_auto_cleanup", { request });

export const listCleanupHistory = (request: ListCleanupHistoryRequest) =>
  invoke<ListCleanupHistoryResponse>("list_cleanup_history", { request });
