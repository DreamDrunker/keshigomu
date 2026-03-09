import { createRoot, createSignal, type Accessor } from "solid-js";
import { scanProjects, type DiscoveredProject } from "~/services/cleanupClient";
import { initialScanRoots } from "~/workspace/constants";
import type { ScanRoot } from "~/workspace/types";

const scanTimeoutMs = 60_000;
const normalizeDepth = (depth: number) => Math.max(1, Math.round(Number(depth || 1)));
const trimRootPath = (path: string) => {
  const trimmed = path.trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/g, "") || "/";
};
const isNestedRoot = (path: string, parentPath: string) =>
  path !== parentPath && path.startsWith(`${parentPath}/`);

const normalizeScanRoots = (roots: ScanRoot[]) =>
  roots
    .map((root) => ({
      path: trimRootPath(String(root.path || "")),
      depth: normalizeDepth(root.depth),
    }))
    .filter((root) => root.path.length > 0)
    .filter(
      (root, index, allRoots) =>
        allRoots.findIndex((item) => item.path === root.path) === index,
    )
    .sort((left, right) => left.path.length - right.path.length)
    .filter(
      (root, index, allRoots) =>
        !allRoots.slice(0, index).some((parent) => isNestedRoot(root.path, parent.path)),
    );
const sameScanRoots = (left: ScanRoot[], right: ScanRoot[]) =>
  left.length === right.length &&
  left.every(
    (root, index) =>
      root.path === right[index]?.path && normalizeDepth(root.depth) === normalizeDepth(right[index]?.depth),
  );
const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`scan timeout after ${timeoutMs}ms`)), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
const resolveScanErrorMessage = (error: unknown) =>
  error instanceof Error && error.message.toLowerCase().includes("timeout")
    ? "扫描超时，请检查扫描根目录（尤其外接磁盘或网络盘）"
    : "扫描失败，请稍后重试";

type UseScanRootsOptions = {
  initialRoots: ScanRoot[];
  defaultDepth?: number;
};

type UseScanRootsValue = {
  scanRoots: Accessor<ScanRoot[]>;
  replaceScanRoots: (roots: ScanRoot[]) => void;
  autoScanProjects: () => Promise<void>;
  pickScanRoot: () => Promise<void>;
  removeScanRoot: (path: string) => void;
  lastScanProjects: Accessor<DiscoveredProject[]>;
  lastScanWarnings: Accessor<string[]>;
  lastScanAt: Accessor<string>;
  scanInProgress: Accessor<boolean>;
  scanStatusText: Accessor<string>;
};

const createScanRootsState = (options: UseScanRootsOptions): UseScanRootsValue => {
  const defaultDepth = options.defaultDepth ?? 3;
  const [scanRoots, setScanRoots] = createSignal(normalizeScanRoots(options.initialRoots));
  const [lastScanProjects, setLastScanProjects] = createSignal<DiscoveredProject[]>([]);
  const [lastScanWarnings, setLastScanWarnings] = createSignal<string[]>([]);
  const [lastScanAt, setLastScanAt] = createSignal("");
  const [scanInProgress, setScanInProgress] = createSignal(false);
  const [scanStatusText, setScanStatusText] = createSignal("");

  const runScanProjects = async (roots: ScanRoot[]) => {
    const normalizedRoots = normalizeScanRoots(roots);

    if (!normalizedRoots.length) {
      setLastScanProjects([]);
      setLastScanWarnings([]);
      setLastScanAt("");
      setScanStatusText("请先添加根目录");
      return;
    }

    if (scanInProgress()) return;
    setScanInProgress(true);
    !sameScanRoots(scanRoots(), normalizedRoots) && setScanRoots(normalizedRoots);
    setScanStatusText("正在自动发现项目...");
    try {
      const response = await withTimeout(
        scanProjects({
          roots: normalizedRoots.map((root) => ({
            path: root.path,
            depth: normalizeDepth(root.depth),
          })),
        }),
        scanTimeoutMs,
      );
      const acceptedRoots = normalizeScanRoots(
        response.acceptedRoots.map((root) => ({ ...root })),
      );
      setScanRoots(acceptedRoots);
      setLastScanProjects([...response.projects]);
      setLastScanWarnings([...response.warnings]);
      setLastScanAt(new Date().toISOString());
      setScanStatusText(
        response.warnings.length
          ? `扫描完成：发现 ${response.projects.length} 个项目，${response.warnings.length} 条告警`
          : `扫描完成：发现 ${response.projects.length} 个项目`,
      );
      response.warnings.length &&
        console.warn("[scan_projects] warnings", response.warnings);
      return;
    } catch (error) {
      console.error("[scan_projects] failed", error);
      const errorMessage = resolveScanErrorMessage(error);
      setLastScanWarnings([errorMessage]);
      setLastScanAt(new Date().toISOString());
      setScanStatusText(errorMessage.includes("超时") ? "扫描超时" : "扫描失败");
    } finally {
      setScanInProgress(false);
    }
  };

  const autoScanProjects = async () => runScanProjects(scanRoots());

  const pickScanRoot = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selectedRoot = await open({
        directory: true,
        multiple: false,
        title: "选择扫描目录",
      });
      const nextPath = Array.isArray(selectedRoot) ? selectedRoot[0] : selectedRoot;
      if (!nextPath) return;
      const nextRoots = normalizeScanRoots([
        ...scanRoots(),
        { path: nextPath, depth: defaultDepth },
      ]);
      setScanRoots(nextRoots);
      await runScanProjects(nextRoots);
    } catch {}
  };

  const removeScanRoot = (path: string) => {
    const nextRoots = scanRoots().filter((root) => root.path !== path);
    setScanRoots(nextRoots);
    runScanProjects(nextRoots);
  };

  return {
    scanRoots,
    replaceScanRoots: (roots: ScanRoot[]) => setScanRoots(normalizeScanRoots(roots)),
    autoScanProjects,
    pickScanRoot,
    removeScanRoot,
    lastScanProjects,
    lastScanWarnings,
    lastScanAt,
    scanInProgress,
    scanStatusText,
  };
};

let scanRootsState: UseScanRootsValue | null = null;

export const useScanRoots = () =>
  scanRootsState ?? (
    scanRootsState = createRoot(() =>
      createScanRootsState({
        initialRoots: initialScanRoots,
        defaultDepth: 3,
      })
    )
  );
