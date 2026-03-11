import { ProjectList } from "~/components/workspace/projectList";
import {
  paneClass,
  paneFooterClass,
  paneTitleClass,
  paneToolbarClass,
  toolbarMetaClass,
} from "~/lib/tailwind";
import type { ProjectSnapshot } from "~/workspace/types";

type CleanupSidebarProps = {
  projects: ProjectSnapshot[];
  selectedProjectId: string;
  loading: boolean;
  loadingText: string;
  activeProjectName: string;
  policyScopeLabel: string;
  onSelectProject: (projectId: string) => void;
};

export const CleanupSidebar = (props: CleanupSidebarProps) => (
  <section class={paneClass}>
    <div class={paneToolbarClass}>
      <h2 class={paneTitleClass}>清理</h2>
      <span class={toolbarMetaClass}>{props.projects.length} 个项目</span>
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
      <span>当前项目：{props.activeProjectName}</span>
      <span>{props.policyScopeLabel}</span>
    </div>
  </section>
);
