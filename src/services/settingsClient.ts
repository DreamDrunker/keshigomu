import { invoke } from "@tauri-apps/api/core";
import type { CleanupRiskProfile, ProjectPolicyOverride, ThemeVars } from "~/workspace/types";

export type PersistedAppearanceSettings = {
  activeTheme: string;
  customTheme: ThemeVars;
  customCssText: string;
  customCssFileName: string;
};

export type PersistedProjectSettings = {
  monorepoMode: string;
  selectedProjectId: string;
};

export type PersistedScanRoot = {
  path: string;
  depth: number;
};

export type PersistedScanSettings = {
  roots: PersistedScanRoot[];
};

export type PersistedCleanupGlobalPolicy = {
  safeMode: boolean;
  cleanupThresholdDays: number;
  riskProfile: CleanupRiskProfile;
};

export type PersistedCleanupAutoPlan = {
  enabled: boolean;
  intervalDays: number;
};

export type PersistedCleanupSettings = {
  globalPolicy: PersistedCleanupGlobalPolicy;
  autoPlan: PersistedCleanupAutoPlan;
  projectPolicies: Record<string, ProjectPolicyOverride>;
  projectPlanSelections: Record<string, string[]>;
};

export type PersistedSettings = {
  version: number;
  revision: number;
  updatedAt: string;
  appearance: PersistedAppearanceSettings;
  project: PersistedProjectSettings;
  scan: PersistedScanSettings;
  cleanup: PersistedCleanupSettings;
};

export type PersistedSettingsPatch = Partial<{
  appearance: Partial<PersistedAppearanceSettings>;
  project: Partial<PersistedProjectSettings>;
  scan: Partial<PersistedScanSettings>;
  cleanup: Partial<PersistedCleanupSettings>;
}>;

export type PersistedSettingsSection = "appearance" | "project" | "scan" | "cleanup";

export const loadSettings = () => invoke<PersistedSettings>("load_settings");

export const saveSettingsPatch = (patch: PersistedSettingsPatch) =>
  invoke<PersistedSettings>("save_settings_patch", { patch });

export const resetSettingsSection = (section: PersistedSettingsSection) =>
  invoke<PersistedSettings>("reset_settings_section", { section });
