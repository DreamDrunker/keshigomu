import { For, type Component } from "solid-js";
import { Settings } from "lucide-solid";
import { cn } from "~/lib/utils";
import { dragRegionClass, noDragClass } from "~/lib/tailwind";
import type { NavItem, PageKey } from "~/workspace/types";

type SidebarNavProps = {
  navItems: NavItem[];
  activePage: PageKey;
  settingsOpen: boolean;
  onSelectPage: (key: PageKey) => void;
  onOpenSettings: () => void;
  onStartDrag: (event: MouseEvent) => void;
};

export const SidebarNav: Component<SidebarNavProps> = (props) => (
  <aside class="flex flex-col gap-[var(--space-4)] border-r border-[color:var(--line)] bg-[var(--bg)] px-[var(--space-3)] py-[var(--space-4)] max-[1024px]:items-center max-[1024px]:px-[var(--space-2)] max-[1024px]:py-[var(--space-3)]">
    <div
      class={cn(dragRegionClass, "flex items-center gap-[var(--space-2)] p-[var(--space-1)] max-[1024px]:justify-center")}
      data-tauri-drag-region
      onMouseDown={props.onStartDrag}
    >
      <span class="grid size-8 place-items-center rounded-[6px] border border-[color:var(--line-strong)] bg-[var(--panel-soft)] text-[0.82rem] font-bold text-[var(--text-strong)]">
        消
      </span>
      <div class="max-[1024px]:hidden">
        <p class="m-0 text-[0.88rem] font-semibold tracking-[0.01em] text-[var(--text-strong)]">
          keshigomu
        </p>
        <p class="mt-[2px] text-[0.7rem] text-[var(--text-muted)]">ケシゴム</p>
      </div>
    </div>

    <nav class="flex flex-col gap-[var(--space-1)]" aria-label="功能导航">
      <For each={props.navItems}>
        {(item) => {
          const Icon = item.icon;
          return (
            <button
              class={cn(
                noDragClass,
                "flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-transparent px-[var(--space-3)] py-[var(--space-2)] text-left text-[0.82rem] font-medium text-[var(--text-muted)] transition-colors duration-200 hover:border-[color:var(--line)] hover:bg-[var(--panel)] hover:text-[var(--text-normal)] max-[1024px]:justify-center max-[1024px]:p-[var(--space-3)]",
                props.activePage === item.key &&
                  "border-[color:var(--primary-outline)] bg-[var(--primary-soft)] text-[var(--text-strong)]",
              )}
              onClick={() => props.onSelectPage(item.key)}
              type="button"
            >
              <Icon size={16} strokeWidth={2} />
              <span class="flex-1 max-[1024px]:hidden">{item.label}</span>
            </button>
          );
        }}
      </For>
    </nav>

    <div
      class={cn(dragRegionClass, "min-h-[var(--space-6)] flex-1")}
      data-tauri-drag-region
      onMouseDown={props.onStartDrag}
    />

    <div class="border-t border-[color:var(--line)] pt-[var(--space-3)]">
      <button
        class={cn(
          noDragClass,
          "flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-transparent px-[var(--space-3)] py-[var(--space-2)] text-left text-[0.82rem] font-medium text-[var(--text-muted)] transition-colors duration-200 hover:border-[color:var(--line)] hover:bg-[var(--panel)] hover:text-[var(--text-normal)] max-[1024px]:justify-center max-[1024px]:p-[var(--space-3)]",
          props.settingsOpen &&
            "border-[color:var(--primary-outline)] bg-[var(--primary-soft)] text-[var(--text-strong)]",
        )}
        onClick={props.onOpenSettings}
        type="button"
      >
        <Settings size={16} strokeWidth={2} />
        <span class="flex-1 max-[1024px]:hidden">设置</span>
      </button>
    </div>
  </aside>
);
