import { cn } from "~/lib/utils";

export const paneHeadClass = "flex flex-col gap-[var(--space-1)]";

export const paneHeadActionsClass =
  "flex items-start justify-between gap-[var(--space-3)] max-[720px]:flex-col max-[720px]:items-stretch";

export const paneHeadTextClass = "min-w-0";

export const paneHeadActionListClass =
  "flex flex-wrap items-center justify-end gap-[var(--space-2)] max-[720px]:justify-start";

export const paneHeadingClass = "m-0 text-[0.92rem] font-semibold text-[var(--text-strong)]";

export const paneHintClass = "m-0 text-[0.75rem] text-[var(--text-muted)]";

export const settingsHeaderTopClass =
  "flex items-start justify-between gap-[var(--space-3)] max-[720px]:flex-col max-[720px]:items-stretch";

export const settingsHeaderTitleRowClass = "flex min-w-0 flex-wrap items-center gap-[var(--space-2)]";

export const settingsHeaderActionClass =
  "flex items-center justify-end max-[720px]:justify-start";

export const navItemClass = (active: boolean) =>
  cn(
    "rounded-[var(--radius-sm)] border border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] text-left transition-colors duration-200",
    active
      ? "border-[color:var(--primary-outline)] bg-[var(--primary-soft)]"
      : "bg-transparent hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)]",
  );

export const themeOptionClass = (active: boolean) =>
  cn(
    "grid min-h-[86px] items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-3)] text-left transition-colors duration-200 [grid-template-columns:minmax(0,1fr)_auto] max-[900px]:min-h-[78px]",
    active
      ? "border-[color:var(--primary)] bg-[var(--primary-soft)]"
      : "hover:border-[color:var(--line-strong)] hover:bg-[var(--panel-soft)]",
  );

export const modeChipClass = (active: boolean) =>
  cn(
    "rounded-full border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[6px] text-[0.74rem] font-semibold text-[var(--text-muted)] transition-colors duration-200",
    active && "border-[color:var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
  );

export const policyRowClass =
  "flex items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-3)] max-[900px]:bg-[var(--panel)]";

export const numberFieldClass = "grid gap-[var(--space-1)]";

export const numberLabelClass = "text-[0.76rem] text-[var(--text-muted)]";

export const projectListClass =
  "mt-[var(--space-2)] mx-[var(--space-2)] mb-[var(--space-2)] overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)]";

export const projectItemClass =
  "px-[var(--space-3)] py-[var(--space-2)] [&+&]:border-t [&+&]:border-[color:var(--line)]";

export const feedbackCalloutClass = (tone: "info" | "success" | "error") =>
  cn(
    "rounded-[var(--radius-sm)] border px-[var(--space-3)] py-[var(--space-3)] text-[0.76rem] leading-[1.5]",
    tone === "success" &&
      "border-[color:color-mix(in_srgb,var(--success)_36%,transparent)] [background-color:color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
    tone === "error" &&
      "border-[color:rgba(166,61,40,0.36)] bg-[rgba(166,61,40,0.08)] text-[#a63d28]",
    tone === "info" &&
      "border-[color:var(--line)] bg-[var(--panel-soft)] text-[var(--text-normal)]",
  );
