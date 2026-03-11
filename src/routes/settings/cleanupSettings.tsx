import { For, Show, type Component } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch";
import { inputClass } from "~/lib/tailwind";
import type { CleanupRiskProfileKey, RiskLevel } from "~/workspace/types";
import type { CleanupSettingsActions, CleanupSettingsState } from "./types";
import {
  feedbackCalloutClass,
  numberFieldClass,
  numberLabelClass,
  paneHeadActionListClass,
  paneHeadActionsClass,
  paneHeadClass,
  paneHeadTextClass,
  paneHeadingClass,
  paneHintClass,
  policyRowClass,
} from "./styles";

const resolveRiskFieldsByLevel = (
  fields: CleanupRiskProfileKey[],
  profile: CleanupSettingsState["cleanupRiskProfile"],
  level: RiskLevel,
) => fields.filter((key) => profile[key] === level);

type CleanupSettingsProps = {
  state: CleanupSettingsState;
  actions: CleanupSettingsActions;
};

type RiskBucketProps = {
  title: string;
  hint: string;
  level: RiskLevel;
  badgeVariant: "success" | "warning";
  buttonLabel: string;
  nextLevel: RiskLevel;
  state: CleanupSettingsState;
  onMove: (key: CleanupRiskProfileKey, value: RiskLevel) => void;
};

const RiskBucket: Component<RiskBucketProps> = (props) => {
  const keys = () =>
    resolveRiskFieldsByLevel(
      props.state.cleanupRiskProfileFields,
      props.state.cleanupRiskProfile,
      props.level,
    );

  return (
    <section class="overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel)]">
      <header class="flex items-center justify-between gap-[var(--space-2)] border-b border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)]">
        <div class="min-w-0">
          <strong class="text-[0.84rem] text-[var(--text-strong)]">{props.title}</strong>
          <span class="mt-[2px] block text-[0.72rem] text-[var(--text-muted)]">{props.hint}</span>
        </div>
        <Badge variant={props.badgeVariant}>{keys().length} 项</Badge>
      </header>
      <div class="flex flex-col gap-[var(--space-2)] p-[var(--space-3)]">
        <For each={keys()}>
          {(key) => (
            <div class="grid min-h-[54px] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:minmax(0,1fr)_auto]">
              <span class="text-[0.76rem] leading-[1.45] text-[var(--text-normal)]">
                {props.state.cleanupRiskProfileFieldLabels[key]}
              </span>
              <Button
                variant="outline"
                size="sm"
                class="px-[var(--space-2)] py-[5px] text-[0.72rem]"
                onClick={() => props.onMove(key, props.nextLevel)}
              >
                {props.buttonLabel}
              </Button>
            </div>
          )}
        </For>
        <Show when={keys().length === 0}>
          <p class="rounded-[var(--radius-sm)] border border-dashed border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] text-center text-[0.74rem] text-[var(--text-muted)]">
            现在没有{props.title}
          </p>
        </Show>
      </div>
    </section>
  );
};

export const CleanupSettings: Component<CleanupSettingsProps> = (props) => (
  <section class="flex flex-col gap-[var(--space-3)]">
    <div class={paneHeadClass}>
      <h3 class={paneHeadingClass}>默认清理方式</h3>
    </div>

    <div class={policyRowClass}>
      <span class="text-[0.8rem] text-[var(--text-normal)]">移到系统回收站</span>
      <Switch checked={props.state.safeMode} onChange={props.actions.onSafeModeToggle} aria-label="安全模式">
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
    </div>

    <label class={numberFieldClass}>
      <span class={numberLabelClass}>清理阈值（天）</span>
      <input
        class={inputClass}
        value={String(props.state.cleanupThresholdDays)}
        onInput={(event) =>
          props.actions.onCleanupThresholdDaysChange(Number(event.currentTarget.value) || 1)}
        type="number"
        min="1"
      />
    </label>

    <div class={paneHeadActionsClass}>
      <div class={paneHeadTextClass}>
        <h3 class={paneHeadingClass}>自动清理</h3>
        <p class={paneHintClass}>想现在清理时，可先运行一次。</p>
      </div>
      <div class={paneHeadActionListClass}>
        <Button
          variant="outline"
          onClick={props.actions.onRunAutoCleanupNow}
          disabled={props.state.autoCleanupRunInProgress}
        >
          {props.state.autoCleanupRunInProgress ? "运行中..." : "立即运行一次"}
        </Button>
      </div>
    </div>

    <div class={policyRowClass}>
      <span class="text-[0.8rem] text-[var(--text-normal)]">自动清理</span>
      <Switch
        checked={props.state.autoCleanupEnabled}
        onChange={props.actions.onAutoCleanupEnabledToggle}
        aria-label="启用自动清理"
      >
        <SwitchControl>
          <SwitchThumb />
        </SwitchControl>
      </Switch>
    </div>

    <label class={numberFieldClass}>
      <span class={numberLabelClass}>间隔天数</span>
      <input
        class={inputClass}
        value={String(props.state.autoCleanupIntervalDays)}
        onInput={(event) =>
          props.actions.onAutoCleanupIntervalDaysChange(Number(event.currentTarget.value) || 1)}
        type="number"
        min="1"
        disabled={!props.state.autoCleanupEnabled}
      />
    </label>

    <Show when={props.state.autoCleanupFeedback}>
      {(feedback) => (
        <div class={feedbackCalloutClass(feedback().tone)}>
          <p class="m-0">{feedback().message}</p>
        </div>
      )}
    </Show>

    <div class={paneHeadActionsClass}>
      <div class={paneHeadTextClass}>
        <h3 class={paneHeadingClass}>风险分组</h3>
      </div>
      <div class={paneHeadActionListClass}>
        <Button
          variant="outline"
          size="sm"
          class="bg-[var(--panel)] hover:border-[color:var(--primary-outline)] hover:bg-[var(--primary-soft)]"
          onClick={props.actions.onResetCleanupRiskProfile}
        >
          恢复默认分组
        </Button>
      </div>
    </div>

    <div class="grid grid-cols-2 gap-[var(--space-3)] max-[900px]:grid-cols-1">
      <RiskBucket
        title="低风险"
        hint="可自动清理"
        level="low"
        badgeVariant="success"
        buttonLabel="移到中风险 →"
        nextLevel="medium"
        state={props.state}
        onMove={props.actions.onCleanupRiskProfileChange}
      />
      <RiskBucket
        title="中风险"
        hint="仅在手动清理时显示"
        level="medium"
        badgeVariant="warning"
        buttonLabel="← 移到低风险"
        nextLevel="low"
        state={props.state}
        onMove={props.actions.onCleanupRiskProfileChange}
      />
    </div>
  </section>
);
