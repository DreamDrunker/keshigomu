import { createEffect, createMemo, createRoot, createSignal, type Accessor, type Setter } from "solid-js";
import { useScanRoots } from "~/hooks/useScanRoots";
import type { MonorepoMode, ProjectSnapshot } from "~/workspace/types";

const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;

type ProjectState = {
  allProjects: Accessor<ProjectSnapshot[]>;
  selectedProjectId: Accessor<string>;
  setSelectedProjectId: Setter<string>;
  monorepoMode: Accessor<MonorepoMode>;
  setMonorepoMode: Setter<MonorepoMode>;
  visibleProjects: Accessor<ProjectSnapshot[]>;
  activeProject: Accessor<ProjectSnapshot>;
  stepProject: (offset: number) => void;
};

const normalizeProjectKind = (kind: string): ProjectSnapshot["kind"] =>
  kind === "package" ? "package" : kind === "repoRoot" ? "repo-root" : "single";

const normalizePackageManager = (
  value: string | undefined,
): ProjectSnapshot["packageManagers"][number] =>
  value === "pnpm"
    ? "pnpm"
    : value === "bun"
      ? "bun"
      : value === "npm" || value === "yarn"
        ? "npm"
        : value === "cargo"
          ? "cargo"
          : "unknown";

const normalizePackageManagers = (
  values: string[] | undefined,
  fallback: string | undefined,
): ProjectSnapshot["packageManagers"] =>
  (values?.length ? values : [fallback ?? "unknown"])
    .map((value) => normalizePackageManager(value))
    .filter((value, index, allValues) => allValues.indexOf(value) === index);

const hasFrontendPackageManager = (project: ProjectSnapshot) =>
  project.packageManagers.some(
    (packageManager) =>
      packageManager === "pnpm" || packageManager === "bun" || packageManager === "npm",
  );

const isHybridRootProject = (project: ProjectSnapshot) =>
  project.kind === "repo-root" &&
  project.packageManagers.includes("cargo") &&
  hasFrontendPackageManager(project);

const emptyProjectSnapshot: ProjectSnapshot = {
  id: "",
  name: "未发现项目",
  path: "",
  packageManagers: ["unknown"],
  reclaimableGb: 0,
  inactiveDays: 0,
  kind: "single",
  profile: "未扫描",
  stack: "待识别",
  runtime: "unknown",
  workspaceRole: "未知",
  workspaceUnits: 0,
  startupCommands: [],
};

const toProjectSnapshot = (
  project: {
    id: string;
    name: string;
    path: string;
    kind: string;
    reclaimableBytes?: number;
    inactiveDays?: number;
    packageManager?: string;
    packageManagers?: string[];
    bundler?: string;
    framework?: string;
    runtime?: string;
    workspaceUnits: number;
    startupCommands: Array<{
      label: string;
      command: string;
    }>;
  },
): ProjectSnapshot => {
  const normalizedKind = normalizeProjectKind(project.kind);
  const isRepoRoot = normalizedKind === "repo-root";
  const isPackage = normalizedKind === "package";
  const normalizedFramework = project.framework && project.framework !== "unknown"
    ? project.framework
    : "unknown";
  const normalizedBundler = project.bundler && project.bundler !== "unknown"
    ? project.bundler
    : "unknown";
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    packageManagers: normalizePackageManagers(project.packageManagers, project.packageManager),
    reclaimableGb: bytesToGb(Math.max(0, Number(project.reclaimableBytes || 0))),
    inactiveDays: Math.max(0, Math.round(Number(project.inactiveDays || 0))),
    kind: normalizedKind,
    profile: isRepoRoot ? "仓库根目录" : isPackage ? "工作区子包" : "独立项目",
    stack:
      normalizedFramework !== "unknown" || normalizedBundler !== "unknown"
        ? `${normalizedFramework} + ${normalizedBundler}`
        : "待识别",
    runtime: project.runtime ?? "unknown",
    workspaceRole: isRepoRoot ? "仓库根目录" : isPackage ? "monorepo 子包" : "单项目",
    workspaceUnits: Math.max(1, Math.round(Number(project.workspaceUnits || 1))),
    startupCommands: project.startupCommands ?? [],
  };
};

const createProjectState = (): ProjectState => {
  const scan = useScanRoots();
  const [selectedProjectId, setSelectedProjectId] = createSignal("");
  const [monorepoMode, setMonorepoMode] = createSignal<MonorepoMode>("repoRootOnly");

  const allProjects = createMemo(() => scan.lastScanProjects().map((project) => toProjectSnapshot(project)));

  const visibleProjects = createMemo(() => {
    if (monorepoMode() === "repoRootOnly")
      return allProjects().filter((project) => project.kind === "repo-root");
    if (monorepoMode() === "packagesOnly")
      return allProjects().filter((project) => project.kind === "package" || isHybridRootProject(project));
    return allProjects();
  });

  createEffect(() => {
    const scopedProjects = visibleProjects();
    if (scopedProjects.length === 0) {
      selectedProjectId() && setSelectedProjectId("");
      return;
    }
    if (!scopedProjects.some((project) => project.id === selectedProjectId()))
      setSelectedProjectId(scopedProjects[0].id);
  });

  const activeProject = () =>
    allProjects().find((project) => project.id === selectedProjectId()) ??
    allProjects()[0] ??
    emptyProjectSnapshot;

  const stepProject = (offset: number) => {
    const scopedProjects = visibleProjects();
    if (scopedProjects.length === 0) return;
    const currentIndex = scopedProjects.findIndex((project) => project.id === selectedProjectId());
    const baseIndex = currentIndex < 0 ? 0 : currentIndex;
    const nextIndex = (baseIndex + offset + scopedProjects.length) % scopedProjects.length;
    setSelectedProjectId(scopedProjects[nextIndex].id);
  };

  return {
    allProjects,
    selectedProjectId,
    setSelectedProjectId,
    monorepoMode,
    setMonorepoMode,
    visibleProjects,
    activeProject,
    stepProject,
  };
};

let projectState: ProjectState | null = null;

export const useProject = () => projectState ?? (projectState = createRoot(() => createProjectState()));
