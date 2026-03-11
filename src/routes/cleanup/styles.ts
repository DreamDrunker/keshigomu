import { surfaceClass } from "~/lib/tailwind";

export const policyRowClass =
  "flex items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-3)] max-[900px]:bg-[var(--panel)]";

export const numberFieldClass = "grid gap-[var(--space-1)]";

export const numberLabelClass = "text-[0.76rem] text-[var(--text-muted)]";

export const planListClass = `${surfaceClass} mt-[var(--space-3)] overflow-hidden`;

export const planItemClass =
  "grid items-start gap-[var(--space-3)] border-b border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] last:border-b-0 [grid-template-columns:auto_minmax(0,1fr)]";

export const planItemHeaderClass = "flex flex-wrap items-start gap-[var(--space-3)]";

export const planItemMetaClass =
  "ml-auto flex shrink-0 flex-wrap items-center justify-end gap-[var(--space-3)] text-right";

export const planPathClass =
  "block min-w-0 break-all font-mono text-[0.73rem] leading-[1.5] text-[var(--text-muted)]";

export const stackedListClass = `${surfaceClass} overflow-hidden`;

export const stackedItemClass =
  "px-[var(--space-3)] py-[var(--space-2)] [&+&]:border-t [&+&]:border-[color:var(--line)]";

export const detailsClass = "group mt-[var(--space-2)]";

export const detailsSummaryClass =
  "flex cursor-pointer list-none items-center gap-1 text-[0.72rem] font-semibold text-[var(--primary)] [&::-webkit-details-marker]:hidden";

export const drawerClass =
  "fixed right-0 top-[var(--titlebar-height)] z-30 flex h-[calc(100dvh-var(--titlebar-height))] w-[min(560px,calc(100vw-30px))] flex-col border-l border-[color:var(--line)] bg-[var(--panel)] max-[900px]:w-screen";
