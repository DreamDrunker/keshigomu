import { createEffect, createMemo, createRoot, createSignal, type Accessor, type Setter } from "solid-js";
import {
  buildCleanupPlan,
  type CleanupPlanItem as NativeCleanupPlanItem,
} from "~/services/cleanupClient";
import { defaultCleanupRiskProfile } from "~/workspace/constants";
import type {
  CleanupRiskProfile,
  CleanupRiskProfileKey,
  CleanupQueueEntry,
  EffectiveProjectPolicy,
  PlanCategory,
  PlanItem,
  ProjectPolicyOverride,
  QueueProjectStats,
  RiskLevel,
} from "~/workspace/types";

const bytesToGb = (bytes: number) => bytes / 1024 / 1024 / 1024;
const normalizeRisk = (risk: string): "low" | "medium" => (risk === "low" ? "low" : "medium");
const normalizeRiskLevel = (risk: string): RiskLevel => (risk === "medium" ? "medium" : "low");
const normalizePlanCategory = (value: string | undefined): PlanCategory =>
  value === "cache" || value === "build" || value === "report" || value === "temp"
    ? value
    : "temp";
const normalizePathForRisk = (value: string | undefined) =>
  String(value || "").replace(/\\/g, "/").toLowerCase();
const isDependenciesPath = (path: string) =>
  path.endsWith("/node_modules") || path.includes("/node_modules/");
const isRustTargetPath = (path: string) => path.endsWith("/target") || path.includes("/target/");
const resolveRiskProfileKey = (category: PlanCategory, path: string): CleanupRiskProfileKey =>
  isDependenciesPath(path)
    ? "dependencies"
    : isRustTargetPath(path)
      ? "rustTarget"
      : category;
const resolveRiskByProfile = (
  category: PlanCategory,
  path: string,
  riskProfile: CleanupRiskProfile,
): RiskLevel => riskProfile[resolveRiskProfileKey(category, path)];
const resolvePlanCategory = (path: string): PlanCategory => {
  const text = path.toLowerCase();
  if (
    text.includes("cache") ||
    text.includes(".next") ||
    text.includes(".turbo") ||
    text.includes(".bun")
  )
    return "cache";
  if (
    text.endsWith("/dist") ||
    text.includes("/dist/") ||
    text.endsWith("/build") ||
    text.includes("/build/") ||
    text.endsWith("/out") ||
    text.includes("/out/") ||
    text.endsWith("/target") ||
    text.includes("/target/")
  )
    return "build";
  if (text.includes("coverage")) return "report";
  return "temp";
};
const toPlanItems = (
  items: NativeCleanupPlanItem[],
  riskProfile: CleanupRiskProfile,
): PlanItem[] =>
  items.map((item) => ({
    category: item.category
      ? normalizePlanCategory(item.category)
      : resolvePlanCategory(item.path),
    path: normalizePathForRisk(item.path),
    nativeRisk: normalizeRisk(item.risk),
    item,
  }))
    .map(({ item, category, path, nativeRisk }) => ({
    id: item.itemId,
    label: item.label,
    relativePath: item.path,
    sizeGb: bytesToGb(item.estimatedSizeBytes),
    risk:
      resolveRiskByProfile(category, path, riskProfile) ??
      nativeRisk,
    category,
    impact: item.source
      ? `来源 ${item.source}`
      : item.recommended
        ? "推荐清理项"
        : "可选清理项",
    recommended: item.recommended,
  }));
const applyRiskProfileToPlans = (
  plans: Record<string, PlanItem[]>,
  riskProfile: CleanupRiskProfile,
) =>
  Object.fromEntries(
    Object.entries(plans).map(([projectId, items]) => [
      projectId,
      items.map((item) => ({
        ...item,
        risk: resolveRiskByProfile(
          item.category,
          normalizePathForRisk(item.relativePath),
          riskProfile,
        ),
      })),
    ]),
  );
