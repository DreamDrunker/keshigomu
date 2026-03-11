import { useProject } from "~/hooks/useProject";
import { useScanRoots } from "~/hooks/useScanRoots";
import {
  paneClass,
  paneScrollClass,
  paneTitleClass,
  paneToolbarClass,
  splitPaneClass,
  toolbarMetaClass,
  workbenchClass,
} from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import { monorepoModeOptions } from "~/workspace/constants";
import { ProjectBrowser } from "./projectBrowser";
import { ProjectCommands } from "./projectCommands";
import { ProjectOverview } from "./projectOverview";

export const ManagePage = () => {
  const projectState = useProject();
  const scanState = useScanRoots();
  const activeProject = () => projectState.activeProject();

  return (
    <section class={workbenchClass}>
      <ProjectBrowser
        projects={projectState.visibleProjects()}
        selectedProjectId={projectState.selectedProjectId()}
        scanRootCount={scanState.scanRoots().length}
        loading={scanState.scanInProgress() && projectState.visibleProjects().length === 0}
        loadingText={scanState.scanStatusText() || "正在查找项目..."}
        monorepoMode={projectState.monorepoMode()}
        monorepoModeOptions={monorepoModeOptions}
        onMonorepoModeChange={projectState.setMonorepoMode}
        onSelectProject={projectState.setSelectedProjectId}
      />

      <section class={cn(paneClass, splitPaneClass)}>
        <div class={paneToolbarClass}>
          <h2 class={paneTitleClass}>项目信息</h2>
          <span class={toolbarMetaClass}>{activeProject().profile}</span>
        </div>

        <div class={paneScrollClass}>
          <ProjectOverview project={activeProject()} />
          <ProjectCommands commands={activeProject().startupCommands} />
        </div>
      </section>
    </section>
  );
};
