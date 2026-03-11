import { formatSizeFromGb } from "~/lib/size";
import {
  sheetClass,
  sheetHeaderClass,
  sheetLabelClass,
  sheetRowClass,
  sheetValueClass,
} from "~/lib/tailwind";
import type { CleanupSummaryState } from "./types";

type CleanupSummaryProps = {
  state: CleanupSummaryState;
};

export const CleanupSummary = (props: CleanupSummaryProps) => (
  <div class={sheetClass}>
    <header class={sheetHeaderClass}>
      <span>这次将如何清理</span>
      <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
        {props.state.policy.scope === "project" ? "这个项目的设置" : "默认设置"}
      </strong>
    </header>
    <div>
      <div class={sheetRowClass}>
        <span class={sheetLabelClass}>安全模式</span>
        <code class={sheetValueClass}>
          {props.state.policy.safeMode ? "移到系统回收站" : "直接删除"}
        </code>
      </div>
      <div class={sheetRowClass}>
        <span class={sheetLabelClass}>清理阈值</span>
        <code class={sheetValueClass}>{props.state.policy.inactiveThresholdDays} 天</code>
      </div>
      <div class={sheetRowClass}>
        <span class={sheetLabelClass}>预计清理</span>
        <code class={sheetValueClass}>{props.state.selectedCount} 项</code>
      </div>
      <div class={sheetRowClass}>
        <span class={sheetLabelClass}>预计释放</span>
        <code class={sheetValueClass}>{formatSizeFromGb(props.state.selectedSize)}</code>
      </div>
    </div>
  </div>
);
