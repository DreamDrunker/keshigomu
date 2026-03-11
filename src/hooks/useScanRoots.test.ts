import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { createTestRoot } from "~/test/solid";

const scanProjectsMock = mock();
const openMock = mock();
const buildCleanupPlanMock = mock();
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

mock.module("@tauri-apps/plugin-dialog", () => ({
  open: openMock,
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

const scanRootsModule = await import("./useScanRoots");

describe("createScanRootsState", () => {
  let state: {
    replaceScanRoots: (roots: Array<{ path: string; depth: number }>) => void;
    autoScanProjects: () => Promise<void>;
    pickScanRoot: () => Promise<void>;
    removeScanRoot: (path: string) => void;
    scanRoots: () => Array<{ path: string; depth: number }>;
    lastScanProjects: () => unknown[];
    lastScanWarnings: () => string[];
    lastScanAt: () => string;
    scanInProgress: () => boolean;
    scanStatusText: () => string;
  };
  let dispose: VoidFunction = () => undefined;

  beforeEach(() => {
    console.error = mock(() => undefined);
    console.warn = mock(() => undefined);
    scanProjectsMock.mockReset();
    openMock.mockReset();
    buildCleanupPlanMock.mockReset();
    executeCleanupMock.mockReset();
    runAutoCleanupMock.mockReset();
    listCleanupHistoryMock.mockReset();
    scanRootsModule.resetScanRootsState();
    ({ dispose, value: state } = createTestRoot(() =>
      scanRootsModule.createScanRootsState({
        initialRoots: [],
        defaultDepth: 4,
      }),
    ));
  });

  afterEach(() => {
    dispose();
  });

  test("normalizes roots when replacing scan roots", () => {
    state.replaceScanRoots([
      { path: " /tmp/code/// ", depth: 0 },
      { path: "/tmp/code/apps", depth: 2 },
      { path: "/tmp/work", depth: 2 },
      { path: "/tmp/work", depth: 4 },
    ]);

    expect(state.scanRoots()).toEqual([
      { path: "/tmp/code", depth: 1 },
      { path: "/tmp/work", depth: 2 },
    ]);
  });

  test("updates projects and status after a successful scan", async () => {
    scanProjectsMock.mockResolvedValue({
      acceptedRoots: [{ path: "/tmp/code", depth: 2 }],
      projects: [{ id: "a", name: "demo", path: "/tmp/code/demo", kind: "single" }],
      warnings: ["skip mounted volume"],
    });
    state.replaceScanRoots([{ path: "/tmp/code", depth: 2 }]);

    await state.autoScanProjects();

    expect(scanProjectsMock).toHaveBeenCalledWith({
      roots: [{ path: "/tmp/code", depth: 2 }],
    });
    expect(state.scanRoots()).toEqual([{ path: "/tmp/code", depth: 2 }]);
    expect(state.lastScanProjects()).toEqual([
      { id: "a", name: "demo", path: "/tmp/code/demo", kind: "single" },
    ]);
    expect(state.lastScanWarnings()).toEqual(["skip mounted volume"]);
    expect(state.scanStatusText()).toBe("已找到 1 个项目，另有 1 条提示");
    expect(state.lastScanAt()).not.toBe("");
  });

  test("shows timeout-specific feedback when scan times out", async () => {
    scanProjectsMock.mockRejectedValue(new Error("scan timeout after 60000ms"));
    state.replaceScanRoots([{ path: "/tmp/code", depth: 2 }]);

    await state.autoScanProjects();

    expect(state.lastScanWarnings()).toEqual([
      "扫描时间较长，请检查扫描目录，尤其是外接磁盘或网络盘",
    ]);
    expect(state.scanStatusText()).toBe("扫描时间较长");
    expect(state.scanInProgress()).toBe(false);
  });

  test("shows empty-state text when there are no roots", async () => {
    await state.autoScanProjects();

    expect(scanProjectsMock).not.toHaveBeenCalled();
    expect(state.scanStatusText()).toBe("先添加一个扫描目录");
    expect(state.lastScanProjects()).toEqual([]);
    expect(state.lastScanWarnings()).toEqual([]);
  });

  test("picks a root from the native dialog and scans it", async () => {
    openMock.mockResolvedValue("/tmp/workspace");
    scanProjectsMock.mockResolvedValue({
      acceptedRoots: [{ path: "/tmp/workspace", depth: 4 }],
      projects: [],
      warnings: [],
    });

    await state.pickScanRoot();

    expect(openMock).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
      title: "选择扫描目录",
    });
    expect(scanProjectsMock).toHaveBeenCalledWith({
      roots: [{ path: "/tmp/workspace", depth: 4 }],
    });
    expect(state.scanRoots()).toEqual([{ path: "/tmp/workspace", depth: 4 }]);
  });

  test("handles generic scan failures and root removal", async () => {
    scanProjectsMock
      .mockResolvedValueOnce({
        acceptedRoots: [
          { path: "/tmp/code", depth: 2 },
          { path: "/tmp/work", depth: 2 },
        ],
        projects: [],
        warnings: [],
      })
      .mockRejectedValueOnce(new Error("disk unavailable"));
    state.replaceScanRoots([
      { path: "/tmp/code", depth: 2 },
      { path: "/tmp/work", depth: 2 },
    ]);

    await state.autoScanProjects();
    state.removeScanRoot("/tmp/work");
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scanProjectsMock).toHaveBeenLastCalledWith({
      roots: [{ path: "/tmp/code", depth: 2 }],
    });
    expect(state.scanRoots()).toEqual([{ path: "/tmp/code", depth: 2 }]);
    expect(state.lastScanWarnings()).toEqual(["扫描没有完成，请稍后重试"]);
    expect(state.scanStatusText()).toBe("扫描失败");
  });

  test("ignores cancelled or failing native picker calls", async () => {
    openMock.mockResolvedValueOnce(null).mockRejectedValueOnce(new Error("dialog failed"));

    await state.pickScanRoot();
    await state.pickScanRoot();

    expect(scanProjectsMock).not.toHaveBeenCalled();
    expect(state.scanRoots()).toEqual([]);
  });

  test("supports singleton reset", async () => {
    const first = scanRootsModule.useScanRoots();
    const second = scanRootsModule.useScanRoots();

    expect(first).toBe(second);

    scanRootsModule.resetScanRootsState();

    expect(scanRootsModule.useScanRoots()).not.toBe(first);
  });
});
