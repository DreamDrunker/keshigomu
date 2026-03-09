export const dragRegionClass = "[-webkit-app-region:drag] [app-region:drag]";

export const noDragClass = "[-webkit-app-region:no-drag] [app-region:no-drag]";

export const surfaceClass =
  "rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]";

export const surfaceSoftClass =
  "rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)]";

export const sheetClass = `${surfaceClass} mt-[var(--space-3)] overflow-hidden`;

export const sheetHeaderClass =
  "flex items-center justify-between gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-3)] text-[0.74rem] text-[var(--text-muted)]";

export const sheetHeaderValueClass =
  "font-mono text-[0.72rem] font-medium text-[var(--text-normal)]";

export const sheetRowClass =
  "grid gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]";

export const sheetLabelClass = "text-[0.73rem] text-[var(--text-muted)]";

export const sheetValueClass =
  "block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]";

export const inputClass =
  "w-full rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.82rem] text-[var(--text-normal)] outline-none transition-colors focus:border-[var(--primary)] disabled:bg-[var(--panel-soft)] disabled:text-[var(--text-muted)] disabled:opacity-90";

export const shellClass =
  "fixed inset-0 grid overflow-hidden bg-[var(--bg)] [grid-template-rows:var(--titlebar-height)_minmax(0,1fr)]";

export const workspaceLayoutClass =
  "grid min-h-0 [grid-template-columns:220px_minmax(0,1fr)] max-[1024px]:[grid-template-columns:76px_minmax(0,1fr)]";

export const workbenchClass =
  "mt-[var(--space-5)] grid min-h-0 flex-1 overflow-hidden [grid-template-columns:1.1fr_0.9fr] max-[1100px]:flex-none max-[1100px]:grid-cols-1 max-[1100px]:gap-[var(--space-5)] max-[1100px]:overflow-visible";

export const paneClass =
  "grid min-h-0 min-w-0 [grid-template-rows:auto_minmax(0,1fr)_auto] max-[1100px]:flex max-[1100px]:min-h-auto max-[1100px]:flex-col";

export const splitPaneClass =
  "border-l border-[color:var(--line)] pl-[var(--space-5)] ml-[var(--space-5)] max-[1100px]:border-l-0 max-[1100px]:border-t max-[1100px]:pl-0 max-[1100px]:pt-[var(--space-4)] max-[1100px]:ml-0";

export const paneScrollClass =
  "min-h-0 overflow-auto overscroll-contain max-[1100px]:min-h-auto max-[1100px]:overflow-visible";

export const paneToolbarClass = "flex items-center justify-between gap-[var(--space-3)]";

export const paneTitleClass = "m-0 text-[0.95rem] font-semibold text-[var(--text-strong)]";

export const toolbarMetaClass = "font-mono text-[0.74rem] text-[var(--text-muted)]";

export const paneFooterClass =
  "mt-[var(--space-3)] flex items-center justify-between gap-[var(--space-3)] border-t border-[color:var(--line)] pt-[var(--space-3)] text-[0.76rem] text-[var(--text-muted)] max-[1100px]:flex-wrap";

export const inspectorClass = `${surfaceClass} mt-[var(--space-3)] overflow-hidden`;

export const inspectorRowClass =
  "grid gap-[var(--space-3)] px-[var(--space-3)] py-[var(--space-3)] [grid-template-columns:132px_minmax(0,1fr)] [&+&]:border-t [&+&]:border-[color:var(--line)]";

export const inspectorLabelClass = "text-[0.74rem] text-[var(--text-muted)]";

export const inspectorValueClass =
  "block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.8rem] text-[var(--text-strong)]";
