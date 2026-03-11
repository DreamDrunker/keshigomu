import { describe, expect, test } from "bun:test";
import {
  buildSettingsSnapshot,
  hydrateStateFromSettings,
  shouldAutoScanProjects,
} from "./appSettings";
import type { PersistedSettings } from "./services/settingsClient";
import type {
  CleanupRiskProfile,
  MonorepoMode,
  ThemeKey,
  ThemeVars,
} from "./workspace/types";

type SetterValue<T> = T | ((previous: T) => T);

const applySetterValue = <T,>(value: SetterValue<T>, previous: T) =>
  typeof value === "function" ? (value as (previous: T) => T)(previous) : value;

const settingsFixture: PersistedSettings = {
  version: 1,
  revision: 3,
  updatedAt: "1710000000",
  appearance: {
    activeTheme: "lavender",
    customTheme: { "--bg": "#fafafa" },
    customCssText: ".demo { color: red; }",
    customCssFileName: "demo.css",
  },
  project: {
    monorepoMode: "both",
    selectedProjectId: "project-a",
  },
  scan: {
    roots: [{ path: "/tmp/code", depth: 2 }],
  },
  cleanup: {
    globalPolicy: {
      safeMode: false,
      cleanupThresholdDays: 14,
      riskProfile: {
        cache: "low",
        build: "low",
        report: "medium",
        temp: "low",
        dependencies: "medium",
        rustTarget: "low",
      },
    },
    autoPlan: {
      enabled: true,
      intervalDays: 7,
    },
    projectPolicies: {},
    projectPlanSelections: {},
  },
};

const createBindings = () => {
  let activeTheme: ThemeKey = "system";
  let customTheme: ThemeVars = { "--bg": "#fff" };
  let customCssText = "";
  let customCssFileName = "";
  let monorepoMode: MonorepoMode = "repoRootOnly";
  let selectedProjectId = "";
  let scanRoots = [{ path: "/tmp/root", depth: 0 }];
  let safeMode = true;
  let cleanupThresholdDays = 0;
  let cleanupRiskProfile: CleanupRiskProfile = {
    cache: "low",
    build: "low",
    report: "low",
    temp: "low",
    dependencies: "medium",
    rustTarget: "low",
  };
  let autoCleanupEnabled = false;
  let autoCleanupIntervalDays = 0;
  let projectPolicyOverrides = {};
  let projectPlanSelections = {};

  return {
    bindings: {
      appearance: {
        activeTheme: () => activeTheme,
        setActiveTheme: (value: SetterValue<typeof activeTheme>) =>
          (activeTheme = applySetterValue(value, activeTheme)),
        customTheme: () => customTheme,
        setCustomTheme: (value: SetterValue<typeof customTheme>) =>
          (customTheme = applySetterValue(value, customTheme)),
        customCssText: () => customCssText,
        setCustomCssText: (value: SetterValue<string>) =>
          (customCssText = applySetterValue(value, customCssText)),
        customCssFileName: () => customCssFileName,
        setCustomCssFileName: (value: SetterValue<string>) =>
          (customCssFileName = applySetterValue(value, customCssFileName)),
      },
      project: {
        monorepoMode: () => monorepoMode,
        setMonorepoMode: (value: SetterValue<typeof monorepoMode>) =>
          (monorepoMode = applySetterValue(value, monorepoMode)),
        setSelectedProjectId: (value: SetterValue<string>) =>
          (selectedProjectId = applySetterValue(value, selectedProjectId)),
      },
      scan: {
        scanRoots: () => scanRoots,
        replaceScanRoots: (value: typeof scanRoots) => (scanRoots = value),
        lastScanAt: () => "",
      },
      cleanup: {
        safeMode: () => safeMode,
        setSafeMode: (value: SetterValue<boolean>) =>
          (safeMode = applySetterValue(value, safeMode)),
        cleanupThresholdDays: () => cleanupThresholdDays,
        setCleanupThresholdDays: (value: SetterValue<number>) =>
          (cleanupThresholdDays = applySetterValue(value, cleanupThresholdDays)),
        cleanupRiskProfile: () => cleanupRiskProfile,
        setCleanupRiskProfile: (value: SetterValue<typeof cleanupRiskProfile>) =>
          (cleanupRiskProfile = applySetterValue(value, cleanupRiskProfile)),
        autoCleanupEnabled: () => autoCleanupEnabled,
        setAutoCleanupEnabled: (value: SetterValue<boolean>) =>
          (autoCleanupEnabled = applySetterValue(value, autoCleanupEnabled)),
        autoCleanupIntervalDays: () => autoCleanupIntervalDays,
        setAutoCleanupIntervalDays: (value: SetterValue<number>) =>
          (autoCleanupIntervalDays = applySetterValue(value, autoCleanupIntervalDays)),
        projectPolicyOverrides: () => projectPolicyOverrides,
        replaceProjectPolicyOverrides: (value: typeof projectPolicyOverrides) =>
          (projectPolicyOverrides = value),
        projectPlanSelections: () => projectPlanSelections,
        replaceProjectPlanSelections: (value: typeof projectPlanSelections) =>
          (projectPlanSelections = value),
      },
    },
    snapshot: () => ({
      activeTheme,
      customTheme,
      customCssText,
      customCssFileName,
      monorepoMode,
      selectedProjectId,
      scanRoots,
      safeMode,
      cleanupThresholdDays,
      cleanupRiskProfile,
      autoCleanupEnabled,
      autoCleanupIntervalDays,
      projectPolicyOverrides,
      projectPlanSelections,
    }),
  };
};

