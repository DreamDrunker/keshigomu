import { useNavigate, useSearchParams } from "@solidjs/router";
import { Match, Switch, createEffect, createSignal } from "solid-js";
import { TitleBar } from "~/components/layout/titleBar";
import { useApperance } from "~/hooks/useApperance";
import { useCleanup } from "~/hooks/useCleanup";
import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import { shellClass, surfaceClass } from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import {
  runAutoCleanup,
} from "~/services/cleanupClient";
import {
  resetSettingsSection,
  type PersistedSettings,
  type PersistedSettingsSection,
} from "~/services/settingsClient";
import {
  cleanupRiskProfileFieldLabels,
  cleanupRiskProfileFields,
  monorepoModeOptions,
  settingsTabs,
  themeBadgeLabels,
  themeOptions,
} from "~/workspace/constants";
import type {
  MonorepoMode,
  SettingsTabKey,
  ThemeKey,
  ThemeVars,
} from "~/workspace/types";
import { AppearanceSettings } from "./appearanceSettings";
import { CleanupSettings } from "./cleanupSettings";
import {
  describeAutoCleanupFeedback,
  resolveSettingsTab,
  toVisibleScanProjects,
} from "./helpers";
import { ScanSettings } from "./scanSettings";
import { SettingsNav } from "./settingsNav";
import {
  settingsHeaderActionClass,
  settingsHeaderTitleRowClass,
  settingsHeaderTopClass,
} from "./styles";
import type { SettingsAutoCleanupFeedback } from "./types";