const normalizeThresholdDays = (value: number) => Math.max(1, Math.round(value || 1));
const normalizeAutoIntervalDays = (value: number) => Math.max(1, Math.round(value || 1));
const toThresholdFields = (days: number) => ({
  inactiveThresholdDays: days,
  cacheMtimeDays: days,
});
const resolveSetterValue = <T,>(value: T | ((previous: T) => T), previous: T): T =>
  typeof value === "function" ? (value as (previous: T) => T)(previous) : value;
const dedupeIds = (ids: string[]) => Array.from(new Set(ids));
const sanitizeSelectedIds = (ids: string[], validIds: Set<string>) =>
  dedupeIds(ids.filter((id) => validIds.has(id)));
const sameIdList = (left: string[], right: string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);
const lowRiskPlanIds = (planItems: PlanItem[]) =>
  planItems.filter((item) => item.risk === "low").map((item) => item.id);

export type CleanupState = {
  safeMode: Accessor<boolean>;
  setSafeMode: Setter<boolean>;
  cleanupThresholdDays: Accessor<number>;
  setCleanupThresholdDays: Setter<number>;
  autoCleanupEnabled: Accessor<boolean>;
  setAutoCleanupEnabled: Setter<boolean>;
  autoCleanupIntervalDays: Accessor<number>;
  setAutoCleanupIntervalDays: Setter<number>;
  cleanupRiskProfile: Accessor<CleanupRiskProfile>;
  setCleanupRiskProfile: Setter<CleanupRiskProfile>;
  updateCleanupRiskProfile: (key: CleanupRiskProfileKey, value: RiskLevel) => void;
  resetCleanupRiskProfile: () => void;
  projectPolicyOverrides: Accessor<Record<string, ProjectPolicyOverride>>;
  replaceProjectPolicyOverrides: (overrides: Record<string, ProjectPolicyOverride>) => void;
  projectPlanSelections: Accessor<Record<string, string[]>>;
  replaceProjectPlanSelections: (selections: Record<string, string[]>) => void;
  projectPolicyForProject: (projectId: string) => EffectiveProjectPolicy;
  setProjectPolicyEnabled: (projectId: string, enabled: boolean) => void;
  updateProjectPolicy: (projectId: string, patch: Partial<ProjectPolicyOverride>) => void;
  refreshPlanForProject: (projectId: string, projectPath?: string) => Promise<void>;
  isPlanLoadingForProject: (projectId: string) => boolean;
  planErrorForProject: (projectId: string) => string;
  planForProject: (projectId: string) => PlanItem[];
  selectedPlanIdsForProject: (projectId: string) => string[];
  togglePlanItem: (projectId: string, itemId: string) => void;
  cleanupQueue: Accessor<CleanupQueueEntry[]>;
  isProjectInQueue: (projectId: string) => boolean;
  addProjectToQueue: (projectId: string) => void;
  setCleanupTargetProject: (projectId: string) => void;
  removeProjectFromQueue: (projectId: string) => void;
  clearCleanupQueue: () => void;
  queueEntryForProject: (projectId: string) => CleanupQueueEntry | undefined;
  replaceQueuePlanSelection: (projectId: string, planItemIds: string[]) => void;
  queueProjectStats: (projectId: string) => QueueProjectStats;
  cleanupQueueSummary: Accessor<{
    projectCount: number;
    selectedCount: number;
    selectedSize: number;
  }>;
};

