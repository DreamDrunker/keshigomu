import { For, type Component } from "solid-js";
import { ProjectList } from "~/components/workspace/projectList";
import {
  paneClass,
  paneFooterClass,
  paneTitleClass,
  paneToolbarClass,
  toolbarMetaClass,
} from "~/lib/tailwind";
import type { MonorepoMode, ProjectSnapshot } from "~/workspace/types";

type ProjectBrowserProps = {
  projects: ProjectSnapshot[];
  selectedProjectId: string;
  scanRootCount: number;
  loading: boolean;
  loadingText: string;
  monorepoMode: MonorepoMode;
  monorepoModeOptions: Array<{ value: MonorepoMode; label: string }>;
  onMonorepoModeChange: (mode: MonorepoMode) => void;
  onSelectProject: (projectId: string) => void;
};

export const ProjectBrowser: Component<ProjectBrowserProps> = (props) => (
  <section class={paneClass}>
    <div class={paneToolbarClass}>
      <h2 class={paneTitleClass}>项目概览</h2>
      <label class="inline-flex items-center gap-[var(--space-2)]">
        <span class="text-[0.73rem] text-[var(--text-muted)]">展示范围</span>
        <select
          class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px] text-[0.75rem] text-[var(--text-normal)] outline-none"
          value={props.monorepoMode}
          onInput={(event) => props.onMonorepoModeChange(event.currentTarget.value as MonorepoMode)}
        >
          <For each={props.monorepoModeOptions}>
            {(option) => <option value={option.value}>{option.label}</option>}
          </For>
        </select>
      </label>
    </div>

    <ProjectList
      projects={props.projects}
      selectedProjectId={props.selectedProjectId}
      onSelectProject={props.onSelectProject}
      loading={props.loading}
      loadingText={props.loadingText}
      emptyText="还没有找到项目，请先到设置添加扫描目录"
    />

    <div class={paneFooterClass}>
      <span>已添加 {props.scanRootCount} 个扫描目录</span>
      <span class={toolbarMetaClass}>{props.projects.length} 个项目</span>
    </div>
  </section>
);
