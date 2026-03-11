import type { Component } from "solid-js";

export type IconProps = {
  size?: number;
  strokeWidth?: number;
  class?: string;
};

export type PageKey = "manage" | "cleanup";
export type MonorepoMode = "repoRootOnly" | "packagesOnly" | "both";
export type SettingsTabKey = "appearance" | "scan" | "cleanup";
export type ThemeKey = "system" | "current" | "white" | "black" | "lavender" | "custom";
export type ThemePresetKey = Exclude<ThemeKey, "custom" | "system">;
export type RiskLevel = "low" | "medium";
export type PlanCategory = "cache" | "build" | "report" | "temp";
export type CleanupRiskProfileKey =
  | "cache"
  | "build"
  | "report"
  | "temp"
  | "dependencies"
  | "rustTarget";
export type CleanupRiskProfile = Record<CleanupRiskProfileKey, RiskLevel>;
export type PolicyScope = "global" | "project";
export type ThemeVars = Record<string, string>;

export type ProjectCommand = {
  label: string;
  command: string;
  scriptName?: string;
  resolvedCommand?: string;
};

export type ProjectTechnology = {
  languages: string[];
  frameworks: string[];
  buildTools: string[];
  commandRunner: string | null;
};

export type ProjectSnapshot = {
  id: string;
  name: string;
  path: string;
  packageManagers: Array<"pnpm" | "bun" | "npm" | "cargo" | "unknown">;
  reclaimableGb: number;
  inactiveDays: number;
  kind: "repo-root" | "package" | "single";
  profile: string;
  technology: ProjectTechnology;
  workspaceRole: string;
  workspaceUnits: number;
  startupCommands: ProjectCommand[];
};

export type PlanItem = {
  id: string;
  label: string;
  relativePath: string;
  sizeGb: number;
  risk: RiskLevel;
  category: PlanCategory;
  impact: string;
  recommended: boolean;
};

export type NavItem = {
  key: PageKey;
  label: string;
  icon: Component<IconProps>;
};

export type SettingsTabItem = {
  key: SettingsTabKey;
  label: string;
  description: string;
};

export type ScanRoot = {
  path: string;
  depth: number;
};

export type CommandAction = {
  id: string;
  label: string;
  keywords: string;
  shortcut?: string;
  run: () => void;
};

export type ProjectPolicyOverride = {
  enabled: boolean;
  safeMode: boolean;
  autoCleanupEnabled: boolean;
  inactiveThresholdDays: number;
  cacheMtimeDays: number;
};

export type EffectiveProjectPolicy = {
  scope: PolicyScope;
  safeMode: boolean;
  autoCleanupEnabled: boolean;
  inactiveThresholdDays: number;
  cacheMtimeDays: number;
};

export type CleanupQueueEntry = {
  projectId: string;
  queuedAt: string;
  selectedPlanIds: string[];
  policySnapshot: EffectiveProjectPolicy;
};

export type QueueProjectStats = {
  selectedCount: number;
  selectedSize: number;
  totalCount: number;
  totalSize: number;
};
