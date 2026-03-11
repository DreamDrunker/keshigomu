import { noDragClass } from "~/lib/tailwind";
import { cn } from "~/lib/utils";

type WorkspaceHeaderProps = {
  activePageLabel: string;
  activeProjectName: string;
  activePageDescription: string;
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
};

export const WorkspaceHeader = (props: WorkspaceHeaderProps) => (
  <header class="flex shrink-0 items-center justify-between gap-[var(--space-4)] border-b border-[color:var(--line)] pb-[var(--space-3)] max-[900px]:flex-col max-[900px]:items-start">
    <button
      class={cn(
        noDragClass,
        "inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-2)] text-[0.8rem] text-[var(--text-normal)]",
      )}
      onClick={props.onOpenCommandPalette}
      type="button"
    >
      <span>快速命令</span>
      <kbd class="rounded-[6px] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[6px] py-[2px] font-mono text-[0.69rem] text-[var(--text-muted)]">
        ⌘K / Ctrl+K
      </kbd>
    </button>

    <div class="flex flex-wrap items-center justify-end gap-[var(--space-2)] text-[0.74rem] text-[var(--text-muted)] max-[900px]:justify-start">
      <span>{props.activePageLabel}</span>
      <span>{props.activeProjectName}</span>
      <span>{props.activePageDescription}</span>
      <button
        class="bg-transparent p-0 text-[0.74rem] text-[var(--primary)] hover:underline"
        onClick={props.onOpenSettings}
        type="button"
      >
        设置
      </button>
    </div>
  </header>
);
