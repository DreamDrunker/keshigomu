import { For, Show, createEffect, createResource, createSignal } from "solid-js";
import { planCategoryLabels } from "~/workspace/constants";
import { useCleanup } from "~/hooks/useCleanup";
import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import {
  executeCleanup,
  listCleanupHistory,
  type ListCleanupHistoryRequest,
} from "~/services/cleanupClient";
import { ProjectList } from "~/components/workspace/projectList";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch";
import { formatSizeFromGb } from "~/lib/size";
import {
  inputClass,
  paneClass,
  paneFooterClass,
  paneScrollClass,
  paneTitleClass,
  paneToolbarClass,
  sheetClass,
  sheetHeaderClass,
  sheetLabelClass,
  sheetRowClass,
  sheetValueClass,
  splitPaneClass,
  surfaceClass,
  toolbarMetaClass,
  workbenchClass,
} from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import type {
  EffectiveProjectPolicy,
  PlanItem,
  PolicyScope,
} from "~/workspace/types";

type QueueSelectedItem = PlanItem & {
  projectId: string;
};

type FailedPath = {
  path: string;
  reason: string;
};

type ExecutionProjectSummary = {
  projectId: string;
  projectName: string;
  selectedCount: number;
  selectedSize: number;
  policyScope: PolicyScope;
  safeMode: boolean;
};

type ExecutionResultProject = {
  projectId: string;
  projectName: string;
  status: "success" | "dryRun" | "partial" | "failed";
  releasedGb: number;
  removedCount: number;
  policyScope: PolicyScope;
  removedPaths: string[];
  failedPaths: FailedPath[];
};

type ExecutionResultState = {
  executedAt: string;
  modeLabel: string;
  projectCount: number;
  itemCount: number;
  releasedGb: number;
  projects: ExecutionResultProject[];
};

const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;

const buildExecutionProjectSummaries = (
  entries: Array<{ projectId: string }>,
  resolveProjectName: (projectId: string) => string,
  resolvePolicy: (projectId: string) => EffectiveProjectPolicy,
  items: QueueSelectedItem[],
): ExecutionProjectSummary[] =>
  entries.map((entry) => {
    const projectItems = items.filter((item) => item.projectId === entry.projectId);
    const policy = resolvePolicy(entry.projectId);
    return {
      projectId: entry.projectId,
      projectName: resolveProjectName(entry.projectId),
      selectedCount: projectItems.length,
      selectedSize: projectItems.reduce((sum, item) => sum + item.sizeGb, 0),
      policyScope: policy.scope,
      safeMode: policy.safeMode,
    };
  });

const resolveExecutionModeLabel = (projects: ExecutionProjectSummary[]) => {
  if (projects.length === 0) return "按当前设置";
  const hasSafeMode = projects.some((project) => project.safeMode);
  const hasForceMode = projects.some((project) => !project.safeMode);
  if (hasSafeMode && hasForceMode) return "按项目设置（混合）";
  return hasSafeMode ? "系统回收站模式" : "彻底删除模式";
};

