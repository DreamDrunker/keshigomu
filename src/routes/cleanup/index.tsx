import { Show, createEffect, createResource, createSignal } from "solid-js";
import { Button } from "~/components/ui/button";
import { useCleanup } from "~/hooks/useCleanup";
import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import { formatSizeFromGb } from "~/lib/size";
import {
  paneClass,
  paneFooterClass,
  paneScrollClass,
  paneTitleClass,
  paneToolbarClass,
  splitPaneClass,
  toolbarMetaClass,
  workbenchClass,
} from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import {
  executeCleanup,
  listCleanupHistory,
  type ListCleanupHistoryRequest,
} from "~/services/cleanupClient";
import { CleanupHistory } from "./cleanupHistory";
import { CleanupPlanList } from "./cleanupPlanList";
import { CleanupSidebar } from "./cleanupSidebar";
import { CleanupSummary } from "./cleanupSummary";
import { buildExecutionProjectSummaries, bytesToGb, resolveExecutionModeLabel } from "./helpers";
import { ExecutionResultDrawer } from "./executionResultDrawer";
import { ProjectPolicyPanel } from "./projectPolicyPanel";
import type { ExecutionResultProject, ExecutionResultState, QueueSelectedItem } from "./types";

export const CleanupPage = () => {
  const projectState = useProject();
  const cleanupState = useCleanup();
  const scanState = useScanRoots();
  const [historyResource, { refetch: refetchHistory }] = createResource(
    (): ListCleanupHistoryRequest => ({
      limit: 500,
      offset: 0,
      projectId: projectState.selectedProjectId() || undefined,
    }),
    listCleanupHistory,
  );
  const [resultOpen, setResultOpen] = createSignal(false);
  const [executeInProgress, setExecuteInProgress] = createSignal(false);
  const [executionResult, setExecutionResult] = createSignal<ExecutionResultState | null>(null);
  let lastPlanScanAt = "";
  const refreshedPlanProjects = new Set<string>();

  const activeProject = () => projectState.activeProject();
  const hasActiveProject = () => Boolean(activeProject().id);
  const activeProjectPolicy = () => cleanupState.projectPolicyForProject(activeProject().id);
  const activeProjectPolicyOverride = () => cleanupState.projectPolicyOverrides()[activeProject().id];
  const activeProjectStats = () => cleanupState.queueProjectStats(activeProject().id);
  const activePlanState = () => ({
    editable: Boolean(activeProjectPolicyOverride()?.enabled),
    loading: cleanupState.isPlanLoadingForProject(activeProject().id),
    error: cleanupState.planErrorForProject(activeProject().id),
    items: cleanupState.planForProject(activeProject().id),
    selectedIds: cleanupState.selectedPlanIdsForProject(activeProject().id),
    projectId: activeProject().id,
  });
  const historyEntries = () => historyResource()?.entries ?? [];
  const historyTotal = () => historyResource()?.total ?? 0;
  const resolveProjectName = (projectId: string) =>
    projectState.allProjects().find((project) => project.id === projectId)?.name ?? projectId;
  const resolveProjectPath = (projectId: string) =>
    projectState.allProjects().find((project) => project.id === projectId)?.path ?? "";

  const executionItems = (): QueueSelectedItem[] =>
    cleanupState.cleanupQueue().flatMap((entry) => {
      const selectedSet = new Set(cleanupState.selectedPlanIdsForProject(entry.projectId));
      return cleanupState
        .planForProject(entry.projectId)
        .filter((item) => selectedSet.has(item.id))
        .map((item) => ({ ...item, projectId: entry.projectId }));
    });

  const executionProjectSummaries = () =>
    buildExecutionProjectSummaries(
      cleanupState.cleanupQueue(),
      resolveProjectName,
      cleanupState.projectPolicyForProject,
      executionItems(),
    );

  const refreshAfterExecution = async (projectIds: string[]) => {
    const uniqueProjectIds = Array.from(new Set(projectIds));
    await Promise.allSettled(
      uniqueProjectIds.map((projectId) =>
        cleanupState.refreshPlanForProject(projectId, resolveProjectPath(projectId)),
      ),
    );
    refetchHistory();
    scanState.autoScanProjects().catch(() => undefined);
  };

  const planRangeText = (projectId: string) => {
    const selectedIds = cleanupState.selectedPlanIdsForProject(projectId);
    const labels = cleanupState
      .planForProject(projectId)
      .filter((item) => selectedIds.includes(item.id))
      .map((item) => item.label);
    return labels.length ? labels.join(" · ") : "未选择内容";
  };

  const runExecution = async () => {
    const projectSummaries = executionProjectSummaries();
    if (!projectSummaries.length) return;
    setExecuteInProgress(true);
    try {
      const response = await executeCleanup({
        dryRun: false,
        entries: cleanupState.cleanupQueue().map((entry) => ({
          projectId: entry.projectId,
          selectedItemIds: cleanupState.selectedPlanIdsForProject(entry.projectId),
          safeMode: cleanupState.projectPolicyForProject(entry.projectId).safeMode,
        })),
      });
      const projects = response.projectResults.map((projectResult) => ({
        projectId: projectResult.projectId,
        projectName: resolveProjectName(projectResult.projectId),
        status:
          projectResult.status === "dryRun"
            ? "dryRun"
            : projectResult.status === "partial"
              ? "partial"
              : projectResult.status === "failed"
                ? "failed"
                : "success",
        releasedGb: bytesToGb(projectResult.releasedBytes),
        removedCount: projectResult.removedCount,
        policyScope: cleanupState.projectPolicyForProject(projectResult.projectId).scope,
        removedPaths: projectResult.removedPaths ?? [],
        failedPaths: projectResult.failedPaths ?? [],
      })) as ExecutionResultProject[];
      setExecutionResult({
        executedAt: new Date().toISOString(),
        modeLabel: resolveExecutionModeLabel(projectSummaries),
        projectCount: projects.length,
        itemCount: projects.reduce((sum, project) => sum + project.removedCount, 0),
        releasedGb: bytesToGb(response.totalReleasedBytes),
        projects,
      });
      refetchHistory();
      setResultOpen(true);
      await refreshAfterExecution(projectSummaries.map((project) => project.projectId));
    } catch (error) {
      console.error("[cleanup] execute failed", error);
      window.alert("这次清理没有完成，请稍后重试。");
    } finally {
      setExecuteInProgress(false);
    }
  };

  const runWithNativeConfirm = async () => {
    if (!hasActiveProject()) return;
    if (executeInProgress()) return;
    cleanupState.setCleanupTargetProject(activeProject().id);
    if (!activeProjectStats().selectedCount) return;

    const policyLabel = activeProjectPolicy().scope === "project" ? "这个项目的设置" : "默认设置";
    const message = [
      `项目：${activeProject().name}`,
      `方式：${policyLabel}`,
      `条目：${activeProjectStats().selectedCount} 项`,
      `预计释放：${formatSizeFromGb(activeProjectStats().selectedSize)}`,
      `内容：${planRangeText(activeProject().id)}`,
    ].join("\n");

    let confirmed = false;
    try {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      confirmed = await confirm(message, {
        title: "开始清理前确认",
        kind: "warning",
        okLabel: "开始清理",
        cancelLabel: "取消",
      });
    } catch {
      confirmed = window.confirm(message);
    }

    confirmed && runExecution();
  };

  createEffect(() => {
    const scanAt = scanState.lastScanAt();
    if (scanAt !== lastPlanScanAt) {
      refreshedPlanProjects.clear();
      lastPlanScanAt = scanAt;
    }
    const project = activeProject();
    if (!project.id) return;
    cleanupState.setCleanupTargetProject(project.id);
    if (refreshedPlanProjects.has(project.id)) return;
    refreshedPlanProjects.add(project.id);
    cleanupState.refreshPlanForProject(project.id, project.path);
  });

  return (
    <section class={workbenchClass}>
      <CleanupSidebar
        projects={projectState.visibleProjects()}
        selectedProjectId={projectState.selectedProjectId()}
        loading={scanState.scanInProgress() && projectState.visibleProjects().length === 0}
        loadingText={scanState.scanStatusText() || "正在查找项目..."}
        activeProjectName={activeProject().name}
        policyScopeLabel={
          activeProjectPolicy().scope === "project" ? "使用这个项目的设置" : "使用默认设置"
        }
        onSelectProject={projectState.setSelectedProjectId}
      />

      <section class={cn(paneClass, splitPaneClass)}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>清理范围</h2>
          <span class={toolbarMetaClass}>
            {activeProjectStats().selectedCount} 项 · {formatSizeFromGb(activeProjectStats().selectedSize)}
          </span>
        </div>

        <div class={paneScrollClass}>
          <CleanupSummary
            state={{
              policy: activeProjectPolicy(),
              selectedCount: activeProjectStats().selectedCount,
              selectedSize: activeProjectStats().selectedSize,
            }}
          />
          <ProjectPolicyPanel
            hasActiveProject={hasActiveProject()}
            policy={activeProjectPolicy()}
            overrideEnabled={Boolean(activeProjectPolicyOverride()?.enabled)}
            actions={{
              onToggleOverride: () =>
                hasActiveProject() &&
                cleanupState.setProjectPolicyEnabled(
                  activeProject().id,
                  !Boolean(activeProjectPolicyOverride()?.enabled),
                ),
              onToggleAutoCleanup: () =>
                hasActiveProject() &&
                cleanupState.updateProjectPolicy(activeProject().id, {
                  autoCleanupEnabled: !activeProjectPolicy().autoCleanupEnabled,
                }),
              onThresholdChange: (value) =>
                hasActiveProject() &&
                cleanupState.updateProjectPolicy(activeProject().id, {
                  inactiveThresholdDays: value,
                }),
              onCacheMtimeChange: (value) =>
                hasActiveProject() &&
                cleanupState.updateProjectPolicy(activeProject().id, {
                  cacheMtimeDays: value,
                }),
              onToggleSafeMode: () =>
                hasActiveProject() &&
                cleanupState.updateProjectPolicy(activeProject().id, {
                  safeMode: !activeProjectPolicy().safeMode,
                }),
            }}
          />
          <CleanupPlanList state={activePlanState()} onToggleItem={cleanupState.togglePlanItem} />
          <CleanupHistory
            loading={historyResource.loading}
            entries={historyEntries()}
            total={historyTotal()}
            resolveProjectName={resolveProjectName}
          />
        </div>

        <div class={paneFooterClass}>
          <span>
            {activeProjectPolicy().scope === "project" ? "将使用这个项目的设置清理" : "将使用默认设置清理"}
          </span>
          <Button
            onClick={runWithNativeConfirm}
            disabled={
              !hasActiveProject() ||
              activeProjectStats().selectedCount === 0 ||
              activePlanState().loading ||
              executeInProgress()
            }
          >
            {executeInProgress() ? "清理中..." : "开始清理"}
          </Button>
        </div>
      </section>

      <Show when={resultOpen() && executionResult()}>
        {(result) => <ExecutionResultDrawer result={result()} onClose={() => setResultOpen(false)} />}
      </Show>
    </section>
  );
};
