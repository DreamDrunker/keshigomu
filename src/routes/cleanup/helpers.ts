import type { CleanupHistoryEntry } from "~/services/cleanupClient";
import type { EffectiveProjectPolicy } from "~/workspace/types";
import type {
  ExecutionProjectSummary,
  FailedPath,
  QueueSelectedItem,
} from "./types";

export const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;

export const buildExecutionProjectSummaries = (
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

export const resolveExecutionModeLabel = (projects: ExecutionProjectSummary[]) => {
  if (projects.length === 0) return "按当前方式";
  const hasSafeMode = projects.some((project) => project.safeMode);
  const hasForceMode = projects.some((project) => !project.safeMode);
  if (hasSafeMode && hasForceMode) return "按各项目设置";
  return hasSafeMode ? "移到系统回收站" : "直接删除";
};

export const formatExecutedTime = (value: string) => {
  const numeric = Number(value);
  const date = /^\d+$/.test(value.trim())
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? "刚刚" : `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
};

export const cleanupStatusLabel = (status: string) =>
  status === "success"
    ? "成功"
    : status === "dryRun"
      ? "试运行"
      : status === "partial"
        ? "部分成功"
        : status === "failed"
          ? "失败"
          : "跳过";

export const cleanupRunTypeLabel = (runType: CleanupHistoryEntry["runType"]) =>
  runType === "auto" ? "自动" : "手动";

export const previewRemovedPaths = (paths: string[], limit = 8) => ({
  list: paths.slice(0, limit),
  hiddenCount: Math.max(0, paths.length - limit),
});

export const previewFailedPaths = (paths: FailedPath[], limit = 8) => ({
  list: paths.slice(0, limit),
  hiddenCount: Math.max(0, paths.length - limit),
});