export const createCleanupState = (): CleanupState => {
  const [safeMode, setSafeMode] = createSignal(true);
  const [cleanupThresholdDays, setCleanupThresholdDays] = createSignal(30);
  const [autoCleanupEnabled, setAutoCleanupEnabled] = createSignal(true);
  const [autoCleanupIntervalDays, applyAutoCleanupIntervalDays] = createSignal(30);
  const [cleanupRiskProfile, setCleanupRiskProfile] = createSignal<CleanupRiskProfile>({
    ...defaultCleanupRiskProfile,
  });
  const [projectPolicyOverrides, setProjectPolicyOverrides] = createSignal<
    Record<string, ProjectPolicyOverride>
  >({});
  const [projectPlanSelections, setProjectPlanSelections] = createSignal<Record<string, string[]>>({});
  const [projectPlans, setProjectPlans] = createSignal<Record<string, PlanItem[]>>({});
  const [projectPlanLoading, setProjectPlanLoading] = createSignal<Record<string, boolean>>({});
  const [projectPlanError, setProjectPlanError] = createSignal<Record<string, string>>({});
  const [cleanupQueue, setCleanupQueue] = createSignal<CleanupQueueEntry[]>([]);

  createEffect(() =>
    setProjectPlans((currentMap) =>
      applyRiskProfileToPlans(currentMap, cleanupRiskProfile()),
    ));

  const projectPolicyForProject = (projectId: string): EffectiveProjectPolicy => {
    const override = projectPolicyOverrides()[projectId];
    if (override?.enabled)
      return {
        scope: "project",
        safeMode: override.safeMode,
        autoCleanupEnabled: override.autoCleanupEnabled,
        inactiveThresholdDays: override.inactiveThresholdDays,
        cacheMtimeDays: override.cacheMtimeDays,
      };
    const thresholdDays = cleanupThresholdDays();
    return {
      scope: "global",
      safeMode: safeMode(),
      autoCleanupEnabled: autoCleanupEnabled(),
      ...toThresholdFields(thresholdDays),
    };
  };

  const setProjectPolicyEnabled = (projectId: string, enabled: boolean) => {
    setProjectPolicyOverrides((currentMap) => {
      const thresholdDays = cleanupThresholdDays();
      const existing = currentMap[projectId] ?? {
        enabled: false,
        safeMode: safeMode(),
        autoCleanupEnabled: autoCleanupEnabled(),
        ...toThresholdFields(thresholdDays),
      };
      return {
        ...currentMap,
        [projectId]: {
          ...existing,
          enabled,
        },
      };
    });
  };

  const updateProjectPolicy = (projectId: string, patch: Partial<ProjectPolicyOverride>) => {
    setProjectPolicyOverrides((currentMap) => {
      const thresholdDays = cleanupThresholdDays();
      const existing = currentMap[projectId] ?? {
        enabled: true,
        safeMode: safeMode(),
        autoCleanupEnabled: autoCleanupEnabled(),
        ...toThresholdFields(thresholdDays),
      };
      const nextThreshold =
        patch.inactiveThresholdDays ?? patch.cacheMtimeDays ?? existing.inactiveThresholdDays;
      return {
        ...currentMap,
        [projectId]: {
          ...existing,
          ...patch,
          ...toThresholdFields(normalizeThresholdDays(nextThreshold)),
          enabled: true,
        },
      };
    });
  };

  const planForProject = (projectId: string) => projectPlans()[projectId] ?? [];

  const isPlanLoadingForProject = (projectId: string) => Boolean(projectPlanLoading()[projectId]);

  const planErrorForProject = (projectId: string) => projectPlanError()[projectId] ?? "";

  const planSelectionStateForProject = (projectId: string, planItems = planForProject(projectId)) => {
    const validPlanIds = new Set(planItems.map((item) => item.id));
    const lowRiskSelection = lowRiskPlanIds(planItems);
    const savedSelection = projectPlanSelections()[projectId];
    return {
      editable: Boolean(projectPolicyOverrides()[projectId]?.enabled),
      savedSelection,
      editableSelection: savedSelection
        ? sanitizeSelectedIds(savedSelection, validPlanIds)
        : lowRiskSelection,
      lowRiskSelection,
    };
  };

  const applyLoadedPlan = (projectId: string, planItems: PlanItem[]) => {
    setProjectPlans((currentMap) => ({ ...currentMap, [projectId]: planItems }));
    const {
      editable,
      savedSelection,
      editableSelection,
      lowRiskSelection,
    } = planSelectionStateForProject(projectId, planItems);
    const nextSelection = editable ? editableSelection : lowRiskSelection;
    setCleanupQueue((entries) =>
      entries.map((entry) =>
        entry.projectId === projectId &&
        !sameIdList(entry.selectedPlanIds, nextSelection)
          ? { ...entry, selectedPlanIds: [...nextSelection] }
          : entry,
      ),
    );
    savedSelection &&
      !sameIdList(savedSelection, editableSelection) &&
      setProjectPlanSelections((currentMap) => ({
        ...currentMap,
        [projectId]: [...editableSelection],
      }));
  };

  const refreshPlanForProject = async (projectId: string, projectPath = "") => {
    setProjectPlanLoading((currentMap) => ({ ...currentMap, [projectId]: true }));
    setProjectPlanError((currentMap) => ({ ...currentMap, [projectId]: "" }));
    try {
      const response = await buildCleanupPlan({ projectIds: [projectId] });
      const currentPlan =
        response.plans.find((plan) => plan.projectId === projectId)?.items ??
        response.plans[0]?.items ??
        [];

      if (currentPlan.length > 0 || !projectPath || projectPath === projectId) {
        applyLoadedPlan(projectId, toPlanItems(currentPlan, cleanupRiskProfile()));
        setProjectPlanLoading((currentMap) => ({ ...currentMap, [projectId]: false }));
        return;
      }

      const fallbackResponse = await buildCleanupPlan({ projectIds: [projectPath] });
      const fallbackPlan =
        fallbackResponse.plans.find((plan) => plan.projectId === projectPath)?.items ??
        fallbackResponse.plans[0]?.items ??
        [];
      applyLoadedPlan(projectId, toPlanItems(fallbackPlan, cleanupRiskProfile()));
      setProjectPlanLoading((currentMap) => ({ ...currentMap, [projectId]: false }));
      return;
    } catch (error) {
      console.error("[cleanup] refresh plan failed", error);
      setProjectPlanError((currentMap) => ({ ...currentMap, [projectId]: "计划加载失败" }));
      setProjectPlanLoading((currentMap) => ({ ...currentMap, [projectId]: false }));
    }
  };

  const queueEntryForProject = (projectId: string) =>
    cleanupQueue().find((entry) => entry.projectId === projectId);

  const selectedPlanIdsForProject = (projectId: string) => {
    const { editable, editableSelection, lowRiskSelection } = planSelectionStateForProject(projectId);
    return editable ? editableSelection : lowRiskSelection;
  };

  const createQueueEntry = (projectId: string): CleanupQueueEntry => ({
    projectId,
    queuedAt: new Date().toISOString(),
    selectedPlanIds: selectedPlanIdsForProject(projectId),
    policySnapshot: projectPolicyForProject(projectId),
  });

  const isProjectInQueue = (projectId: string) =>
    cleanupQueue().some((entry) => entry.projectId === projectId);

  const addProjectToQueue = (projectId: string) => {
    setCleanupQueue((entries) =>
      entries.some((entry) => entry.projectId === projectId)
        ? entries
        : [...entries, createQueueEntry(projectId)],
    );
  };

  const setCleanupTargetProject = (projectId: string) => {
    setCleanupQueue((entries) =>
      entries.length === 1 && entries[0].projectId === projectId ? entries : [createQueueEntry(projectId)],
    );
  };

  const removeProjectFromQueue = (projectId: string) =>
    setCleanupQueue((entries) => entries.filter((entry) => entry.projectId !== projectId));

  const clearCleanupQueue = () => setCleanupQueue([]);

  const replaceQueuePlanSelection = (projectId: string, planItemIds: string[]) => {
    setCleanupQueue((entries) =>
      entries.map((entry) =>
        entry.projectId === projectId
          ? {
              ...entry,
              selectedPlanIds: [...planItemIds],
            }
          : entry,
      ),
    );
  };

  const togglePlanItem = (projectId: string, itemId: string) => {
    if (!projectPolicyOverrides()[projectId]?.enabled) return;
    const currentSelection = selectedPlanIdsForProject(projectId);
    const nextSelection = currentSelection.includes(itemId)
      ? currentSelection.filter((id) => id !== itemId)
      : [...currentSelection, itemId];

    setProjectPlanSelections((currentMap) => ({
      ...currentMap,
      [projectId]: nextSelection,
    }));
    isProjectInQueue(projectId) && replaceQueuePlanSelection(projectId, nextSelection);
  };

  const queueProjectStats = (projectId: string): QueueProjectStats => {
    const plan = planForProject(projectId);
    const selectedIds = selectedPlanIdsForProject(projectId);
    const selectedItems = plan.filter((item) => selectedIds.includes(item.id));
    return {
      selectedCount: selectedItems.length,
      selectedSize: selectedItems.reduce((sum, item) => sum + item.sizeGb, 0),
      totalCount: plan.length,
      totalSize: plan.reduce((sum, item) => sum + item.sizeGb, 0),
    };
  };

  const cleanupQueueSummary = createMemo(() =>
    cleanupQueue().reduce(
      (summary, entry) => {
        const stats = queueProjectStats(entry.projectId);
        return {
          projectCount: summary.projectCount + 1,
          selectedCount: summary.selectedCount + stats.selectedCount,
          selectedSize: summary.selectedSize + stats.selectedSize,
        };
      },
      { projectCount: 0, selectedCount: 0, selectedSize: 0 },
    ),
  );
  const setAutoCleanupIntervalDays = ((value: number | ((previous: number) => number)) =>
    applyAutoCleanupIntervalDays((previous) =>
      normalizeAutoIntervalDays(Number(resolveSetterValue(value, previous))),
    )) as Setter<number>;
  const setNormalizedCleanupRiskProfile = ((
    value: CleanupRiskProfile | ((previous: CleanupRiskProfile) => CleanupRiskProfile),
  ) =>
    setCleanupRiskProfile((previous) => {
      const nextValue = resolveSetterValue(value, previous);
      return {
        ...defaultCleanupRiskProfile,
        ...nextValue,
        cache: normalizeRiskLevel(nextValue.cache),
        build: normalizeRiskLevel(nextValue.build),
        report: normalizeRiskLevel(nextValue.report),
        temp: normalizeRiskLevel(nextValue.temp),
        dependencies: normalizeRiskLevel(nextValue.dependencies),
        rustTarget: normalizeRiskLevel(nextValue.rustTarget),
      };
    })) as Setter<CleanupRiskProfile>;
  const updateCleanupRiskProfile = (key: CleanupRiskProfileKey, value: RiskLevel) =>
    setNormalizedCleanupRiskProfile((current) => ({ ...current, [key]: normalizeRiskLevel(value) }));
  const resetCleanupRiskProfile = () => setNormalizedCleanupRiskProfile({ ...defaultCleanupRiskProfile });

  return {
    safeMode,
    setSafeMode,
    cleanupThresholdDays,
    setCleanupThresholdDays,
    autoCleanupEnabled,
    setAutoCleanupEnabled,
    autoCleanupIntervalDays,
    setAutoCleanupIntervalDays,
    cleanupRiskProfile,
    setCleanupRiskProfile: setNormalizedCleanupRiskProfile,
    updateCleanupRiskProfile,
    resetCleanupRiskProfile,
    projectPolicyOverrides,
    replaceProjectPolicyOverrides: (overrides: Record<string, ProjectPolicyOverride>) =>
      setProjectPolicyOverrides(
        Object.fromEntries(
          Object.entries(overrides).map(([projectId, override]) => [
            projectId,
            {
              ...override,
              autoCleanupEnabled: override.autoCleanupEnabled ?? true,
            },
          ]),
        ),
      ),
    projectPlanSelections,
    replaceProjectPlanSelections: (selections: Record<string, string[]>) =>
      setProjectPlanSelections(Object.fromEntries(
        Object.entries(selections).map(([projectId, ids]) => [projectId, [...ids]]),
      )),
    projectPolicyForProject,
    setProjectPolicyEnabled,
    updateProjectPolicy,
    refreshPlanForProject,
    isPlanLoadingForProject,
    planErrorForProject,
    planForProject,
    selectedPlanIdsForProject,
    togglePlanItem,
    cleanupQueue,
    isProjectInQueue,
    addProjectToQueue,
    setCleanupTargetProject,
    removeProjectFromQueue,
    clearCleanupQueue,
    queueEntryForProject,
    replaceQueuePlanSelection,
    queueProjectStats,
    cleanupQueueSummary,
  };
};

let cleanupState: CleanupState | null = null;

export const resetCleanupState = () => {
  cleanupState = null;
};

export const useCleanup = () => cleanupState ?? (cleanupState = createRoot(() => createCleanupState()));
