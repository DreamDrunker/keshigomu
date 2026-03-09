import { For } from "solid-js";
import { ProjectList } from "~/components/workspace/projectList";
import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import { formatSizeFromGb } from "~/lib/size";
import { cn } from "~/lib/utils";
import {
  inspectorClass,
  inspectorLabelClass,
  inspectorRowClass,
  inspectorValueClass,
  paneClass,
  paneFooterClass,
  paneScrollClass,
  paneTitleClass,
  paneToolbarClass,
  sheetClass,
  sheetHeaderClass,
  splitPaneClass,
  toolbarMetaClass,
  workbenchClass,
} from "~/lib/tailwind";
import { monorepoModeOptions } from "~/workspace/constants";
import type { MonorepoMode } from "~/workspace/types";

export const ManagePage = () => {
  const projectState = useProject();
  const scanState = useScanRoots();
  const activeProject = () => projectState.activeProject();

  return (
    <section class={workbenchClass}>
      <section class={paneClass}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>项目概览</h2>
          <label class="inline-flex items-center gap-[var(--space-2)]">
            <span class="text-[0.73rem] text-[var(--text-muted)]">展示范围</span>
            <select
              class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px] text-[0.75rem] text-[var(--text-normal)] outline-none"
              value={projectState.monorepoMode()}
              onInput={(event) => projectState.setMonorepoMode(event.currentTarget.value as MonorepoMode)}
            >
              <For each={monorepoModeOptions}>
                {(option) => <option value={option.value}>{option.label}</option>}
              </For>
            </select>
          </label>
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
          <span>扫描目录 {scanState.scanRoots().length} 个</span>
        </div>
      </section>

      <section class={cn(paneClass, splitPaneClass)}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>项目详情</h2>
          <span class={toolbarMetaClass}>{activeProject().profile}</span>
        </div>

        <div class={paneScrollClass}>
          <div class={inspectorClass}>
            <div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>项目类型</span>
                <p class={inspectorValueClass}>{activeProject().profile}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>语言栈</span>
                <p class={inspectorValueClass}>{activeProject().stack}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>运行时</span>
                <p class={inspectorValueClass}>{activeProject().runtime}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>包管理器</span>
                <p class={inspectorValueClass}>{activeProject().packageManagers.join(" · ")}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>工作区角色</span>
                <p class={inspectorValueClass}>{activeProject().workspaceRole}</p>
              </div>
            </div>
          </div>

          <div class={sheetClass}>
            <header class={sheetHeaderClass}>
              <span>启动方式</span>
              <strong class={toolbarMetaClass}>{activeProject().startupCommands.length} 条</strong>
            </header>
            <div>
              <For each={activeProject().startupCommands}>
                {(item) => (
                  <div class="grid gap-[var(--space-2)] border-t border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] first:border-t-0 max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]">
                    <span class="text-[0.73rem] text-[var(--text-muted)]">{item.label}</span>
                    <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]">
                      {item.command}
                    </code>
                  </div>
                )}
              </For>
            </div>
          </div>

          <div class={inspectorClass}>
            <div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>项目路径</span>
                <p class={inspectorValueClass}>{activeProject().path}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>可释放空间预估</span>
                <p class={inspectorValueClass}>{formatSizeFromGb(activeProject().reclaimableGb)}</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>最近活跃间隔</span>
                <p class={inspectorValueClass}>{activeProject().inactiveDays} 天</p>
              </div>
              <div class={inspectorRowClass}>
                <span class={inspectorLabelClass}>子项目数量</span>
                <p class={inspectorValueClass}>{activeProject().workspaceUnits} 个</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </section>
  );
};
