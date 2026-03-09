import { Navigate, Route, Router } from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
} from "solid-js";
import { useApperance } from "./hooks/useApperance";
import { useCleanup } from "./hooks/useCleanup";
import { useProject } from "./hooks/useProject";
import { useScanRoots } from "./hooks/useScanRoots";
import { CleanupPage } from "./routes/cleanupPage";
import { Layout } from "./routes/layout";
import { ManagePage } from "./routes/managePage";
import { SettingsPage } from "./routes/settingsPage";
import { loadSettings, saveSettingsPatch } from "./services/settingsClient";
import type { MonorepoMode, ThemeKey, ThemeVars } from "./workspace/types";

const persistDebounceMs = 900;

const App = () => {
  const appearance = useApperance();
  const project = useProject();
  const scan = useScanRoots();
  const cleanup = useCleanup();
  const [settingsResource] = createResource(loadSettings);
  const [lastPersistedPayload, setLastPersistedPayload] = createSignal<
    string | null
  >(null);

  const appearanceSnapshot = () => ({
    activeTheme: appearance.activeTheme(),
    customTheme: { ...appearance.customTheme() },
    customCssText: appearance.customCssText(),
    customCssFileName: appearance.customCssFileName(),
  });

  const projectSnapshot = () => ({
    monorepoMode: project.monorepoMode(),
  });

  const scanSnapshot = () => ({
    roots: scan.scanRoots().map((root) => ({
      path: root.path,
      depth: Math.max(1, Math.round(Number(root.depth || 1))),
    })),
  });

  const cleanupSnapshot = () => ({
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
  });

  createEffect(() => {
    if (!settingsResource()) return;
    appearance.setActiveTheme(
      settingsResource()!.appearance.activeTheme as ThemeKey,
    );
    appearance.setCustomTheme(
      settingsResource()!.appearance.customTheme as ThemeVars,
    );
    appearance.setCustomCssText(
      settingsResource()!.appearance.customCssText || "",
    );
    appearance.setCustomCssFileName(
      settingsResource()!.appearance.customCssFileName || "",
    );
  });

  createEffect(() => {
    if (!settingsResource()) return;
    project.setMonorepoMode(
      settingsResource()!.project.monorepoMode as MonorepoMode,
    );
    project.setSelectedProjectId(settingsResource()!.project.selectedProjectId);
  });

  createEffect(() => {
    if (!settingsResource()) return;
    scan.replaceScanRoots(settingsResource()!.scan.roots);
  });

  createEffect(() => {
    if (!settingsResource()) return;
    cleanup.setSafeMode(
      Boolean(settingsResource()!.cleanup.globalPolicy.safeMode),
    );
    cleanup.setCleanupThresholdDays(
      settingsResource()!.cleanup.globalPolicy.cleanupThresholdDays,
    );
    cleanup.setCleanupRiskProfile(
      settingsResource()!.cleanup.globalPolicy.riskProfile ?? cleanup.cleanupRiskProfile(),
    );
    cleanup.setAutoCleanupEnabled(
      Boolean(settingsResource()!.cleanup.autoPlan?.enabled ?? true),
    );
    cleanup.setAutoCleanupIntervalDays(
      settingsResource()!.cleanup.autoPlan?.intervalDays ?? 30,
    );
    cleanup.replaceProjectPolicyOverrides(
      settingsResource()!.cleanup.projectPolicies,
    );
    cleanup.replaceProjectPlanSelections(
      settingsResource()!.cleanup.projectPlanSelections,
    );
  });

  createEffect(() => {
    if (lastPersistedPayload() !== null) return;
    if (settingsResource.loading) return;
    setLastPersistedPayload(
      JSON.stringify({
        appearance: appearanceSnapshot(),
        project: projectSnapshot(),
        scan: scanSnapshot(),
        cleanup: cleanupSnapshot(),
      }),
    );
  });

  createEffect(() => {
    if (!settingsResource()) return;
    if (lastPersistedPayload() === null) return;
    if (scan.lastScanAt()) return;
    scan.autoScanProjects();
  });

  createEffect(() => {
    if (settingsResource.loading) return;
    const previousPayload = lastPersistedPayload();
    if (previousPayload === null) return;
    const currentSnapshot = {
      appearance: appearanceSnapshot(),
      project: projectSnapshot(),
      scan: scanSnapshot(),
      cleanup: cleanupSnapshot(),
    };
    const payload = JSON.stringify(currentSnapshot);
    if (payload === previousPayload) return;

    const persistTimer = setTimeout(() => {
      saveSettingsPatch(currentSnapshot).then(() =>
        setLastPersistedPayload(payload),
      );
    }, persistDebounceMs);
    onCleanup(() => clearTimeout(persistTimer));
  });

  return (
    <Router>
      <Route path="/" component={() => <Navigate href="/manage" />} />
      <Route component={Layout}>
        <Route path="/manage" component={ManagePage} />
        <Route path="/cleanup" component={CleanupPage} />
      </Route>
      <Route path="/settings" component={SettingsPage} />
      <Route path="*all" component={() => <Navigate href="/manage" />} />
    </Router>
  );
};

export default App;
