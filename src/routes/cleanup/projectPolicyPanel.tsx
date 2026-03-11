import { Show } from "solid-js";
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch";
import { inputClass, sheetClass, sheetHeaderClass } from "~/lib/tailwind";
import type { EffectiveProjectPolicy } from "~/workspace/types";
import { numberFieldClass, numberLabelClass, policyRowClass } from "./styles";
import type { CleanupPolicyActions } from "./types";

type ProjectPolicyPanelProps = {
  hasActiveProject: boolean;
  policy: EffectiveProjectPolicy;
  overrideEnabled: boolean;
  actions: CleanupPolicyActions;
};

export const ProjectPolicyPanel = (props: ProjectPolicyPanelProps) => (
  <div class={sheetClass}>
    <header class={sheetHeaderClass}>
      <span>这个项目的单独设置</span>
      <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
        {props.overrideEnabled ? "使用中" : "未使用"}
      </strong>
    </header>
    <div class="grid gap-[var(--space-2)] px-[var(--space-3)] pb-[var(--space-3)] pt-[var(--space-1)]">
      <div class={policyRowClass}>
        <span class="text-[0.8rem] text-[var(--text-normal)]">使用这个项目的单独设置</span>
        <Switch
          checked={props.overrideEnabled}
          onChange={props.actions.onToggleOverride}
          aria-label="启用项目覆盖策略"
        >
          <SwitchControl>
            <SwitchThumb />
          </SwitchControl>
        </Switch>
      </div>

      <Show when={props.overrideEnabled && props.hasActiveProject}>
        <div class={policyRowClass}>
          <span class="text-[0.8rem] text-[var(--text-normal)]">允许自动清理</span>
          <Switch
            checked={props.policy.autoCleanupEnabled}
            onChange={props.actions.onToggleAutoCleanup}
            aria-label="项目自动清理"
          >
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
        </div>

        <label class={numberFieldClass}>
          <span class={numberLabelClass}>清理阈值（天）</span>
          <input
            class={inputClass}
            value={String(props.policy.inactiveThresholdDays)}
            onInput={(event) => props.actions.onThresholdChange(Number(event.currentTarget.value) || 1)}
            type="number"
            min="1"
          />
        </label>

        <label class={numberFieldClass}>
          <span class={numberLabelClass}>缓存保留天数</span>
          <input
            class={inputClass}
            value={String(props.policy.cacheMtimeDays)}
            onInput={(event) => props.actions.onCacheMtimeChange(Number(event.currentTarget.value) || 1)}
            type="number"
            min="1"
          />
        </label>

        <div class={policyRowClass}>
          <span class="text-[0.8rem] text-[var(--text-normal)]">移到系统回收站</span>
          <Switch checked={props.policy.safeMode} onChange={props.actions.onToggleSafeMode} aria-label="项目安全模式">
            <SwitchControl>
              <SwitchThumb />
            </SwitchControl>
          </Switch>
        </div>
      </Show>
    </div>
  </div>
);
