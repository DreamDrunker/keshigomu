import { useLocation, useNavigate, type RouteSectionProps } from "@solidjs/router";
import { For, createEffect, createSignal, onCleanup, onMount } from "solid-js";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "~/components/ui/command";
import { SidebarNav } from "~/components/layout/sidebarNav";
import { TitleBar } from "~/components/layout/titleBar";
import { useProject } from "~/hooks/useProject";
import { noDragClass, shellClass, workspaceLayoutClass } from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import { navItems } from "~/workspace/constants";
import type { CommandAction, PageKey } from "~/workspace/types";

export const Layout = (props: RouteSectionProps) => {
  let commandInputRef!: HTMLInputElement;

  const project = useProject();
  const navigate = useNavigate();
  const location = useLocation();

  const [commandPaletteOpen, setCommandPaletteOpen] = createSignal(false);
  const [commandQuery, setCommandQuery] = createSignal("");

  const isMacPlatform =
    typeof navigator !== "undefined" &&
    /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform || navigator.userAgent);

  const activePage = (): PageKey =>
    location.pathname === "/cleanup" ? "cleanup" : "manage";
  const activePageLabel = () => (activePage() === "manage" ? "项目概览" : "清理配置");

  const navigateToPage = (page: PageKey) => {
    navigate(page === "manage" ? "/manage" : "/cleanup");
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };

  const openSettingsPage = () => {
    const targetTab = "appearance";
    navigate(`/settings?tab=${targetTab}`);
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };

  const openAutoCleanupSettings = () => {
    const targetTab = "cleanup";
    navigate(`/settings?tab=${targetTab}`);
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };

  onMount(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const isCommandPaletteHotkey =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSettingsHotkey =
        (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === ",";
      const isManageHotkey = (event.metaKey || event.ctrlKey) && event.key === "1";
      const isCleanupHotkey = (event.metaKey || event.ctrlKey) && event.key === "2";

      if (isCommandPaletteHotkey) {
        event.preventDefault();
        setCommandQuery("");
        setCommandPaletteOpen(true);
        return;
      }

      if (isSettingsHotkey) {
        event.preventDefault();
        openSettingsPage();
        return;
      }

      if (isManageHotkey) {
        event.preventDefault();
        navigateToPage("manage");
        return;
      }

      if (isCleanupHotkey) {
        event.preventDefault();
        navigateToPage("cleanup");
        return;
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);

    onCleanup(() => {
      window.removeEventListener("keydown", handleGlobalShortcuts);
    });
  });

  createEffect(() => {
    if (commandPaletteOpen()) queueMicrotask(() => commandInputRef?.focus());
  });

  const commandActions: CommandAction[] = [
    {
      id: "go-manage",
      label: "切换到项目概览",
      keywords: "manage 项目 概览",
      shortcut: "⌘1 / Ctrl+1",
      run: () => navigateToPage("manage"),
    },
    {
      id: "go-cleanup",
      label: "切换到清理配置",
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
      label: "打开全局清理策略",
      keywords: "清理策略 自动清理 周期 阈值",
      run: () => openAutoCleanupSettings(),
    },
    {
      id: "next-project",
      label: "定位下一个项目",
      keywords: "next project 下一个",
      run: () => project.stepProject(1),
    },
    {
      id: "prev-project",
      label: "定位上一个项目",
      keywords: "prev project 上一个",
      run: () => project.stepProject(-1),
    },
  ];

  const executeCommand = (action: CommandAction) => {
    action.run();
    setCommandPaletteOpen(false);
    setCommandQuery("");
  };

  const onCommandDialogChange = (open: boolean) => {
    setCommandPaletteOpen(open);
    !open && setCommandQuery("");
  };

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
          onOpenSettings={openSettingsPage}
          onStartDrag={startWindowDrag}
        />

        <section class="flex min-h-0 flex-col overflow-hidden bg-[var(--bg)] px-[var(--space-6)] py-[var(--space-5)] max-[1100px]:block max-[1100px]:overflow-auto max-[900px]:p-[var(--space-4)]">
          <header class="flex shrink-0 items-center justify-between gap-[var(--space-4)] border-b border-[color:var(--line)] pb-[var(--space-3)] max-[900px]:flex-col max-[900px]:items-start">
            <button
              class={cn(
                noDragClass,
                "inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-2)] text-[0.8rem] text-[var(--text-normal)]",
              )}
              onClick={() => {
                setCommandQuery("");
                setCommandPaletteOpen(true);
              }}
              type="button"
            >
              <span>快速命令</span>
              <kbd class="rounded-[6px] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[6px] py-[2px] font-mono text-[0.69rem] text-[var(--text-muted)]">
                ⌘K / Ctrl+K
              </kbd>
            </button>

            <div class="flex flex-wrap items-center justify-end gap-[var(--space-2)] text-[0.74rem] text-[var(--text-muted)] max-[900px]:justify-start">
              <span>{activePageLabel()}</span>
              <span>{project.activeProject().name}</span>
              <span>{activePage() === "manage" ? "查看项目状态与可清理空间" : "选择要清理的内容并执行"}</span>
              <button
                class="bg-transparent p-0 text-[0.74rem] text-[var(--primary)] hover:underline"
                onClick={openSettingsPage}
                type="button"
              >
                设置
              </button>
            </div>
          </header>

          {props.children}
        </section>
      </div>

      <CommandDialog open={commandPaletteOpen()} onOpenChange={onCommandDialogChange}>
        <CommandInput
          ref={(element) => {
            commandInputRef = element;
          }}
          value={commandQuery()}
          onInput={(event) => setCommandQuery(event.currentTarget.value)}
          placeholder="输入命令或关键词，例如：设置"
        />

        <CommandList>
          <CommandEmpty>没有匹配的命令</CommandEmpty>
          <CommandGroup heading="快捷操作">
            <For each={commandActions}>
              {(action) => (
                <CommandItem
                  value={`${action.label} ${action.keywords}`}
                  onSelect={() => executeCommand(action)}
                >
                  <span>{action.label}</span>
                  {action.shortcut && <CommandShortcut>{action.shortcut}</CommandShortcut>}
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </main>
  );
};