const formatExecutedTime = (value: string) => {
  const numeric = Number(value);
  const date = /^\d+$/.test(value.trim())
    ? new Date((numeric < 10_000_000_000 ? numeric * 1000 : numeric))
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

const cleanupStatusLabel = (status: string) =>
  status === "success"
    ? "成功"
    : status === "dryRun"
      ? "演练"
      : status === "partial"
        ? "部分成功"
        : status === "failed"
          ? "失败"
          : "跳过";
const cleanupRunTypeLabel = (runType: string) =>
  runType === "auto" ? "自动" : "手动";
const previewRemovedPaths = (paths: string[], limit = 8) => ({
  list: paths.slice(0, limit),
  hiddenCount: Math.max(0, paths.length - limit),
});
const previewFailedPaths = (paths: FailedPath[], limit = 8) => ({
  list: paths.slice(0, limit),
  hiddenCount: Math.max(0, paths.length - limit),
});

const policyRowClass =
  "flex items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-3)] max-[900px]:bg-[var(--panel)]";

const numberFieldClass = "grid gap-[var(--space-1)]";

const numberLabelClass = "text-[0.76rem] text-[var(--text-muted)]";

const planListClass = `${surfaceClass} mt-[var(--space-3)] overflow-hidden`;

const stackedListClass = `${surfaceClass} overflow-hidden`;

const stackedItemClass =
  "px-[var(--space-3)] py-[var(--space-2)] [&+&]:border-t [&+&]:border-[color:var(--line)]";

const detailsClass = "group mt-[var(--space-2)]";

const detailsSummaryClass =
  "flex cursor-pointer list-none items-center gap-1 text-[0.72rem] font-semibold text-[var(--primary)] [&::-webkit-details-marker]:hidden";

const drawerClass =
  "fixed right-0 top-[var(--titlebar-height)] z-30 flex h-[calc(100dvh-var(--titlebar-height))] w-[min(560px,calc(100vw-30px))] flex-col border-l border-[color:var(--line)] bg-[var(--panel)] max-[900px]:w-screen";

export const CleanupPage = () => {
  const projectState = useProject();
  const cleanupState = useCleanup();
  const scanState = useScanRoots();
  const historyRequest = (): ListCleanupHistoryRequest => {
    const projectId = projectState.selectedProjectId();
    return {
      limit: 500,
      offset: 0,
      projectId: projectId || undefined,
    };
  };
  const [historyResource, { refetch: refetchHistory }] = createResource(
    historyRequest,
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
  const activeProjectPolicyOverrideEnabled = () => Boolean(activeProjectPolicyOverride()?.enabled);
  const activeProjectStats = () => cleanupState.queueProjectStats(activeProject().id);
  const activeSelectedPlanIds = () => cleanupState.selectedPlanIdsForProject(activeProject().id);
  const activePlan = () => cleanupState.planForProject(activeProject().id);
  const activePlanLoading = () => cleanupState.isPlanLoadingForProject(activeProject().id);
  const activePlanError = () => cleanupState.planErrorForProject(activeProject().id);
  const historyEntries = () => historyResource()?.entries ?? [];
  const historyTotal = () => historyResource()?.total ?? 0;
  const resolveProjectName = (projectId: string) =>
    projectState
      .allProjects()
      .find((project) => project.id === projectId)
      ?.name ?? projectId;
  const resolveProjectPath = (projectId: string) =>
    projectState
      .allProjects()
      .find((project) => project.id === projectId)
      ?.path ?? "";

  const executionItems = () =>
    cleanupState.cleanupQueue().flatMap((entry) => {
      const selectedSet = new Set(entry.selectedPlanIds);
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
    const selectedIds = cleanupState.queueEntryForProject(projectId)?.selectedPlanIds ?? [];
    const selectedItems = cleanupState
      .planForProject(projectId)
      .filter((item) => selectedIds.includes(item.id));
    return selectedItems.length ? selectedItems.map((item) => item.label).join(" · ") : "未选择条目";
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
          selectedItemIds: entry.selectedPlanIds,
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
      return;
    } catch (error) {
      console.error("[cleanup] execute failed", error);
      window.alert("清理执行失败");
    } finally {
      setExecuteInProgress(false);
    }
  };

  const closeExecutionResult = () => setResultOpen(false);

  const runWithNativeConfirm = async () => {
    if (!hasActiveProject()) return;
    if (executeInProgress()) return;
    cleanupState.setCleanupTargetProject(activeProject().id);
    if (!activeProjectStats().selectedCount) return;

    const policyLabel = activeProjectPolicy().scope === "project" ? "本项目单独设置" : "全局默认设置";
    const message = [
      `项目：${activeProject().name}`,
      `策略：${policyLabel}`,
      `条目：${activeProjectStats().selectedCount} 项`,
      `预计释放：${formatSizeFromGb(activeProjectStats().selectedSize)}`,
      `范围：${planRangeText(activeProject().id)}`,
    ].join("\n");

    let confirmed = false;
    try {
      const { confirm } = await import("@tauri-apps/plugin-dialog");
      confirmed = await confirm(message, {
        title: "确认立即清理",
        kind: "warning",
        okLabel: "立即清理",
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
      <section class={paneClass}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>清理</h2>
          <span class={toolbarMetaClass}>{projectState.visibleProjects().length} 个项目</span>
        </div>

        <ProjectList
          projects={projectState.visibleProjects()}
          selectedProjectId={projectState.selectedProjectId()}
          onSelectProject={projectState.setSelectedProjectId}
          loading={scanState.scanInProgress() && projectState.visibleProjects().length === 0}
          loadingText={scanState.scanStatusText() || "正在扫描项目..."}
          emptyText="未发现项目，请前往设置添加扫描根目录"
        />

        <div class={paneFooterClass}>
          <span>当前项目：{activeProject().name}</span>
          <span>{activeProjectPolicy().scope === "project" ? "本项目单独设置" : "全局默认设置"}</span>
        </div>
      </section>

      <section class={cn(paneClass, splitPaneClass)}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>清理范围</h2>
          <span class={toolbarMetaClass}>
            {activeProjectStats().selectedCount} 项 · {formatSizeFromGb(activeProjectStats().selectedSize)}
          </span>
        </div>

        <div class={paneScrollClass}>
          <div class={sheetClass}>
            <header class={sheetHeaderClass}>
              <span>本次清理方式</span>
              <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                {activeProjectPolicy().scope === "project" ? "本项目单独设置" : "全局默认设置"}
              </strong>
            </header>
            <div>
              <div class={sheetRowClass}>
                <span class={sheetLabelClass}>安全模式</span>
                <code class={sheetValueClass}>
                  {activeProjectPolicy().safeMode ? "开启（移入系统回收站）" : "关闭（彻底删除）"}
                </code>
              </div>
              <div class={sheetRowClass}>
                <span class={sheetLabelClass}>清理阈值</span>
                <code class={sheetValueClass}>{activeProjectPolicy().inactiveThresholdDays} 天</code>
              </div>
              <div class={sheetRowClass}>
                <span class={sheetLabelClass}>将清理</span>
                <code class={sheetValueClass}>{activeProjectStats().selectedCount} 项</code>
              </div>
            </div>
          </div>

          <div class={sheetClass}>
            <header class={sheetHeaderClass}>
              <span>本项目单独设置</span>
              <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                {activeProjectPolicyOverrideEnabled() ? "已启用" : "未启用"}
              </strong>
            </header>
            <div class="grid gap-[var(--space-2)] px-[var(--space-3)] pb-[var(--space-3)] pt-[var(--space-1)]">
              <div class={policyRowClass}>
                <span class="text-[0.8rem] text-[var(--text-normal)]">为当前项目单独设置</span>
                <Switch
                  checked={activeProjectPolicyOverrideEnabled()}
                  onChange={() =>
                    hasActiveProject() &&
                    cleanupState.setProjectPolicyEnabled(
                      activeProject().id,
                      !activeProjectPolicyOverrideEnabled(),
                    )}
                  aria-label="启用项目覆盖策略"
                >
                  <SwitchControl>
                    <SwitchThumb />
                  </SwitchControl>
                </Switch>
              </div>

              <Show when={activeProjectPolicyOverrideEnabled()}>
                <div class={policyRowClass}>
                  <span class="text-[0.8rem] text-[var(--text-normal)]">项目自动清理</span>
                  <Switch
                    checked={activeProjectPolicy().autoCleanupEnabled}
                    onChange={() =>
                      hasActiveProject() &&
                      cleanupState.updateProjectPolicy(activeProject().id, {
                        autoCleanupEnabled: !activeProjectPolicy().autoCleanupEnabled,
                      })}
                    aria-label="项目自动清理"
                  >
                    <SwitchControl>
                      <SwitchThumb />
                    </SwitchControl>
                  </Switch>
                </div>

                <label class={numberFieldClass}>
                  <span class={numberLabelClass}>清理阈值（天）</span>
                  <input
                    class={inputClass}
                    value={String(activeProjectPolicy().inactiveThresholdDays)}
                    onInput={(event) =>
                      hasActiveProject() &&
                      cleanupState.updateProjectPolicy(activeProject().id, {
                        inactiveThresholdDays: Number(event.currentTarget.value) || 1,
                      })}
                    type="number"
                    min="1"
                  />
                </label>

                <label class={numberFieldClass}>
                  <span class={numberLabelClass}>缓存阈值（天）</span>
                  <input
                    class={inputClass}
                    value={String(activeProjectPolicy().cacheMtimeDays)}
                    onInput={(event) =>
                      hasActiveProject() &&
                      cleanupState.updateProjectPolicy(activeProject().id, {
                        cacheMtimeDays: Number(event.currentTarget.value) || 1,
                      })}
                    type="number"
                    min="1"
                  />
                </label>

                <div class={policyRowClass}>
                  <span class="text-[0.8rem] text-[var(--text-normal)]">安全模式（移入系统回收站）</span>
                  <Switch
                    checked={activeProjectPolicy().safeMode}
                    onChange={() =>
                      hasActiveProject() &&
                      cleanupState.updateProjectPolicy(activeProject().id, {
                        safeMode: !activeProjectPolicy().safeMode,
                      })}
                    aria-label="项目安全模式"
                  >
                    <SwitchControl>
                      <SwitchThumb />
                    </SwitchControl>
                  </Switch>
                </div>
              </Show>
            </div>
          </div>

          <Show when={activePlanError()}>
            <div class={sheetClass}>
              <header class={sheetHeaderClass}>
                <span>计划加载失败</span>
              </header>
              <div>
                <div class={sheetRowClass}>
                  <span class={sheetLabelClass}>原因</span>
                  <code class={sheetValueClass}>{activePlanError()}</code>
                </div>
              </div>
            </div>
          </Show>

          <Show when={activePlanLoading()}>
            <div class={sheetClass}>
              <header class={sheetHeaderClass}>
                <span>正在计算清理计划</span>
                <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                  请稍候
                </strong>
              </header>
            </div>
          </Show>

          <Show when={!activePlanLoading() && activePlan().length === 0}>
            <div class={sheetClass}>
              <header class={sheetHeaderClass}>
                <span>暂无可清理项</span>
              </header>
            </div>
          </Show>

          <div class={planListClass}>
            <For each={activePlan()}>
              {(item) => (
                <label class="grid items-center gap-[var(--space-3)] border-b border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] last:border-b-0 [grid-template-columns:auto_1fr_auto_auto] max-[900px]:grid-cols-[auto_1fr]">
                  <input
                    class="size-[15px] accent-[var(--primary)]"
                    type="checkbox"
                    checked={activeSelectedPlanIds().includes(item.id)}
                    onChange={() => cleanupState.togglePlanItem(activeProject().id, item.id)}
                  />
                  <div>
                    <p class="m-0 text-[0.83rem] font-semibold text-[var(--text-strong)]">
                      {item.label}
                    </p>
                    <p class="mt-[var(--space-1)] flex flex-wrap items-center gap-[var(--space-2)]">
                      <span class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.73rem] text-[var(--text-muted)]">
                        {item.relativePath}
                      </span>
                      <em class="rounded-full border border-[color:var(--line)] px-[6px] py-[3px] text-[0.66rem] not-italic text-[var(--text-muted)]">
                        {planCategoryLabels[item.category]}
                      </em>
                    </p>
                  </div>
                  <Badge variant={item.risk === "low" ? "success" : "warning"}>
                    {item.risk === "low" ? "低风险" : "中风险"}
                  </Badge>
                  <span class="font-mono text-[0.72rem] text-[var(--text-muted)]">
                    {formatSizeFromGb(item.sizeGb)}
                  </span>
                </label>
              )}
            </For>
          </div>

          <div class={sheetClass}>
            <header class={sheetHeaderClass}>
              <span>最近清理记录</span>
              <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                {historyTotal()} 条
              </strong>
            </header>
            <Show when={historyResource.loading}>
              <div>
                <div class={sheetRowClass}>
                  <span class={sheetLabelClass}>状态</span>
                  <code class={sheetValueClass}>加载中...</code>
                </div>
              </div>
            </Show>
            <Show when={!historyResource.loading && historyEntries().length === 0}>
              <div>
                <div class={sheetRowClass}>
                  <span class={sheetLabelClass}>状态</span>
                  <code class={sheetValueClass}>暂无执行记录</code>
                </div>
              </div>
            </Show>
            <Show when={historyEntries().length > 0}>
              <div class={stackedListClass}>
                <For each={historyEntries()}>
                  {(entry) => (
                    <div class={stackedItemClass}>
                      <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">
                        {formatExecutedTime(entry.executedAt)}
                      </p>
                      <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                        {cleanupRunTypeLabel(entry.runType)} · {cleanupStatusLabel(entry.status)} ·{" "}
                        {entry.projectCount} 项目 · {entry.itemCount} 条目 ·{" "}
                        {formatSizeFromGb(bytesToGb(entry.releasedBytes))}
                      </span>
                      <Show when={(entry.projectDetails ?? []).length > 0}>
                        <details class={detailsClass}>
                          <summary class={detailsSummaryClass}>
                            <span class="inline-block transition-transform duration-200 group-open:rotate-90">
                              ▸
                            </span>
                            查看清理明细
                          </summary>
                          <div class="mt-[var(--space-2)] grid gap-[var(--space-2)]">
                            <For each={entry.projectDetails}>
                              {(projectDetail) => {
                                const preview = previewRemovedPaths(projectDetail.removedPaths);
                                const failedPreview = previewFailedPaths(projectDetail.failedPaths ?? []);
                                return (
                                  <div class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] p-[var(--space-2)]">
                                    <p class="m-0 text-[0.74rem] font-semibold text-[var(--text-strong)]">
                                      {resolveProjectName(projectDetail.projectId)}
                                    </p>
                                    <span class="mt-1 block font-mono text-[0.69rem] text-[var(--text-muted)]">
                                      {cleanupStatusLabel(projectDetail.status)} ·{" "}
                                      {projectDetail.removedCount} 项 ·{" "}
                                      {formatSizeFromGb(bytesToGb(projectDetail.releasedBytes))}
                                    </span>
                                    <Show when={preview.list.length > 0}>
                                      <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                                        <For each={preview.list}>
                                          {(path) => (
                                            <code class="block break-all rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px] text-[0.69rem] leading-[1.5] text-[var(--text-normal)]">
                                              {path}
                                            </code>
                                          )}
                                        </For>
                                        <Show when={preview.hiddenCount > 0}>
                                          <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">
                                            还有 {preview.hiddenCount} 条未展开
                                          </p>
                                        </Show>
                                      </div>
                                    </Show>
                                    <Show when={failedPreview.list.length > 0}>
                                      <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                                        <For each={failedPreview.list}>
                                          {(failedPath) => (
                                            <div class="grid gap-[2px] rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px]">
                                              <code class="m-0 block break-all text-[0.69rem] leading-[1.45] text-[var(--text-normal)]">
                                                {failedPath.path}
                                              </code>
                                              <span class="m-0 text-[0.67rem] leading-[1.4] text-[var(--warning)]">
                                                {failedPath.reason}
                                              </span>
                                            </div>
                                          )}
                                        </For>
                                        <Show when={failedPreview.hiddenCount > 0}>
                                          <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">
                                            还有 {failedPreview.hiddenCount} 条未展开
                                          </p>
                                        </Show>
                                      </div>
                                    </Show>
                                  </div>
                                );
                              }}
                            </For>
                          </div>
                        </details>
                      </Show>
                    </div>
                  )}
                </For>
              </div>
            </Show>
          </div>
        </div>

        <div class={paneFooterClass}>
          <span>
            {activeProjectPolicy().scope === "project"
              ? "本次会按当前项目的单独设置执行"
              : "本次会按全局默认设置执行"}
          </span>
          <Button
            onClick={runWithNativeConfirm}
            disabled={
              !hasActiveProject() ||
              activeProjectStats().selectedCount === 0 ||
              activePlanLoading() ||
              executeInProgress()
            }
          >
            {executeInProgress() ? "执行中..." : "立即清理"}
          </Button>
        </div>
      </section>

      <Show when={resultOpen() && executionResult()}>
        <div
          class="fixed inset-x-0 bottom-0 top-[var(--titlebar-height)] z-20 bg-[rgba(15,23,42,0.28)]"
          onClick={closeExecutionResult}
        />
        <aside class={drawerClass} role="dialog" aria-label="执行结果">
          <header class="flex items-center justify-between gap-[var(--space-3)] border-b border-[color:var(--line)] px-[var(--space-4)] py-[var(--space-4)]">
            <div>
              <h3 class="m-0 text-[0.92rem] font-semibold text-[var(--text-strong)]">执行结果</h3>
              <p class="mt-[var(--space-1)] text-[0.74rem] text-[var(--text-muted)]">
                {formatExecutedTime(executionResult()!.executedAt)}
              </p>
            </div>
            <Badge variant="success">执行完成</Badge>
          </header>

          <section class="flex min-h-0 flex-col gap-[var(--space-3)] overflow-auto p-[var(--space-4)]">
            <div class="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] p-[var(--space-3)]">
              <p>
                执行模式 <strong>{executionResult()!.modeLabel}</strong>
              </p>
              <p>
                处理项目 <strong>{executionResult()!.projectCount}</strong> 个
              </p>
              <p>
                处理条目 <strong>{executionResult()!.itemCount}</strong> 项
              </p>
              <p>
                释放空间 <strong>{formatSizeFromGb(executionResult()!.releasedGb)}</strong>
              </p>
            </div>

            <div class={stackedListClass}>
              <For each={executionResult()!.projects}>
                {(project) => {
                  const preview = previewRemovedPaths(project.removedPaths, 12);
                  const failedPreview = previewFailedPaths(project.failedPaths, 12);
                  return (
                    <div class={stackedItemClass}>
                      <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">
                        {project.projectName}
                      </p>
                      <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                        {cleanupStatusLabel(project.status)} · {project.removedCount} 项 ·{" "}
                        {formatSizeFromGb(project.releasedGb)}
                      </span>
                      <Show when={preview.list.length > 0}>
                        <details class={detailsClass}>
                          <summary class={detailsSummaryClass}>
                            <span class="inline-block transition-transform duration-200 group-open:rotate-90">
                              ▸
                            </span>
                            查看已清理路径
                          </summary>
                          <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                            <For each={preview.list}>
                              {(path) => (
                                <code class="block break-all rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-2)] py-[6px] text-[0.69rem] leading-[1.5] text-[var(--text-normal)]">
                                  {path}
                                </code>
                              )}
                            </For>
                            <Show when={preview.hiddenCount > 0}>
                              <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">
                                还有 {preview.hiddenCount} 条未展开
                              </p>
                            </Show>
                          </div>
                        </details>
                      </Show>
                      <Show when={failedPreview.list.length > 0}>
                        <details class={detailsClass}>
                          <summary class={detailsSummaryClass}>
                            <span class="inline-block transition-transform duration-200 group-open:rotate-90">
                              ▸
                            </span>
                            查看失败路径
                          </summary>
                          <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                            <For each={failedPreview.list}>
                              {(failedPath) => (
                                <div class="grid gap-[2px] rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-2)] py-[6px]">
                                  <code class="m-0 block break-all text-[0.69rem] leading-[1.45] text-[var(--text-normal)]">
                                    {failedPath.path}
                                  </code>
                                  <span class="m-0 text-[0.67rem] leading-[1.4] text-[var(--warning)]">
                                    {failedPath.reason}
                                  </span>
                                </div>
                              )}
                            </For>
                            <Show when={failedPreview.hiddenCount > 0}>
                              <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">
                                还有 {failedPreview.hiddenCount} 条未展开
                              </p>
                            </Show>
                          </div>
                        </details>
                      </Show>
                    </div>
                  );
                }}
              </For>
            </div>

            <div class="mt-auto flex items-center justify-end gap-[var(--space-2)] border-t border-[color:var(--line)] pt-[var(--space-3)]">
              <Button onClick={closeExecutionResult}>完成</Button>
            </div>
          </section>
        </aside>
      </Show>
    </section>
  );
};
