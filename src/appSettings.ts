import type { ApperanceState } from "./hooks/useApperance";
import type { CleanupState } from "./hooks/useCleanup";
import type { ProjectState } from "./hooks/useProject";
import type { UseScanRootsValue } from "./hooks/useScanRoots";
import type { PersistedSettings } from "./services/settingsClient";
import type { MonorepoMode, ThemeKey, ThemeVars } from "./workspace/types";

type AppStateBindings = {
  appearance: Pick<
    ApperanceState,
    | "activeTheme"
    | "setActiveTheme"
    | "customTheme"
    | "setCustomTheme"
    | "customCssText"
    | "setCustomCssText"
    | "customCssFileName"
    | "setCustomCssFileName"
  >;
  project: Pick<
    ProjectState,
    "monorepoMode" | "setMonorepoMode" | "setSelectedProjectId"
  >;
  scan: Pick<UseScanRootsValue, "scanRoots" | "replaceScanRoots" | "lastScanAt">;
  cleanup: Pick<
    CleanupState,
    | "safeMode"
    | "setSafeMode"
    | "cleanupThresholdDays"
    | "setCleanupThresholdDays"
    | "cleanupRiskProfile"
    | "setCleanupRiskProfile"
    | "autoCleanupEnabled"
    | "setAutoCleanupEnabled"
    | "autoCleanupIntervalDays"
    | "setAutoCleanupIntervalDays"
    | "projectPolicyOverrides"
    | "replaceProjectPolicyOverrides"
    | "projectPlanSelections"
    | "replaceProjectPlanSelections"
  >;
};

export const buildSettingsSnapshot = ({
  appearance,
  project,
  scan,
  cleanup,
}: AppStateBindings) => ({
  appearance: {
    activeTheme: appearance.activeTheme(),
    customTheme: { ...appearance.customTheme() },
    customCssText: appearance.customCssText(),
    customCssFileName: appearance.customCssFileName(),
  },
  project: {
    monorepoMode: project.monorepoMode(),
  },
  scan: {
    roots: scan.scanRoots().map((root) => ({
      path: root.path,
      depth: Math.max(1, Math.round(Number(root.depth || 1))),
    })),
  },
  cleanup: {
    globalPolicy: {
      safeMode: cleanup.safeMode(),
      cleanupThresholdDays: Math.max(
        1,
        Math.round(Number(cleanup.cleanupThresholdDays() || 1)),
      ),
      riskProfile: { ...cleanup.cleanupRiskProfile() },
    },
    autoPlan: {
      enabled: cleanup.autoCleanupEnabled(),
      intervalDays: Math.max(
        1,
        Math.round(Number(cleanup.autoCleanupIntervalDays() || 1)),
      ),
    },
    projectPolicies: cleanup.projectPolicyOverrides(),
    projectPlanSelections: cleanup.projectPlanSelections(),
  },
});

export const hydrateStateFromSettings = (
  settings: PersistedSettings,
  { appearance, project, scan, cleanup }: AppStateBindings,
) => {
  appearance.setActiveTheme(settings.appearance.activeTheme as ThemeKey);
  appearance.setCustomTheme(settings.appearance.customTheme as ThemeVars);
  appearance.setCustomCssText(settings.appearance.customCssText || "");
  appearance.setCustomCssFileName(settings.appearance.customCssFileName || "");

  project.setMonorepoMode(settings.project.monorepoMode as MonorepoMode);
  project.setSelectedProjectId(settings.project.selectedProjectId);

  scan.replaceScanRoots(settings.scan.roots);

  cleanup.setSafeMode(Boolean(settings.cleanup.globalPolicy.safeMode));
  cleanup.setCleanupThresholdDays(settings.cleanup.globalPolicy.cleanupThresholdDays);
  cleanup.setCleanupRiskProfile(
    settings.cleanup.globalPolicy.riskProfile ?? cleanup.cleanupRiskProfile(),
  );
  cleanup.setAutoCleanupEnabled(Boolean(settings.cleanup.autoPlan?.enabled ?? true));
  cleanup.setAutoCleanupIntervalDays(settings.cleanup.autoPlan?.intervalDays ?? 30);
  cleanup.replaceProjectPolicyOverrides(settings.cleanup.projectPolicies);
  cleanup.replaceProjectPlanSelections(settings.cleanup.projectPlanSelections);
};

export const shouldAutoScanProjects = (
  settingsReady: boolean,
  lastPersistedPayload: string | null,
  lastScanAt: string,
) => settingsReady && lastPersistedPayload !== null && !lastScanAt;
