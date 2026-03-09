import type { Component, ComponentProps } from "solid-js";
import { splitProps } from "solid-js";

import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";

import { cn } from "~/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full px-[var(--space-2)] py-[5px] text-[0.68rem] font-bold leading-none",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary-soft)] text-[var(--primary)]",
        secondary: "bg-[var(--primary-soft)] text-[var(--primary)]",
        outline: "border border-[color:var(--line-strong)] text-[var(--text-muted)]",
        success:
          "[background-color:color-mix(in_srgb,var(--success)_14%,transparent)] text-[var(--success)]",
        warning:
          "[background-color:color-mix(in_srgb,var(--warning)_14%,transparent)] text-[var(--warning)]",
        error: "[background-color:rgba(166,61,40,0.14)] text-[#a63d28]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

type BadgeProps = ComponentProps<"div"> &
  VariantProps<typeof badgeVariants> & {
    round?: boolean;
  };

const Badge: Component<BadgeProps> = (props) => {
  const [local, others] = splitProps(props, ["class", "variant", "round"]);
  return (
    <div
      class={cn(
        badgeVariants({ variant: local.variant }),
        local.round && "rounded-full",
        local.class,
      )}
      {...others}
    />
  );
};

export { Badge };
