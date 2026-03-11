import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createTestRoot } from "~/test/solid";

const buildCleanupPlanMock = mock();
const scanProjectsMock = mock();
const executeCleanupMock = mock();
const runAutoCleanupMock = mock();
const listCleanupHistoryMock = mock();

mock.module("~/services/cleanupClient", () => ({
  scanProjects: scanProjectsMock,
  buildCleanupPlan: buildCleanupPlanMock,
  executeCleanup: executeCleanupMock,
  runAutoCleanup: runAutoCleanupMock,
  listCleanupHistory: listCleanupHistoryMock,
}));

mock.module("~/workspace/constants", () => ({
  initialScanRoots: [],
  defaultCleanupRiskProfile: {
    cache: "low",
    build: "low",
    report: "low",
    temp: "low",
    dependencies: "medium",
    rustTarget: "low",
  },
  themePresets: {
    current: { "--bg": "#ffffff" },
    white: { "--bg": "#ffffff" },
    black: { "--bg": "#000000" },
    lavender: { "--bg": "#f7f3ff" },
  },
}));

const cleanupModule = await import("./useCleanup");

describe("createCleanupState", () => {
  let state: ReturnType<typeof cleanupModule.createCleanupState>;
  let dispose: VoidFunction = () => undefined;

  beforeEach(() => {
    scanProjectsMock.mockReset();
    buildCleanupPlanMock.mockReset();
    executeCleanupMock.mockReset();
    runAutoCleanupMock.mockReset();
    listCleanupHistoryMock.mockReset();
    cleanupModule.resetCleanupState();
    ({ dispose, value: state } = createTestRoot(() => cleanupModule.createCleanupState()));
  });

  afterEach(() => {
    dispose();
  });

  test("loads plans and defaults non-overridden projects to low-risk items", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "dist",
              label: "dist",
              path: "dist",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "build",
            },
            {
              itemId: "node_modules",
              label: "node_modules",
              path: "/tmp/project-a/node_modules",
              estimatedSizeBytes: 2048,
              risk: "low",
              recommended: true,
              category: "temp",
            },
          ],
        },
      ],
    });

    await state.refreshPlanForProject("project-a");

    expect(state.planForProject("project-a").map((item) => item.id)).toEqual([
      "dist",
      "node_modules",
    ]);
    expect(state.selectedPlanIdsForProject("project-a")).toEqual(["dist"]);
    expect(state.queueProjectStats("project-a").selectedCount).toBe(1);
  });

  test("falls back to the project path when the scan-cache id is missing", async () => {
    buildCleanupPlanMock
      .mockResolvedValueOnce({ plans: [] })
      .mockResolvedValueOnce({
        plans: [
          {
            projectId: "/tmp/project-a",
            items: [
              {
                itemId: "target",
                label: "target",
                path: "target",
                estimatedSizeBytes: 2048,
                risk: "low",
                recommended: true,
                category: "build",
              },
            ],
          },
        ],
      });

    await state.refreshPlanForProject("project-a", "/tmp/project-a");

    expect(buildCleanupPlanMock).toHaveBeenNthCalledWith(1, {
      projectIds: ["project-a"],
    });
    expect(buildCleanupPlanMock).toHaveBeenNthCalledWith(2, {
      projectIds: ["/tmp/project-a"],
    });
    expect(state.planForProject("project-a").map((item) => item.id)).toEqual([
      "target",
    ]);
  });

  test("recomputes plan risk when the global risk profile changes", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "node_modules",
              label: "node_modules",
              path: "/tmp/project-a/node_modules",
              estimatedSizeBytes: 2048,
              risk: "low",
              recommended: true,
              category: "temp",
            },
          ],
        },
      ],
    });

    await state.refreshPlanForProject("project-a");
    expect(state.planForProject("project-a")[0]?.risk).toBe("medium");

    state.updateCleanupRiskProfile("dependencies", "low");
    await state.refreshPlanForProject("project-a");

    expect(state.planForProject("project-a")[0]?.risk).toBe("low");
    expect(state.selectedPlanIdsForProject("project-a")).toEqual(["node_modules"]);
  });

  test("keeps queue selections in sync for project-level overrides", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "dist",
              label: "dist",
              path: "dist",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "build",
            },
            {
              itemId: "node_modules",
              label: "node_modules",
              path: "/tmp/project-a/node_modules",
              estimatedSizeBytes: 2048,
              risk: "low",
              recommended: true,
              category: "temp",
            },
          ],
        },
      ],
    });

    await state.refreshPlanForProject("project-a");
    state.setProjectPolicyEnabled("project-a", true);
    state.addProjectToQueue("project-a");
    state.togglePlanItem("project-a", "node_modules");

    expect(state.projectPlanSelections()["project-a"]).toEqual([
      "dist",
      "node_modules",
    ]);
    expect(state.queueEntryForProject("project-a")?.selectedPlanIds).toEqual([
      "dist",
      "node_modules",
    ]);
    expect(state.queueProjectStats("project-a").selectedCount).toBe(2);
  });

  test("normalizes inferred categories, impact text, and numeric setters", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "cache",
              label: "cache",
              path: ".turbo/cache",
              estimatedSizeBytes: 1024,
              risk: "medium",
              recommended: false,
            },
            {
              itemId: "report",
              label: "report",
              path: "coverage",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: false,
              source: "scan",
            },
            {
              itemId: "target",
              label: "target",
              path: "/tmp/project-a/target",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
            },
            {
              itemId: "temp",
              label: "temp",
              path: "tmp/runtime",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: false,
            },
          ],
        },
      ],
    });

    state.setAutoCleanupIntervalDays(() => 0);
    state.updateProjectPolicy("project-a", { inactiveThresholdDays: 0 });
    await state.refreshPlanForProject("project-a");

    expect(state.autoCleanupIntervalDays()).toBe(1);
    expect(state.projectPolicyForProject("project-a")).toMatchObject({
      scope: "project",
      inactiveThresholdDays: 1,
      cacheMtimeDays: 1,
    });
    expect(state.planForProject("project-a").map((item) => item.category)).toEqual([
      "cache",
      "report",
      "build",
      "temp",
    ]);
    expect(state.planForProject("project-a").map((item) => item.impact)).toEqual([
      "可选清理项",
      "来源 scan",
      "推荐清理项",
      "可选清理项",
    ]);
  });

  test("applies project override updates and sanitizes saved selections", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "dist",
              label: "dist",
              path: "dist",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "build",
            },
            {
              itemId: "cache",
              label: "cache",
              path: ".cache",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "cache",
            },
          ],
        },
      ],
    });

    state.replaceProjectPolicyOverrides({
      "project-a": {
        enabled: true,
        safeMode: false,
        inactiveThresholdDays: 9,
        cacheMtimeDays: 11,
      },
    } as never);
    state.replaceProjectPlanSelections({ "project-a": ["dist", "ghost", "dist"] });
    await state.refreshPlanForProject("project-a");

    expect(state.projectPolicyForProject("project-a")).toEqual({
      scope: "project",
      safeMode: false,
      autoCleanupEnabled: true,
      inactiveThresholdDays: 9,
      cacheMtimeDays: 11,
    });
    expect(state.selectedPlanIdsForProject("project-a")).toEqual(["dist"]);
    expect(state.projectPlanSelections()["project-a"]).toEqual(["dist"]);
  });

  test("reconciles queued selections when a refreshed plan removes invalid ids", async () => {
    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "cache",
              label: "cache",
              path: ".cache",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "cache",
            },
          ],
        },
      ],
    });

    state.setProjectPolicyEnabled("project-a", true);
    state.replaceProjectPlanSelections({ "project-a": ["ghost", "cache", "ghost"] });
    state.addProjectToQueue("project-a");

    expect(state.queueEntryForProject("project-a")?.selectedPlanIds).toEqual([]);

    await state.refreshPlanForProject("project-a");

    expect(state.selectedPlanIdsForProject("project-a")).toEqual(["cache"]);
    expect(state.projectPlanSelections()["project-a"]).toEqual(["cache"]);
    expect(state.queueEntryForProject("project-a")?.selectedPlanIds).toEqual(["cache"]);
  });

  test("handles refresh failures and queue lifecycle operations", async () => {
    console.error = mock(() => undefined);
    buildCleanupPlanMock.mockRejectedValue(new Error("plan failed"));

    const pending = state.refreshPlanForProject("project-a");
    expect(state.isPlanLoadingForProject("project-a")).toBe(true);
    await pending;

    expect(state.planErrorForProject("project-a")).toBe("计划加载失败");
    expect(state.isPlanLoadingForProject("project-a")).toBe(false);

    buildCleanupPlanMock.mockResolvedValue({
      plans: [
        {
          projectId: "project-a",
          items: [
            {
              itemId: "dist",
              label: "dist",
              path: "dist",
              estimatedSizeBytes: 1024,
              risk: "low",
              recommended: true,
              category: "build",
            },
          ],
        },
        {
          projectId: "project-b",
          items: [
            {
              itemId: "cache",
              label: "cache",
              path: ".cache",
              estimatedSizeBytes: 2048,
              risk: "low",
              recommended: true,
              category: "cache",
            },
          ],
        },
      ],
    });

    await state.refreshPlanForProject("project-a");
    await state.refreshPlanForProject("project-b");

    state.addProjectToQueue("project-a");
    state.addProjectToQueue("project-a");
    expect(state.isProjectInQueue("project-a")).toBe(true);
    expect(state.cleanupQueue().map((entry) => entry.projectId)).toEqual(["project-a"]);

    state.addProjectToQueue("project-b");
    state.replaceQueuePlanSelection("project-b", ["cache"]);
    expect(state.cleanupQueue().map((entry) => entry.projectId)).toEqual([
      "project-a",
      "project-b",
    ]);
    expect(state.queueEntryForProject("project-a")?.selectedPlanIds).toEqual(["dist"]);
    expect(state.queueEntryForProject("project-b")?.selectedPlanIds).toEqual(["cache"]);

    state.setCleanupTargetProject("project-b");
    expect(state.cleanupQueue().map((entry) => entry.projectId)).toEqual(["project-b"]);

    state.removeProjectFromQueue("project-b");
    expect(state.isProjectInQueue("project-b")).toBe(false);

    state.addProjectToQueue("project-a");
    state.clearCleanupQueue();
    expect(state.cleanupQueue()).toEqual([]);
    expect(state.cleanupQueueSummary()).toEqual({
      projectCount: 0,
      selectedCount: 0,
      selectedSize: 0,
    });
  });

  test("supports singleton reset and risk profile reset", async () => {
    const first = cleanupModule.useCleanup();
    const second = cleanupModule.useCleanup();

    expect(first).toBe(second);

    first.updateCleanupRiskProfile("dependencies", "low");
    expect(first.projectPolicyForProject("missing").scope).toBe("global");
    first.resetCleanupRiskProfile();

    cleanupModule.resetCleanupState();

    expect(cleanupModule.useCleanup()).not.toBe(first);
  });
});
