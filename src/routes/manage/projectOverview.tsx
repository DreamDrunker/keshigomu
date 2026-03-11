import { formatSizeFromGb } from "~/lib/size";
import {
  inspectorClass,
  inspectorLabelClass,
  inspectorRowClass,
  inspectorValueClass,
} from "~/lib/tailwind";
import type { ProjectSnapshot } from "~/workspace/types";
import {
  formatPackageManagers,
  formatPrimaryTechnology,
  joinLabels,
} from "./formatters";

type ProjectOverviewProps = {
  project: ProjectSnapshot;
};

export const ProjectOverview = (props: ProjectOverviewProps) => (
  <>
    <div class={inspectorClass}>
      <div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>项目类型</span>
          <p class={inspectorValueClass}>{props.project.profile}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>主要技术</span>
          <p class={inspectorValueClass}>{formatPrimaryTechnology(props.project)}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>构建工具</span>
          <p class={inspectorValueClass}>{joinLabels(props.project.technology.buildTools)}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>命令入口</span>
          <p class={inspectorValueClass}>{props.project.technology.commandRunner ?? "未识别"}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>包管理器</span>
          <p class={inspectorValueClass}>{formatPackageManagers(props.project)}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>工作区角色</span>
          <p class={inspectorValueClass}>{props.project.workspaceRole}</p>
        </div>
      </div>
    </div>

    <div class={inspectorClass}>
      <div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>所在位置</span>
          <p class={inspectorValueClass}>{props.project.path}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>预计可释放</span>
          <p class={inspectorValueClass}>{formatSizeFromGb(props.project.reclaimableGb)}</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>最近活跃</span>
          <p class={inspectorValueClass}>{props.project.inactiveDays} 天</p>
        </div>
        <div class={inspectorRowClass}>
          <span class={inspectorLabelClass}>包含子项目</span>
          <p class={inspectorValueClass}>{props.project.workspaceUnits} 个</p>
        </div>
      </div>
    </div>
  </>
);