export const SettingsPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const appearance = useApperance();
  const cleanup = useCleanup();
  const project = useProject();
  const scan = useScanRoots();
  const [resetInProgress, setResetInProgress] = createSignal(false);
  const [autoCleanupInProgress, setAutoCleanupInProgress] = createSignal(false);
  const [autoCleanupFeedback, setAutoCleanupFeedback] = createSignal<SettingsAutoCleanupFeedback | null>(null);

  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent);

  const activeSettingsTab = (): SettingsTabKey =>
    resolveSettingsTab(Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab) ??
    "appearance";
  const activeSettingsMeta = () =>
    settingsTabs.find((tab) => tab.key === activeSettingsTab()) ?? settingsTabs[0];

  createEffect(() => {
    resolveSettingsTab(Array.isArray(searchParams.tab) ? searchParams.tab[0] : searchParams.tab) ||
      setSearchParams({ tab: "appearance" }, { replace: true });
  });

  createEffect(() => {
    if (activeSettingsTab() !== "scan") return;
    if (scan.scanInProgress() || scan.lastScanAt() || scan.scanRoots().length === 0) return;
    scan.autoScanProjects();
  });

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
      for (const section of sectionsForTab(activeSettingsTab())) nextSettings = await resetSettingsSection(section);
      nextSettings && applyPersistedSettings(nextSettings);
      activeSettingsTab() === "scan" && scan.autoScanProjects().catch(() => undefined);
    } catch (error) {
      console.error("[settings] reset section failed", error);
      window.alert("恢复默认设置没有完成，请稍后重试。");
    } finally {
      setResetInProgress(false);
    }
  };

  const handleRunAutoCleanupNow = async () => {
    if (autoCleanupInProgress()) return;
    setAutoCleanupInProgress(true);
    setAutoCleanupFeedback({ tone: "info", message: "正在按当前设置清理，请稍候…" });
    try {
      const response = await runAutoCleanup({ force: true });
      setAutoCleanupFeedback({
        tone: response.triggered ? "success" : "info",
        message: describeAutoCleanupFeedback(response.triggered, response.reason),
      });
      response.triggered && scan.autoScanProjects().catch(() => undefined);
    } catch (error) {
      console.error("[settings] run auto cleanup failed", error);
      setAutoCleanupFeedback({ tone: "error", message: "这次自动清理没有完成，请稍后重试。" });
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
          class={cn(surfaceClass, "relative h-full w-full overflow-hidden rounded-[var(--radius-lg)]")}
          role="region"
          aria-label="设置"
        >
          <section class="grid h-full min-h-0 [grid-template-columns:220px_minmax(0,1fr)]">
            <SettingsNav
              activeTab={activeSettingsTab()}
              settingsTabs={settingsTabs}
              onBack={() => navigate("/manage")}
              onTabChange={(tab) => setSearchParams({ tab }, { replace: true })}
            />

            <section class="flex min-h-0 min-w-0 flex-col">
              <header class="border-b border-[color:var(--line)] px-[var(--space-5)] py-[var(--space-5)]">
                <div class={settingsHeaderTopClass}>
                  <div class={settingsHeaderTitleRowClass}>
                    <h2 class="m-0 text-[1rem] font-semibold text-[var(--text-strong)]">
                      {activeSettingsMeta().label}设置
                    </h2>
                    <span class="rounded-full border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-2)] py-[3px] text-[0.72rem] text-[var(--text-normal)]">
                      设置
                    </span>
                  </div>

                  <div class={settingsHeaderActionClass}>
                    <button
                      class="inline-flex min-w-[152px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-semibold text-[var(--text-normal)] transition-colors duration-200 hover:border-[color:var(--line-strong)] hover:text-[var(--text-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                      disabled={resetInProgress()}
                      onClick={handleResetCurrentTab}
                      type="button"
                    >
                      {resetInProgress() ? "恢复中..." : "恢复本页默认值"}
                    </button>
                  </div>
                </div>
                <p class="mt-[var(--space-2)] text-[0.78rem] text-[var(--text-muted)]">
                  {activeSettingsMeta().description}
                </p>
              </header>

              <section class="flex min-h-0 flex-col gap-[var(--space-6)] overflow-auto px-[var(--space-5)] pb-[var(--space-5)] pt-[var(--space-4)] max-[900px]:gap-[var(--space-5)] max-[900px]:p-[var(--space-4)]">
                <Switch>
                  <Match when={activeSettingsTab() === "appearance"}>
                    <AppearanceSettings
                      state={{
                        activeTheme: appearance.activeTheme(),
                        themeOptions,
                        themeBadgeLabels,
                        customTheme: appearance.customTheme(),
                        customCssText: appearance.customCssText(),
                        customCssFileName: appearance.customCssFileName(),
                      }}
                      actions={{
                        onThemeChange: appearance.setActiveTheme,
                        onCustomThemeChange: appearance.updateCustomTheme,
                        onResetCustomTheme: appearance.resetCustomTheme,
                        onCustomCssTextChange: appearance.setCustomCssText,
                        onImportCustomCssFile: appearance.importCustomCssFile,
                        onClearCustomCss: appearance.clearCustomCss,
                      }}
                    />
                  </Match>
                  <Match when={activeSettingsTab() === "scan"}>
                    <ScanSettings
                      state={{
                        monorepoMode: project.monorepoMode(),
                        monorepoModeOptions,
                        scanRoots: scan.scanRoots(),
                        lastScanProjects: toVisibleScanProjects(project.visibleProjects()),
                        lastScanWarnings: scan.lastScanWarnings(),
                        lastScanAt: scan.lastScanAt(),
                        scanInProgress: scan.scanInProgress(),
                        scanStatusText: scan.scanStatusText(),
                      }}
                      actions={{
                        onMonorepoModeChange: project.setMonorepoMode,
                        onAutoScanProjects: scan.autoScanProjects,
                        onPickScanRoot: scan.pickScanRoot,
                        onRemoveScanRoot: scan.removeScanRoot,
                      }}
                    />
                  </Match>
                  <Match when={true}>
                    <CleanupSettings
                      state={{
                        safeMode: cleanup.safeMode(),
                        cleanupThresholdDays: cleanup.cleanupThresholdDays(),
                        autoCleanupEnabled: cleanup.autoCleanupEnabled(),
                        autoCleanupIntervalDays: cleanup.autoCleanupIntervalDays(),
                        cleanupRiskProfile: cleanup.cleanupRiskProfile(),
                        cleanupRiskProfileFields,
                        cleanupRiskProfileFieldLabels,
                        autoCleanupRunInProgress: autoCleanupInProgress(),
                        autoCleanupFeedback: autoCleanupFeedback(),
                      }}
                      actions={{
                        onSafeModeToggle: () => cleanup.setSafeMode((enabled) => !enabled),
                        onCleanupThresholdDaysChange: (value) =>
                          cleanup.setCleanupThresholdDays(Math.max(1, value)),
                        onAutoCleanupEnabledToggle: () =>
                          cleanup.setAutoCleanupEnabled((enabled) => !enabled),
                        onAutoCleanupIntervalDaysChange: (value) =>
                          cleanup.setAutoCleanupIntervalDays(Math.max(1, value)),
                        onCleanupRiskProfileChange: cleanup.updateCleanupRiskProfile,
                        onResetCleanupRiskProfile: cleanup.resetCleanupRiskProfile,
                        onRunAutoCleanupNow: handleRunAutoCleanupNow,
                      }}
                    />
                  </Match>
                </Switch>
              </section>
            </section>
          </section>
        </aside>
      </section>
    </main>
  );
};
