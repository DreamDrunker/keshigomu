import { ArrowLeft } from "lucide-solid";
import { For, type Component } from "solid-js";
import type { SettingsTabItem, SettingsTabKey } from "~/workspace/types";
import { navItemClass } from "./styles";

type SettingsNavProps = {
  activeTab: SettingsTabKey;
  settingsTabs: SettingsTabItem[];
  onBack: () => void;
  onTabChange: (key: SettingsTabKey) => void;
};

export const SettingsNav: Component<SettingsNavProps> = (props) => (
  <nav
    class="flex min-h-0 flex-col gap-[var(--space-3)] border-r border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-4)]"
    aria-label="设置分类"
  >
    <button
      class="inline-flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-semibold text-[var(--text-normal)] transition-colors duration-200 hover:border-[color:var(--line-strong)] hover:text-[var(--text-strong)]"
      onClick={props.onBack}
      type="button"
    >
      <ArrowLeft size={16} strokeWidth={2.2} />
      <span>返回工作台</span>
    </button>

    <div class="flex min-h-0 flex-col gap-[var(--space-2)] overflow-auto">
      <For each={props.settingsTabs}>
        {(tab) => (
          <button
            class={navItemClass(props.activeTab === tab.key)}
            onClick={() => props.onTabChange(tab.key)}
            type="button"
          >
            <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">{tab.label}</p>
            <span class="mt-1 block text-[0.72rem] text-[var(--text-muted)]">{tab.description}</span>
          </button>
        )}
      </For>
    </div>
  </nav>
);
