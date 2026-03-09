import type { JSX, ValidComponent } from "solid-js";
import { splitProps } from "solid-js";

import * as ButtonPrimitive from "@kobalte/core/button";
import type { PolymorphicProps } from "@kobalte/core/polymorphic";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-[var(--space-2)] whitespace-nowrap rounded-[8px] border border-transparent font-semibold leading-none transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary-soft)] disabled:cursor-not-allowed disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-white hover:bg-[var(--primary-hover)]",
        destructive: "bg-[#a63d28] text-white hover:bg-[#8f341f]",
        outline:
          "border-[color:var(--line-strong)] bg-transparent text-[var(--text-normal)] hover:border-[var(--primary-outline)] hover:bg-[var(--primary-soft)] hover:text-[var(--text-strong)]",
        secondary:
          "border-[color:var(--line)] bg-[var(--panel-soft)] text-[var(--text-strong)] hover:border-[var(--line-strong)] hover:bg-[var(--panel)]",
        ghost:
          "bg-transparent text-[var(--text-normal)] hover:border-[color:var(--line)] hover:bg-[var(--panel-soft)]",
        link: "border-transparent bg-transparent px-0 text-[var(--primary)] hover:text-[var(--primary-hover)] hover:underline",
      },
      size: {
        default: "min-h-8 px-[var(--space-4)] py-[var(--space-2)] text-[0.82rem]",
        sm: "min-h-8 px-[var(--space-3)] py-[6px] text-[0.75rem]",
        lg: "min-h-10 px-[var(--space-4)] py-[var(--space-3)] text-[0.88rem]",
        icon: "size-[34px] p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type ButtonProps<T extends ValidComponent = "button"> = ButtonPrimitive.ButtonRootProps<T> &
  VariantProps<typeof buttonVariants> & { class?: string | undefined; children?: JSX.Element };

const Button = <T extends ValidComponent = "button">(
  props: PolymorphicProps<T, ButtonProps<T>>,
) => {
  const [local, others] = splitProps(props as ButtonProps, ["variant", "size", "class"]);
  return (
    <ButtonPrimitive.Root
      class={cn(buttonVariants({ variant: local.variant, size: local.size }), local.class)}
      {...others}
    />
  );
};

export { Button };
