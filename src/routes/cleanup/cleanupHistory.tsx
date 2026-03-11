import { For, Show } from "solid-js";
import { formatSizeFromGb } from "~/lib/size";
import type { CleanupHistoryEntry } from "~/services/cleanupClient";
import {
  bytesToGb,
  cleanupRunTypeLabel,
  cleanupStatusLabel,
  formatExecutedTime,
  previewFailedPaths,
  previewRemovedPaths,
} from "./helpers";
import {
  detailsClass,
  detailsSummaryClass,
  stackedItemClass,
  stackedListClass,
} from "./styles";

type CleanupHistoryProps = {
  loading: boolean;
  entries: CleanupHistoryEntry[];
  total: number;
  resolveProjectName: (projectId: string) => string;
};

export const CleanupHistory = (props: CleanupHistoryProps) => (
  <div class="mt-[var(--space-3)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)]">
    <header class="flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)] text-[0.74rem] text-[var(--text-muted)]">
      <span>最近的清理记录</span>
      <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">{props.total} 条</strong>
    </header>
    <Show when={props.loading}>
      <div>
        <div class="grid gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]">
          <span class="text-[0.73rem] text-[var(--text-muted)]">状态</span>
          <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]">正在加载...</code>
        </div>
      </div>
    </Show>
    <Show when={!props.loading && props.entries.length === 0}>
      <div>
        <div class="grid gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]">
          <span class="text-[0.73rem] text-[var(--text-muted)]">状态</span>
          <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]">还没有清理记录</code>
        </div>
      </div>
    </Show>
    <Show when={props.entries.length > 0}>
      <div class={stackedListClass}>
        <For each={props.entries}>
          {(entry) => (
            <div class={stackedItemClass}>
              <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">
                {formatExecutedTime(entry.executedAt)}
              </p>
              <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                {cleanupRunTypeLabel(entry.runType)} · {cleanupStatusLabel(entry.status)} · {entry.projectCount} 项目 · {entry.itemCount} 条目 · {formatSizeFromGb(bytesToGb(entry.releasedBytes))}
              </span>
              <Show when={(entry.projectDetails ?? []).length > 0}>
                <details class={detailsClass}>
                  <summary class={detailsSummaryClass}>
                    <span class="inline-block transition-transform duration-200 group-open:rotate-90">▸</span>
                    查看详情
                  </summary>
                  <div class="mt-[var(--space-2)] grid gap-[var(--space-2)]">
                    <For each={entry.projectDetails}>
                      {(projectDetail) => {
                        const preview = previewRemovedPaths(projectDetail.removedPaths);
                        const failedPreview = previewFailedPaths(projectDetail.failedPaths ?? []);
                        return (
                          <div class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] p-[var(--space-2)]">
                            <p class="m-0 text-[0.74rem] font-semibold text-[var(--text-strong)]">
                              {props.resolveProjectName(projectDetail.projectId)}
                            </p>
                            <span class="mt-1 block font-mono text-[0.69rem] text-[var(--text-muted)]">
                              {cleanupStatusLabel(projectDetail.status)} · {projectDetail.removedCount} 项 · {formatSizeFromGb(bytesToGb(projectDetail.releasedBytes))}
                            </span>
                            <Show when={preview.list.length > 0}>
                              <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                                <For each={preview.list}>
                                  {(path) => (
                                    <code class="block break-all rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px] text-[0.69rem] leading-[1.5] text-[var(--text-normal)]">
                                      {path}
                                    </code>
                                  )}
                                </For>
                                <Show when={preview.hiddenCount > 0}>
                                  <p class="m-0 text-[0.7rem] text-[var(--text-muted)]">还有 {preview.hiddenCount} 条未显示</p>
                                </Show>
                              </div>
                            </Show>
                            <Show when={failedPreview.list.length > 0}>
                              <div class="mt-[var(--space-2)] grid gap-[var(--space-1)]">
                                <For each={failedPreview.list}>
                                  {(failedPath) => (
                                    <div class="grid gap-[2px] rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[6px]">
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
                            </Show>
                          </div>
                        );
                      }}
                    </For>
                  </div>
                </details>
              </Show>
            </div>
          )}
        </For>
      </div>
    </Show>
  </div>
);
