import type { DiscoveredProject } from "~/services/cleanupClient";
import type { SettingsTabKey } from "~/workspace/types";

type ProjectSnapshotForScan = {
  id: string;
  name: string;
  path: string;
  kind: "repo-root" | "package" | "single";
  reclaimableGb: number;
  inactiveDays: number;
  packageManagers: string[];
  technology: {
    languages: string[];
    frameworks: string[];
    buildTools: string[];
    commandRunner: string | null;
  };
  workspaceUnits: number;
  startupCommands: DiscoveredProject["startupCommands"];
};

export const resolveSettingsTab = (value: string | undefined): SettingsTabKey | undefined =>
  value === "appearance" || value === "scan" || value === "cleanup" ? value : undefined;

export const describeAutoCleanupFeedback = (triggered: boolean, reason: string) => {
  if (triggered) {
    const matched = reason.match(/executed auto cleanup: (\d+) succeeded, (\d+) failed/i);
    if (!matched) return "已按当前设置完成一次自动清理。";
    const succeeded = Number(matched[1]);
    const failed = Number(matched[2]);
    return failed > 0
      ? `已完成自动清理，${succeeded} 个项目已处理，${failed} 个项目未完成。`
      : `已完成自动清理，共处理 ${succeeded} 个项目。`;
  }

  if (reason.includes("already running")) return "自动清理正在进行中。";
  if (reason.includes("auto cleanup disabled")) return "自动清理当前已关闭。";
  if (reason.includes("no projects discovered")) return "当前还没有可清理的项目。";
  if (reason.includes("no low-risk cleanup items")) return "当前没有适合自动清理的内容。";
  if (reason.includes("next auto cleanup in")) {
    const days = reason.match(/(\d+)/)?.[1];
    return days ? `距离下一次自动清理还有 ${days} 天。` : "还没到下一次自动清理时间。";
  }
  return "当前不需要自动清理。";
};

export const toVisibleScanProjects = (projects: ProjectSnapshotForScan[]): DiscoveredProject[] =>
  projects.map((item) => ({
    id: item.id,
    name: item.name,
    path: item.path,
    kind: item.kind === "repo-root" ? "repoRoot" : item.kind,
    reclaimableBytes: Math.round(item.reclaimableGb * 1024 * 1024 * 1024),
    inactiveDays: item.inactiveDays,
    packageManager: undefined,
    packageManagers: [...item.packageManagers],
    techProfile: {
      languages: [...item.technology.languages],
      frameworks: [...item.technology.frameworks],
      buildTools: [...item.technology.buildTools],
      commandRunner: item.technology.commandRunner,
    },
    workspaceUnits: item.workspaceUnits,
    startupCommands: [...item.startupCommands],
  }));
