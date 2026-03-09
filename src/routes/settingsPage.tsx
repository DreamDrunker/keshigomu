import { useNavigate, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import {
  cleanupRiskProfileFieldLabels,
  cleanupRiskProfileFields,
  monorepoModeOptions,
  settingsTabs,
  themeBadgeLabels,
  themeOptions,
} from "~/workspace/constants";
import { SettingsPanel } from "~/components/settings/settingsDrawer";
import { TitleBar } from "~/components/layout/titleBar";
import { useApperance } from "~/hooks/useApperance";
import { useCleanup } from "~/hooks/useCleanup";
import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import { shellClass, surfaceClass } from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import {
  runAutoCleanup,
  type DiscoveredProject,
} from "~/services/cleanupClient";
import {
  resetSettingsSection,
  type PersistedSettings,
  type PersistedSettingsSection,
} from "~/services/settingsClient";
import type { MonorepoMode, SettingsTabKey, ThemeKey, ThemeVars } from "~/workspace/types";

const resolveSettingsTab = (value: string | undefined): SettingsTabKey | undefined =>
  value === "appearance" || value === "scan" || value === "cleanup" ? value : undefined;

export const SettingsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appearance = useApperance();
  const cleanup = useCleanup();
  const project = useProject();
  const scan = useScanRoots();
  const [resetInProgress, setResetInProgress] = createSignal(false);
  const [autoCleanupInProgress, setAutoCleanupInProgress] = createSignal(false);
  const [autoCleanupFeedback, setAutoCleanupFeedback] = createSignal<{
    tone: "info" | "success" | "error";
    message: string;
  } | null>(null);

  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent);

  const routeTab = () => {
    const value = searchParams.tab;
    return resolveSettingsTab(Array.isArray(value) ? value[0] : value);
  };
  const activeSettingsTab = (): SettingsTabKey => routeTab() ?? "appearance";
  const activeSettingsMeta = () =>
    settingsTabs.find((tab) => tab.key === activeSettingsTab()) ?? settingsTabs[0];
  const visibleScanProjects = (): DiscoveredProject[] =>
    project.visibleProjects().map((item) => ({
      id: item.id,
      name: item.name,
      path: item.path,
      kind: item.kind === "repo-root" ? "repoRoot" : item.kind,
    }));

  createEffect(() => {
    if (routeTab()) return;
    setSearchParams({ tab: "appearance" }, { replace: true });
  });

  createEffect(() => {
    if (activeSettingsTab() !== "scan") return;
    if (scan.scanInProgress() || scan.lastScanAt() || scan.scanRoots().length === 0) return;
    scan.autoScanProjects();
  });

  const handleTabChange = (tab: SettingsTabKey) => setSearchParams({ tab }, { replace: true });
  const applyPersistedSettings = (settings: PersistedSettings) => {
    appearance.setActiveTheme(settings.appearance.activeTheme as ThemeKey);
    appearance.setCustomTheme(settings.appearance.customTheme as ThemeVars);
    appearance.setCustomCssText(settings.appearance.customCssText || "");
    appearance.setCustomCssFileName(settings.appearance.customCssFileName || "");

    project.setMonorepoMode(settings.project.monorepoMode as MonorepoMode);
    project.setSelectedProjectId(settings.project.selectedProjectId);

    scan.replaceScanRoots(settings.scan.roots);

    cleanup.setSafeMode(Boolean(settings.cleanup.globalPolicy.safeMode));
    cleanup.setCleanupThresholdDays(settings.cleanup.globalPolicy.cleanupThresholdDays);
    cleanup.setCleanupRiskProfile(settings.cleanup.globalPolicy.riskProfile);
    cleanup.setAutoCleanupEnabled(Boolean(settings.cleanup.autoPlan?.enabled ?? true));
    cleanup.setAutoCleanupIntervalDays(settings.cleanup.autoPlan?.intervalDays ?? 30);
    cleanup.replaceProjectPolicyOverrides(settings.cleanup.projectPolicies);
    cleanup.replaceProjectPlanSelections(settings.cleanup.projectPlanSelections);
  };
  const sectionsForTab = (tab: SettingsTabKey): PersistedSettingsSection[] =>
    tab === "appearance" ? ["appearance"] : tab === "scan" ? ["scan", "project"] : ["cleanup"];
  const handleResetCurrentTab = async () => {
    if (resetInProgress()) return;

    setResetInProgress(true);
    try {
      let nextSettings: PersistedSettings | null = null;
      for (const section of sectionsForTab(activeSettingsTab())) {
        nextSettings = await resetSettingsSection(section);
      }
      nextSettings && applyPersistedSettings(nextSettings);
      activeSettingsTab() === "scan" && scan.autoScanProjects().catch(() => undefined);
    } catch (error) {
      console.error("[settings] reset section failed", error);
      window.alert("恢复默认设置失败");
    } finally {
      setResetInProgress(false);
    }
  };
  const handleRunAutoCleanupNow = async () => {
    if (autoCleanupInProgress()) return;

    setAutoCleanupInProgress(true);
    setAutoCleanupFeedback({
      tone: "info",
      message: "正在按当前自动清理策略执行，请稍候…",
    });
    try {
      const response = await runAutoCleanup({ force: true });
      setAutoCleanupFeedback({
        tone: response.triggered ? "success" : "info",
        message: response.runId ? `${response.reason}（运行 ID：${response.runId}）` : response.reason,
      });
      response.triggered && scan.autoScanProjects().catch(() => undefined);
    } catch (error) {
      console.error("[settings] run auto cleanup failed", error);
      setAutoCleanupFeedback({
        tone: "error",
        message: "自动清理执行失败，请稍后重试。",
      });
    } finally {
      setAutoCleanupInProgress(false);
    }
  };

  const startWindowDrag = async (event: MouseEvent) => {
    if (event.button !== 0) return;

    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, label, [role='button']")) return;

    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {}
  };

  return (
    <main class={shellClass}>
      <TitleBar isMacPlatform={isMacPlatform} onStartDrag={startWindowDrag} />

      <section class="min-h-0 bg-[var(--bg)] p-[var(--space-4)]">
        <aside
          class={cn(
            surfaceClass,
            "relative h-full w-full overflow-hidden rounded-[var(--radius-lg)] border-l-0",
          )}
          role="region"
          aria-label="设置"
        >
          <SettingsPanel
            activeSettingsTab={activeSettingsTab()}
            settingsTabs={settingsTabs}
            activeSettingsMeta={activeSettingsMeta()}
            onResetCurrentTab={handleResetCurrentTab}
            resetInProgress={resetInProgress()}
            onBack={() => navigate("/manage")}
            onTabChange={handleTabChange}
            activeTheme={appearance.activeTheme()}
            themeOptions={themeOptions}
            themeBadgeLabels={themeBadgeLabels}
            onThemeChange={appearance.setActiveTheme}
            customTheme={appearance.customTheme()}
            onCustomThemeChange={appearance.updateCustomTheme}
            onResetCustomTheme={appearance.resetCustomTheme}
            customCssText={appearance.customCssText()}
            customCssFileName={appearance.customCssFileName()}
            onCustomCssTextChange={(value) => appearance.setCustomCssText(value)}
            onImportCustomCssFile={appearance.importCustomCssFile}
            onClearCustomCss={appearance.clearCustomCss}
            monorepoMode={project.monorepoMode()}
            monorepoModeOptions={monorepoModeOptions}
            onMonorepoModeChange={project.setMonorepoMode}
            scanRoots={scan.scanRoots()}
            onAutoScanProjects={scan.autoScanProjects}
            onPickScanRoot={scan.pickScanRoot}
            onRemoveScanRoot={scan.removeScanRoot}
            lastScanProjects={visibleScanProjects()}
            lastScanWarnings={scan.lastScanWarnings()}
            lastScanAt={scan.lastScanAt()}
            scanInProgress={scan.scanInProgress()}
            scanStatusText={scan.scanStatusText()}
            safeMode={cleanup.safeMode()}
            onSafeModeToggle={() => cleanup.setSafeMode((enabled) => !enabled)}
            cleanupThresholdDays={cleanup.cleanupThresholdDays()}
            onCleanupThresholdDaysChange={(value) => {
              cleanup.setCleanupThresholdDays(Math.max(1, value));
            }}
            autoCleanupEnabled={cleanup.autoCleanupEnabled()}
            onAutoCleanupEnabledToggle={() =>
              cleanup.setAutoCleanupEnabled((enabled) => !enabled)}
            autoCleanupIntervalDays={cleanup.autoCleanupIntervalDays()}
            onAutoCleanupIntervalDaysChange={(value) => {
              cleanup.setAutoCleanupIntervalDays(Math.max(1, value));
            }}
            cleanupRiskProfile={cleanup.cleanupRiskProfile()}
            cleanupRiskProfileFields={cleanupRiskProfileFields}
            cleanupRiskProfileFieldLabels={cleanupRiskProfileFieldLabels}
            onCleanupRiskProfileChange={cleanup.updateCleanupRiskProfile}
            onResetCleanupRiskProfile={cleanup.resetCleanupRiskProfile}
            onRunAutoCleanupNow={handleRunAutoCleanupNow}
            autoCleanupRunInProgress={autoCleanupInProgress()}
            autoCleanupFeedback={autoCleanupFeedback()}
          />
        </aside>
      </section>
    </main>
  );
};
