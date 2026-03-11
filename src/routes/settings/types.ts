import type { DiscoveredProject } from "~/services/cleanupClient";
import type {
  CleanupRiskProfile,
  CleanupRiskProfileKey,
  MonorepoMode,
  RiskLevel,
  ScanRoot,
  ThemeKey,
  ThemeVars,
} from "~/workspace/types";

export type SettingsAutoCleanupFeedback = {
  tone: "info" | "success" | "error";
  message: string;
};

export type AppearanceSettingsState = {
  activeTheme: ThemeKey;
  themeOptions: Array<{ key: ThemeKey; label: string; description: string }>;
  themeBadgeLabels: Record<ThemeKey, string>;
  customTheme: ThemeVars;
  customCssText: string;
  customCssFileName: string;
};

export type AppearanceSettingsActions = {
  onThemeChange: (key: ThemeKey) => void;
  onCustomThemeChange: (name: string, value: string) => void;
  onResetCustomTheme: () => void;
  onCustomCssTextChange: (value: string) => void;
  onImportCustomCssFile: (file: File | null) => void | Promise<void>;
  onClearCustomCss: () => void;
};

export type ScanSettingsState = {
  monorepoMode: MonorepoMode;
  monorepoModeOptions: Array<{ value: MonorepoMode; label: string }>;
  scanRoots: ScanRoot[];
  lastScanProjects: DiscoveredProject[];
  lastScanWarnings: string[];
  lastScanAt: string;
  scanInProgress: boolean;
  scanStatusText: string;
};

export type ScanSettingsActions = {
  onMonorepoModeChange: (mode: MonorepoMode) => void;
  onAutoScanProjects: () => void | Promise<void>;
  onPickScanRoot: () => void | Promise<void>;
  onRemoveScanRoot: (path: string) => void;
};

export type CleanupSettingsState = {
  safeMode: boolean;
  cleanupThresholdDays: number;
  autoCleanupEnabled: boolean;
  autoCleanupIntervalDays: number;
  cleanupRiskProfile: CleanupRiskProfile;
  cleanupRiskProfileFields: CleanupRiskProfileKey[];
  cleanupRiskProfileFieldLabels: Record<CleanupRiskProfileKey, string>;
  autoCleanupRunInProgress: boolean;
  autoCleanupFeedback: SettingsAutoCleanupFeedback | null;
};

export type CleanupSettingsActions = {
  onSafeModeToggle: () => void;
  onCleanupThresholdDaysChange: (value: number) => void;
  onAutoCleanupEnabledToggle: () => void;
  onAutoCleanupIntervalDaysChange: (value: number) => void;
  onCleanupRiskProfileChange: (key: CleanupRiskProfileKey, value: RiskLevel) => void;
  onResetCleanupRiskProfile: () => void;
  onRunAutoCleanupNow: () => void | Promise<void>;
};
