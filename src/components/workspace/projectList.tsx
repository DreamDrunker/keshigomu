import { For, Match, Switch, type Component } from "solid-js";
import { formatSizeFromGb } from "~/lib/size";
import { cn } from "~/lib/utils";
import { surfaceClass } from "~/lib/tailwind";
import type { ProjectSnapshot } from "~/workspace/types";

type ProjectListProps = {
  projects: ProjectSnapshot[];
  selectedProjectId: string;
  onSelectProject: (projectId: string) => void;
  loading?: boolean;
  loadingText?: string;
  emptyText?: string;
  class?: string;
};

export const ProjectList: Component<ProjectListProps> = (props) => (
  <div
    class={cn(
      surfaceClass,
      "mt-(--space-3) min-h-0 overflow-y-auto overscroll-contain touch-pan-y",
      props.class,
    )}
  >
    <Switch>
      <Match when={props.loading}>
        <div class="grid min-h-45 place-items-center p-(--space-4)">
          <p class="m-0 text-[0.78rem] text-(--text-muted)">
            {props.loadingText || "正在加载项目..."}
          </p>
        </div>
      </Match>
      <Match when={props.projects.length > 0}>
        <For each={props.projects}>
          {(project) => (
            <div
              class={cn(
                "grid w-full cursor-pointer gap-(--space-3) border-b border-(--line) bg-transparent px-(--space-3) py-(--space-3) text-left transition-colors duration-200 grid-cols-[minmax(0,1fr)_auto] last:border-b-0 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-(--primary-outline) hover:bg-(--panel-soft) max-[900px]:grid-cols-1 max-[900px]:items-start",
                props.selectedProjectId === project.id && "bg-(--primary-soft)",
              )}
              onClick={() => props.onSelectProject(project.id)}
              onKeyDown={(event) =>
                (event.key === "Enter" || event.key === " ") &&
                (event.preventDefault(), props.onSelectProject(project.id))
              }
              role="button"
              tabIndex={0}
            >
              <div class="min-w-0">
                <p class="m-0 text-[0.86rem] font-bold text-(--text-strong)">
                  {project.name}
                </p>
                <p class="mt-(--space-1) truncate font-mono text-[0.73rem] text-(--text-muted)">
                  {project.path}
                </p>
              </div>

              <div class="flex items-center gap-(--space-2) font-mono text-[0.72rem] text-(--text-muted) max-[900px]:flex-wrap">
                <For each={project.packageManagers}>
                  {(packageManager) => (
                    <span class="rounded-full border border-(--line) px-1.5 py-px text-[0.68rem] text-(--text-normal)">
                      {packageManager}
                    </span>
                  )}
                </For>
                <span>{formatSizeFromGb(project.reclaimableGb)}</span>
                <span>{project.inactiveDays} 天</span>
              </div>
            </div>
          )}
        </For>
      </Match>
      <Match when={true}>
        <div class="grid min-h-45 place-items-center p-(--space-4)">
          <p class="m-0 text-[0.78rem] text-(--text-muted)">
            {props.emptyText || "暂无项目"}
          </p>
        </div>
      </Match>
    </Switch>
  </div>
);
