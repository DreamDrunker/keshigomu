import type { Component, ComponentProps, ParentProps, VoidProps } from "solid-js";
import { splitProps } from "solid-js";
import type { DialogRootProps } from "@kobalte/core/dialog";
import * as DialogPrimitive from "@kobalte/core/dialog";
import * as CommandPrimitive from "cmdk-solid";
import { cn } from "~/lib/utils";

const Command: Component<ParentProps<CommandPrimitive.CommandRootProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <CommandPrimitive.CommandRoot class={cn(local.class)} {...others} />;
};

const CommandDialog: Component<ParentProps<DialogRootProps>> = (props) => {
  const [local, others] = splitProps(props, ["children"]);
  return (
    <DialogPrimitive.Root {...others}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class="fixed inset-0 z-40 bg-[rgba(15,23,42,0.18)]" />
        <DialogPrimitive.Content
          class="fixed left-1/2 top-[72px] z-50 w-[min(680px,calc(100vw-40px))] -translate-x-1/2 overflow-hidden rounded-[10px] border border-[color:var(--line-strong)] bg-[var(--panel)] shadow-[var(--shadow)] max-[900px]:top-10"
          aria-label="快速命令"
        >
          <Command>{local.children}</Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
};

const CommandInput: Component<VoidProps<CommandPrimitive.CommandInputProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <CommandPrimitive.CommandInput
      class={cn(
        "w-full border-0 border-b border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-4)] py-[var(--space-3)] text-[0.86rem] text-[var(--text-strong)] outline-none placeholder:text-[var(--text-muted)]",
        local.class,
      )}
      {...others}
    />
  );
};

const CommandList: Component<ParentProps<CommandPrimitive.CommandListProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <CommandPrimitive.CommandList
      class={cn(
        "max-h-80 overflow-auto [&_[cmdk-group]]:p-0 [&_[cmdk-group-heading]]:m-0 [&_[cmdk-group-heading]]:border-b [&_[cmdk-group-heading]]:border-[color:var(--line)] [&_[cmdk-group-heading]]:bg-[var(--panel-soft)] [&_[cmdk-group-heading]]:px-[var(--space-4)] [&_[cmdk-group-heading]]:py-[var(--space-2)] [&_[cmdk-group-heading]]:text-[0.72rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-[0.02em] [&_[cmdk-group-heading]]:text-[var(--text-muted)]",
        local.class,
      )}
      {...others}
    />
  );
};

const CommandEmpty: Component<ParentProps<CommandPrimitive.CommandEmptyProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <CommandPrimitive.CommandEmpty
      class={cn("m-0 px-[var(--space-4)] py-[var(--space-4)] text-[0.78rem] text-[var(--text-muted)]", local.class)}
      {...others}
    />
  );
};

const CommandGroup: Component<ParentProps<CommandPrimitive.CommandGroupProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <CommandPrimitive.CommandGroup class={cn(local.class)} {...others} />;
};

const CommandSeparator: Component<VoidProps<CommandPrimitive.CommandSeparatorProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return <CommandPrimitive.CommandSeparator class={cn(local.class)} {...others} />;
};

const CommandItem: Component<ParentProps<CommandPrimitive.CommandItemProps>> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <CommandPrimitive.CommandItem
      class={cn(
        "flex w-full cursor-pointer items-center justify-between gap-[var(--space-3)] border-b border-[color:var(--line)] bg-transparent px-[var(--space-4)] py-[var(--space-3)] text-left text-[0.8rem] text-[var(--text-normal)] last:border-b-0 hover:bg-[var(--panel-soft)] aria-selected:bg-[var(--panel-soft)]",
        local.class,
      )}
      {...others}
    />
  );
};

const CommandShortcut: Component<ComponentProps<"kbd">> = (props) => {
  const [local, others] = splitProps(props, ["class"]);
  return (
    <kbd
      class={cn(
        "rounded-[6px] border border-[color:var(--line-strong)] bg-[var(--panel-soft)] px-[6px] py-[2px] font-mono text-[0.68rem] text-[var(--text-muted)]",
        local.class,
      )}
      {...others}
    />
  );
};

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
};
