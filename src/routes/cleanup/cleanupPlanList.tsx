import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { formatSizeFromGb } from "~/lib/size";
import { planCategoryLabels } from "~/workspace/constants";
import type { CleanupPlanViewState } from "./types";
import {
  planItemClass,
  planItemHeaderClass,
  planItemMetaClass,
  planListClass,
  planPathClass,
} from "./styles";

type CleanupPlanListProps = {
  state: CleanupPlanViewState;
  onToggleItem: (projectId: string, itemId: string) => void;
};

export const CleanupPlanList = (props: CleanupPlanListProps) => (
  <>
    <Show when={props.state.error}>
      <div class="mt-[var(--space-3)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)]">
        <header class="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)] text-[0.74rem] text-[var(--text-muted)]">
          <span>可清理内容加载失败</span>
        </header>
        <div class="grid gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]">
          <span class="text-[0.73rem] text-[var(--text-muted)]">原因</span>
          <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]">
            {props.state.error}
          </code>
        </div>
      </div>
    </Show>

    <Show when={props.state.loading}>
      <div class="mt-[var(--space-3)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)]">
        <header class="flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)] text-[0.74rem] text-[var(--text-muted)]">
          <span>正在整理可清理内容</span>
          <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">请稍候</strong>
        </header>
      </div>
    </Show>

    <Show when={!props.state.loading && props.state.items.length === 0}>
      <div class="mt-[var(--space-3)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)]">
        <header class="flex items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)] text-[0.74rem] text-[var(--text-muted)]">
          <span>现在没有可清理内容</span>
        </header>
      </div>
    </Show>

    <p class="mt-[var(--space-3)] text-[0.72rem] leading-[1.5] text-[var(--text-muted)]">
      {props.state.editable
        ? "可按这个项目的需要调整清理范围。"
        : "当前只清理低风险内容。若要调整范围，请先为这个项目启用单独设置。"}
    </p>

    <div class={planListClass}>
      <For each={props.state.items}>
        {(item) => (
          <label class={planItemClass}>
            <input
              class="mt-[2px] size-[15px] accent-[var(--primary)]"
              type="checkbox"
              checked={props.state.selectedIds.includes(item.id)}
              disabled={!props.state.editable}
              onChange={() => props.onToggleItem(props.state.projectId, item.id)}
            />
            <div class="min-w-0">
              <div class={planItemHeaderClass}>
                <p class="m-0 min-w-0 text-[0.83rem] font-semibold text-[var(--text-strong)]">
                  {item.label}
                </p>
                <div class={planItemMetaClass}>
                  <Badge class="shrink-0" variant={item.risk === "low" ? "success" : "warning"}>
                    {item.risk === "low" ? "低风险" : "中风险"}
                  </Badge>
                  <span class="shrink-0 font-mono text-[0.72rem] text-[var(--text-muted)]">
                    {formatSizeFromGb(item.sizeGb)}
                  </span>
                </div>
              </div>
              <p class="mt-[var(--space-1)] flex min-w-0 flex-wrap items-center gap-[var(--space-2)]">
                <span class={planPathClass}>{item.relativePath}</span>
                <em class="shrink-0 rounded-full border border-[color:var(--line)] px-[6px] py-[3px] text-[0.66rem] not-italic text-[var(--text-muted)]">
                  {planCategoryLabels[item.category]}
                </em>
              </p>
            </div>
          </label>
        )}
      </For>
    </div>
  </>
);
