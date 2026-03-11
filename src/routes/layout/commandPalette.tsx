import { For, Show, createEffect } from "solid-js";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "~/components/ui/command";
import type { CommandAction } from "~/workspace/types";

type WorkspaceCommandPaletteProps = {
  open: boolean;
  query: string;
  actions: CommandAction[];
  onOpenChange: (open: boolean) => void;
  onQueryChange: (value: string) => void;
  onExecuteAction: (action: CommandAction) => void;
};

export const WorkspaceCommandPalette = (props: WorkspaceCommandPaletteProps) => {
  let commandInputRef!: HTMLInputElement;

  createEffect(() => {
    props.open && queueMicrotask(() => commandInputRef?.focus());
  });

  return (
    <CommandDialog open={props.open} onOpenChange={props.onOpenChange}>
      <CommandInput
        ref={(element) => {
          commandInputRef = element;
        }}
        value={props.query}
        onInput={(event) => props.onQueryChange(event.currentTarget.value)}
        placeholder="搜索操作，例如“设置”"
      />

      <CommandList>
        <CommandEmpty>没有找到相关操作</CommandEmpty>
        <Show when={props.actions.length > 0}>
          <CommandGroup heading="快捷操作">
            <For each={props.actions}>
              {(action) => (
                <CommandItem
                  value={`${action.label} ${action.keywords}`}
                  onSelect={() => props.onExecuteAction(action)}
                >
                  <span>{action.label}</span>
                  <Show when={action.shortcut}>
                    <CommandShortcut>{action.shortcut}</CommandShortcut>
                  </Show>
                </CommandItem>
              )}
            </For>
          </CommandGroup>
        </Show>
      </CommandList>
    </CommandDialog>
  );
};
