import { For, Show, type Component } from "solid-js";
import { Button } from "~/components/ui/button";
import {
  sheetClass,
  sheetHeaderClass,
  sheetLabelClass,
  sheetRowClass,
  sheetValueClass,
} from "~/lib/tailwind";
import type { ScanSettingsActions, ScanSettingsState } from "./types";
import {
  modeChipClass,
  paneHeadActionListClass,
  paneHeadActionsClass,
  paneHeadClass,
  paneHeadTextClass,
  paneHeadingClass,
  paneHintClass,
  projectItemClass,
  projectListClass,
} from "./styles";

type ScanSettingsProps = {
  state: ScanSettingsState;
  actions: ScanSettingsActions;
};

export const ScanSettings: Component<ScanSettingsProps> = (props) => (
  <section class="flex flex-col gap-[var(--space-3)]">
    <div class={paneHeadActionsClass}>
      <div class={paneHeadTextClass}>
        <h3 class={paneHeadingClass}>扫描项目</h3>
      </div>
      <div class={paneHeadActionListClass}>
        <Button onClick={props.actions.onPickScanRoot}>添加扫描目录</Button>
        <Button
          variant="outline"
          onClick={props.actions.onAutoScanProjects}
          disabled={props.state.scanInProgress || props.state.scanRoots.length === 0}
        >
          {props.state.scanInProgress ? "扫描中..." : "重新扫描"}
        </Button>
      </div>
    </div>

    <Show when={props.state.scanStatusText}>
      <div class={paneHeadClass}>
        <p class={paneHintClass}>{props.state.scanStatusText}</p>
      </div>
    </Show>

    <div class={paneHeadClass}>
      <h3 class={paneHeadingClass}>扫描目录</h3>
    </div>

    <Show when={props.state.scanRoots.length === 0}>
      <div class={sheetClass}>
        <header class={sheetHeaderClass}>
          <span>还没有扫描目录</span>
        </header>
        <div>
          <div class={sheetRowClass}>
            <span class={sheetLabelClass}>操作</span>
            <code class={sheetValueClass}>添加目录后会自动开始扫描</code>
          </div>
        </div>
      </div>
    </Show>

    <Show when={props.state.scanRoots.length > 0}>
      <div class="flex flex-col gap-[var(--space-2)]">
        <For each={props.state.scanRoots}>
          {(root) => (
            <div class="grid items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:1fr_auto] max-[900px]:bg-[var(--panel)]">
              <p class="m-0 font-mono text-[0.74rem] text-[var(--text-normal)]">
                {root.path}
                <span> · 深度 {root.depth}</span>
              </p>
              <button
                class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[var(--space-1)] text-[0.72rem] text-[var(--text-muted)] transition-colors duration-200 hover:border-[color:var(--line-strong)] hover:text-[var(--text-normal)]"
                onClick={() => props.actions.onRemoveScanRoot(root.path)}
                type="button"
              >
                移除
              </button>
            </div>
          )}
        </For>
      </div>
    </Show>

    <div class={paneHeadClass}>
      <h3 class={paneHeadingClass}>列表显示范围</h3>
    </div>

    <div class="inline-flex flex-wrap gap-[var(--space-1)]" role="tablist" aria-label="列表显示范围">
      <For each={props.state.monorepoModeOptions}>
        {(option) => (
          <button
            class={modeChipClass(props.state.monorepoMode === option.value)}
            onClick={() => props.actions.onMonorepoModeChange(option.value)}
            type="button"
          >
            {option.label}
          </button>
        )}
      </For>
    </div>

    <div class={paneHeadClass}>
      <h3 class={paneHeadingClass}>扫描结果</h3>
    </div>

    <Show when={!props.state.lastScanAt}>
      <div class={sheetClass}>
        <header class={sheetHeaderClass}>
          <span>还没有扫描结果</span>
        </header>
      </div>
    </Show>

    <Show when={props.state.lastScanAt && props.state.lastScanProjects.length > 0}>
      <div class={sheetClass}>
        <header class={sheetHeaderClass}>
          <span>本次找到的项目</span>
          <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
            {props.state.lastScanProjects.length} 个
          </strong>
        </header>
        <div>
          <div class={sheetRowClass}>
            <span class={sheetLabelClass}>最近扫描</span>
            <code class={sheetValueClass}>{new Date(props.state.lastScanAt).toLocaleString()}</code>
          </div>
        </div>
        <div class={projectListClass}>
          <For each={props.state.lastScanProjects}>
            {(project) => (
              <div class={projectItemClass}>
                <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">{project.name}</p>
                <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                  {project.path}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>

    <Show
      when={
        props.state.lastScanAt &&
        props.state.lastScanProjects.length === 0 &&
        !props.state.scanInProgress
      }
    >
      <div class={sheetClass}>
        <header class={sheetHeaderClass}>
          <span>这次没有找到项目</span>
        </header>
        <div>
          <div class={sheetRowClass}>
            <span class={sheetLabelClass}>最近扫描</span>
            <code class={sheetValueClass}>{new Date(props.state.lastScanAt).toLocaleString()}</code>
          </div>
          <div class={sheetRowClass}>
            <span class={sheetLabelClass}>识别这些文件</span>
            <code class={sheetValueClass}>
              package.json / pnpm-workspace.yaml / Cargo.toml / pyproject.toml
            </code>
          </div>
        </div>
      </div>
    </Show>

    <Show when={props.state.lastScanWarnings.length > 0}>
      <div class={sheetClass}>
        <header class={sheetHeaderClass}>
          <span>扫描提示</span>
          <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
            {props.state.lastScanWarnings.length} 条
          </strong>
        </header>
        <Show when={props.state.lastScanAt}>
          <div>
            <div class={sheetRowClass}>
              <span class={sheetLabelClass}>最近扫描</span>
              <code class={sheetValueClass}>{new Date(props.state.lastScanAt).toLocaleString()}</code>
            </div>
          </div>
        </Show>
        <div class={projectListClass}>
          <For each={props.state.lastScanWarnings}>
            {(warning) => (
              <div class={projectItemClass}>
                <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">提示</p>
                <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                  {warning}
                </span>
              </div>
            )}
          </For>
        </div>
      </div>
    </Show>
  </section>
);
