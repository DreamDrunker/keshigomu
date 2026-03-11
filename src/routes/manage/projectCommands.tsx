import { For, Show, type Component } from "solid-js";
import { sheetClass, sheetHeaderClass, toolbarMetaClass } from "~/lib/tailwind";
import type { ProjectCommand } from "~/workspace/types";

type ProjectCommandsProps = {
  commands: ProjectCommand[];
};

export const ProjectCommands: Component<ProjectCommandsProps> = (props) => (
  <div class={sheetClass}>
    <header class={sheetHeaderClass}>
      <span>常用命令</span>
      <strong class={toolbarMetaClass}>{props.commands.length} 条</strong>
    </header>
    <div>
      <For each={props.commands}>
        {(item) => (
          <div class="grid gap-[var(--space-2)] border-t border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:92px_minmax(0,1fr)] first:border-t-0 max-[900px]:grid-cols-1 max-[900px]:gap-[var(--space-1)]">
            <span class="text-[0.73rem] text-[var(--text-muted)]">
              {item.label}
              <Show when={item.scriptName}>
                <em class="ml-1 font-mono text-[0.69rem] not-italic text-[var(--text-muted)]">
                  ({item.scriptName})
                </em>
              </Show>
            </span>
            <div class="grid gap-[2px]">
              <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.74rem] text-[var(--text-strong)]">
                {item.command}
              </code>
              <Show when={item.resolvedCommand && item.resolvedCommand !== item.command}>
                <code class="block max-w-full overflow-x-auto whitespace-nowrap font-mono text-[0.7rem] text-[var(--text-muted)]">
                  ≈ {item.resolvedCommand}
                </code>
              </Show>
            </div>
          </div>
        )}
      </For>
    </div>
  </div>
);
