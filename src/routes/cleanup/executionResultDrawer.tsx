import { For, Show } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { formatSizeFromGb } from "~/lib/size";
import {
  cleanupStatusLabel,
  formatExecutedTime,
  previewFailedPaths,
  previewRemovedPaths,
} from "./helpers";
import {
  detailsClass,
  detailsSummaryClass,
  drawerClass,
  stackedItemClass,
  stackedListClass,
} from "./styles";
import type { ExecutionResultState } from "./types";

type ExecutionResultDrawerProps = {
  result: ExecutionResultState;
  onClose: () => void;
};

export const ExecutionResultDrawer = (props: ExecutionResultDrawerProps) => (
  <>
    <div
      class="fixed inset-x-0 bottom-0 top-[var(--titlebar-height)] z-20 bg-[rgba(15,23,42,0.28)]"
      onClick={props.onClose}
    />
    <aside class={drawerClass} role="dialog" aria-label="清理结果">
      <header class="flex items-center justify-between gap-[var(--space-3)] border-b border-[color:var(--line)] px-[var(--space-4)] py-[var(--space-4)]">
        <div>
          <h3 class="m-0 text-[0.92rem] font-semibold text-[var(--text-strong)]">清理结果</h3>
          <p class="mt-[var(--space-1)] text-[0.74rem] text-[var(--text-muted)]">
            {formatExecutedTime(props.result.executedAt)}
          </p>
        </div>
        <Badge variant="success">已完成</Badge>
      </header>

      <section class="flex min-h-0 flex-col gap-[var(--space-3)] overflow-auto p-[var(--space-4)]">
        <div class="grid gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] p-[var(--space-3)]">
          <p>
            清理方式 <strong>{props.result.modeLabel}</strong>
          </p>
          <p>
            处理项目 <strong>{props.result.projectCount}</strong> 个
          </p>
          <p>
            清理条目 <strong>{props.result.itemCount}</strong> 项
          </p>
          <p>
            释放空间 <strong>{formatSizeFromGb(props.result.releasedGb)}</strong>
          </p>
        </div>

        <div class={stackedListClass}>
          <For each={props.result.projects}>
            {(project) => {
              const preview = previewRemovedPaths(project.removedPaths, 12);
              const failedPreview = previewFailedPaths(project.failedPaths, 12);
              return (
                <div class={stackedItemClass}>
                  <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">{project.projectName}</p>
                  <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                    {cleanupStatusLabel(project.status)} · {project.removedCount} 项 · {formatSizeFromGb(project.releasedGb)}
                  </span>
                  <Show when={preview.list.length > 0}>
                    <details class={detailsClass}>
                      <summary class={detailsSummaryClass}>
                        <span class="inline-block transition-transform duration-200 group-open:rotate-90">▸</span>
                        查看已清理内容
                      </summary>
                      <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                        <For each={preview.list}>
                          {(path) => (
                            <code class="block break-all rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-2)] py-[6px] text-[0.69rem] leading-[1.5] text-[var(--text-normal)]">
                              {path}
                            </code>
                          )}
                        </For>
                        <Show when={preview.hiddenCount > 0}>
                          <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">还有 {preview.hiddenCount} 条未显示</p>
                        </Show>
                      </div>
                    </details>
                  </Show>
                  <Show when={failedPreview.list.length > 0}>
                    <details class={detailsClass}>
                      <summary class={detailsSummaryClass}>
                        <span class="inline-block transition-transform duration-200 group-open:rotate-90">▸</span>
                        查看未完成内容
                      </summary>
                      <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                        <For each={failedPreview.list}>
                          {(failedPath) => (
                            <div class="grid gap-[2px] rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-2)] py-[6px]">
                              <code class="m-0 block break-all text-[0.69rem] leading-[1.45] text-[var(--text-normal)]">
                                {failedPath.path}
                              </code>
                              <span class="m-0 text-[0.67rem] leading-[1.4] text-[var(--warning)]">
                                {failedPath.reason}
                              </span>
                            </div>
                          )}
                        </For>
                        <Show when={failedPreview.hiddenCount > 0}>
                          <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">还有 {failedPreview.hiddenCount} 条未显示</p>
                        </Show>
                      </div>
                    </details>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>

        <div class="mt-auto flex items-center justify-end gap-[var(--space-2)] border-t border-[color:var(--line)] pt-[var(--space-3)]">
          <Button onClick={props.onClose}>完成</Button>
        </div>
      </section>
    </aside>
  </>
);
