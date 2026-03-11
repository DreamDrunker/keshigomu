import { useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { createMemo, createSignal } from "solid-js";
import { SidebarNav } from "~/components/layout/sidebarNav";
import { TitleBar } from "~/components/layout/titleBar";
import { useProject } from "~/hooks/useProject";
import { shellClass, workspaceLayoutClass } from "~/lib/tailwind";
import { navItems } from "~/workspace/constants";
import type { CommandAction, PageKey } from "~/workspace/types";
import { WorkspaceCommandPalette } from "./commandPalette";
import { useWorkspaceShortcuts } from "./useWorkspaceShortcuts";
import { WorkspaceHeader } from "./workspaceHeader";

export const Layout = (props: RouteSectionProps) => {
  const project = useProject();
  const navigate = useNavigate();
  const location = useLocation();
  const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
  const [commandQuery, setCommandQuery] = createSignal("");

  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent);

  const activePage = (): PageKey => (location.pathname === "/cleanup" ? "cleanup" : "manage");
  const closeCommandPalette = () => {
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };
  const openCommandPalette = () => {
    setCommandQuery("");
    setCommandPaletteOpen(true);
  };
  const navigateToPage = (page: PageKey) => {
    navigate(page === "manage" ? "/manage" : "/cleanup");
    closeCommandPalette();
  };
  const openSettingsPage = (tab: "appearance" | "cleanup" = "appearance") => {
    navigate(`/settings?tab=${tab}`);
    closeCommandPalette();
  };

  useWorkspaceShortcuts({
    onOpenCommandPalette: openCommandPalette,
    onOpenSettings: () => openSettingsPage(),
    onManagePage: () => navigateToPage("manage"),
    onCleanupPage: () => navigateToPage("cleanup"),
  });

  const commandActions = createMemo<CommandAction[]>(() => [
    {
      id: "go-manage",
      label: "前往项目概览",
      keywords: "manage 项目 概览",
      shortcut: "⌘1 / Ctrl+1",
      run: () => navigateToPage("manage"),
    },
    {
      id: "go-cleanup",
      label: "前往清理",
      keywords: "cleanup 清理 配置 手动",
      shortcut: "⌘2 / Ctrl+2",
      run: () => navigateToPage("cleanup"),
    },
    {
      id: "open-settings",
      label: "打开设置",
      keywords: "设置 偏好 配置",
      shortcut: "⌘, / Ctrl+,",
      run: () => openSettingsPage(),
    },
    {
      id: "open-auto-cleanup",
      label: "打开清理设置",
      keywords: "清理策略 自动清理 周期 阈值",
      run: () => openSettingsPage("cleanup"),
    },
    {
      id: "next-project",
      label: "选中下一个项目",
      keywords: "next project 下一个",
      run: () => project.stepProject(1),
    },
    {
      id: "prev-project",
      label: "选中上一个项目",
      keywords: "prev project 上一个",
      run: () => project.stepProject(-1),
    },
  ]);

  const startWindowDrag = async (event: MouseEvent) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (target?.closest("button, input, select, textarea, a, label, [role='button']")) return;
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
    } catch {}
  };

  return (
    <main class={shellClass}>
      <TitleBar isMacPlatform={isMacPlatform} onStartDrag={startWindowDrag} />

      <div class={workspaceLayoutClass}>
        <SidebarNav
          navItems={navItems}
          activePage={activePage()}
          settingsOpen={false}
          onSelectPage={navigateToPage}
          onOpenSettings={() => openSettingsPage()}
          onStartDrag={startWindowDrag}
        />

        <section class="flex min-h-0 flex-col overflow-hidden bg-[var(--bg)] px-[var(--space-6)] py-[var(--space-5)] max-[1100px]:block max-[1100px]:overflow-auto max-[900px]:p-[var(--space-4)]">
          <WorkspaceHeader
            activePageLabel={activePage() === "manage" ? "项目概览" : "清理"}
            activeProjectName={project.activeProject().name}
            activePageDescription={
              activePage() === "manage" ? "查看项目信息和可释放空间" : "查看可清理内容并开始清理"
            }
            onOpenCommandPalette={openCommandPalette}
            onOpenSettings={() => openSettingsPage()}
          />
          {props.children}
        </section>
      </div>

      <WorkspaceCommandPalette
        open={commandPaletteOpen()}
        query={commandQuery()}
        actions={commandActions()}
        onOpenChange={(open) => (open ? setCommandPaletteOpen(true) : closeCommandPalette())}
        onQueryChange={setCommandQuery}
        onExecuteAction={(action) => {
          action.run();
          closeCommandPalette();
        }}
      />
    </main>
  );
};
