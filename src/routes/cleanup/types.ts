import type { EffectiveProjectPolicy, PlanItem, PolicyScope } from "~/workspace/types";

export type QueueSelectedItem = PlanItem & {
  projectId: string;
};

export type FailedPath = {
  path: string;
  reason: string;
};

export type ExecutionProjectSummary = {
  projectId: string;
  projectName: string;
  selectedCount: number;
  selectedSize: number;
  policyScope: PolicyScope;
  safeMode: boolean;
};

export type ExecutionResultProject = {
  projectId: string;
  projectName: string;
  status: "success" | "dryRun" | "partial" | "failed";
  releasedGb: number;
  removedCount: number;
  policyScope: PolicyScope;
  removedPaths: string[];
  failedPaths: FailedPath[];
};

export type ExecutionResultState = {
  executedAt: string;
  modeLabel: string;
  projectCount: number;
  itemCount: number;
  releasedGb: number;
  projects: ExecutionResultProject[];
};

export type CleanupPlanViewState = {
  editable: boolean;
  loading: boolean;
  error: string;
  items: PlanItem[];
  selectedIds: string[];
  projectId: string;
};

export type CleanupPolicyActions = {
  onToggleOverride: () => void;
  onToggleAutoCleanup: () => void;
  onThresholdChange: (value: number) => void;
  onCacheMtimeChange: (value: number) => void;
  onToggleSafeMode: () => void;
};

export type CleanupSummaryState = {
  policy: EffectiveProjectPolicy;
  selectedCount: number;
  selectedSize: number;
};
