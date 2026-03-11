import { createEffect, createMemo, createRoot, createSignal, type Accessor, type Setter } from "solid-js";
import type { DiscoveredProject, ProjectTechProfile } from "~/services/cleanupClient";
import { useScanRoots } from "~/hooks/useScanRoots";
import type { MonorepoMode, ProjectSnapshot } from "~/workspace/types";

const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;

export type ProjectState = {
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

const uniqueLabels = (values: string[]) =>
  values.filter((value, index, allValues) => value && allValues.indexOf(value) === index);

const normalizeTechnology = (
  techProfile: ProjectTechProfile | undefined,
): ProjectSnapshot["technology"] => ({
  languages: uniqueLabels(techProfile?.languages ?? []),
  frameworks: uniqueLabels(techProfile?.frameworks ?? []),
  buildTools: uniqueLabels(techProfile?.buildTools ?? []),
  commandRunner: techProfile?.commandRunner?.trim() || null,
});

const isHybridRootProject = (project: ProjectSnapshot) =>
  project.kind === "repo-root" &&
  hasFrontendPackageManager(project) &&
  (
    project.technology.frameworks.includes("Tauri") || project.technology.languages.includes("Rust")
  );

const emptyProjectSnapshot: ProjectSnapshot = {
  id: "",
  name: "未发现项目",
  path: "",
  packageManagers: ["unknown"],
  reclaimableGb: 0,
  inactiveDays: 0,
  kind: "single",
  profile: "未扫描",
  technology: {
    languages: [],
    frameworks: [],
    buildTools: [],
    commandRunner: null,
  },
  workspaceRole: "未知",
  workspaceUnits: 0,
  startupCommands: [],
};

const toProjectSnapshot = (project: DiscoveredProject): ProjectSnapshot => {
  const normalizedKind = normalizeProjectKind(project.kind);
  const isRepoRoot = normalizedKind === "repo-root";
  const isPackage = normalizedKind === "package";
  return {
    id: project.id,
    name: project.name,
    path: project.path,
    packageManagers: normalizePackageManagers(project.packageManagers, project.packageManager),
    reclaimableGb: bytesToGb(Math.max(0, Number(project.reclaimableBytes || 0))),
    inactiveDays: Math.max(0, Math.round(Number(project.inactiveDays || 0))),
    kind: normalizedKind,
    profile: isRepoRoot ? "仓库根目录" : isPackage ? "工作区子包" : "独立项目",
    technology: normalizeTechnology(project.techProfile),
    workspaceRole: isRepoRoot ? "仓库根目录" : isPackage ? "monorepo 子包" : "单项目",
    workspaceUnits: Math.max(1, Math.round(Number(project.workspaceUnits || 1))),
    startupCommands: project.startupCommands ?? [],
  };
};

export const createProjectState = (): ProjectState => {
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

export const resetProjectState = () => {
  projectState = null;
};

export const useProject = () => projectState ?? (projectState = createRoot(() => createProjectState()));
