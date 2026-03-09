import type { Component } from "solid-js";
import { cn } from "~/lib/utils";
import { dragRegionClass } from "~/lib/tailwind";

type TitleBarProps = {
  isMacPlatform: boolean;
  onStartDrag: (event: MouseEvent) => void;
};

export const TitleBar: Component<TitleBarProps> = (props) => (
  <header
    class={cn(
      dragRegionClass,
      "flex h-[var(--titlebar-height)] items-center border-b border-[color:var(--line)] bg-[var(--bg)] px-[var(--space-4)] text-[0.72rem] text-[var(--text-muted)]",
      props.isMacPlatform && "pl-[84px]",
    )}
    data-tauri-drag-region
    onMouseDown={props.onStartDrag}
  >
    <span
      class={cn(
        dragRegionClass,
        "text-[0.88rem] font-semibold tracking-[0.01em] text-[var(--text-strong)]",
      )}
      data-tauri-drag-region
    >
      keshigomu
    </span>
  </header>
);
