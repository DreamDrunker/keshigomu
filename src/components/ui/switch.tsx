import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import type { PolymorphicProps } from "@kobalte/core";
import * as SwitchPrimitive from "@kobalte/core/switch";

import { cn } from "~/lib/utils";

const Switch = SwitchPrimitive.Root;

type SwitchControlProps = SwitchPrimitive.SwitchControlProps & {
  class?: string | undefined;
  children?: JSX.Element;
};

const SwitchControl = <T extends ValidComponent = "input">(
  props: PolymorphicProps<T, SwitchControlProps>,
) => {
  const [local, others] = splitProps(props as SwitchControlProps, ["class", "children"]);
  return (
    <>
      <SwitchPrimitive.Input
        class={cn(
          "[&:focus-visible+div]:outline-none [&:focus-visible+div]:ring-2 [&:focus-visible+div]:ring-[var(--primary-soft)]",
        )}
      />
      <SwitchPrimitive.Control
        class={cn(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border border-transparent bg-[var(--line-strong)] transition-colors duration-200 data-[disabled]:cursor-not-allowed data-[checked]:bg-[var(--primary)] data-[disabled]:opacity-50",
          local.class
        )}
        {...others}
      >
        {local.children}
      </SwitchPrimitive.Control>
    </>
  )
};

type SwitchThumbProps = SwitchPrimitive.SwitchThumbProps & { class?: string | undefined };

const SwitchThumb = <T extends ValidComponent = "div">(
  props: PolymorphicProps<T, SwitchThumbProps>,
) => {
  const [local, others] = splitProps(props as SwitchThumbProps, ["class"]);
  return (
    <SwitchPrimitive.Thumb
      class={cn(
        "pointer-events-none absolute left-0.5 top-0.5 block size-5 translate-x-0 rounded-full bg-[var(--panel)] shadow-sm ring-0 transition-transform duration-200 data-[checked]:translate-x-5",
        local.class
      )}
      {...others}
    />
  );
};

export { Switch, SwitchControl, SwitchThumb };