describe("appSettings", () => {
  test("builds a normalized settings snapshot", () => {
    const { bindings } = createBindings();
    const snapshot = buildSettingsSnapshot(bindings);

    expect(snapshot).toEqual({
      appearance: {
        activeTheme: "system",
        customTheme: { "--bg": "#fff" },
        customCssText: "",
        customCssFileName: "",
      },
      project: {
        monorepoMode: "repoRootOnly",
      },
      scan: {
        roots: [{ path: "/tmp/root", depth: 1 }],
      },
      cleanup: {
        globalPolicy: {
          safeMode: true,
          cleanupThresholdDays: 1,
          riskProfile: {
            cache: "low",
            build: "low",
            report: "low",
            temp: "low",
            dependencies: "medium",
            rustTarget: "low",
          },
        },
        autoPlan: {
          enabled: false,
          intervalDays: 1,
        },
        projectPolicies: {},
        projectPlanSelections: {},
      },
    });
  });

  test("hydrates state setters from persisted settings", () => {
    const { bindings, snapshot } = createBindings();

    hydrateStateFromSettings(settingsFixture, bindings);

    expect(snapshot()).toEqual({
      activeTheme: "lavender",
      customTheme: { "--bg": "#fafafa" },
      customCssText: ".demo { color: red; }",
      customCssFileName: "demo.css",
      monorepoMode: "both",
      selectedProjectId: "project-a",
      scanRoots: [{ path: "/tmp/code", depth: 2 }],
      safeMode: false,
      cleanupThresholdDays: 14,
      cleanupRiskProfile: {
        cache: "low",
        build: "low",
        report: "medium",
        temp: "low",
        dependencies: "medium",
        rustTarget: "low",
      },
      autoCleanupEnabled: true,
      autoCleanupIntervalDays: 7,
      projectPolicyOverrides: {},
      projectPlanSelections: {},
    });
  });

  test("only auto-scans after settings are ready and no previous scan exists", () => {
    expect(shouldAutoScanProjects(false, null, "")).toBe(false);
    expect(shouldAutoScanProjects(true, null, "")).toBe(false);
    expect(shouldAutoScanProjects(true, "payload", "2026-03-11T00:00:00.000Z")).toBe(
      false,
    );
    expect(shouldAutoScanProjects(true, "payload", "")).toBe(true);
  });
});
