import type { JSX } from "solid-js";
import { splitProps } from "solid-js";
import { cn } from "../../lib/utils";

type CardProps = JSX.HTMLAttributes<HTMLElement>;

export const Card = (props: CardProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <section
      class={cn(
        "rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] shadow-[var(--shadow)]",
        local.class,
      )}
      {...rest}
    >
      {local.children}
    </section>
  );
};

type CardHeaderProps = JSX.HTMLAttributes<HTMLElement>;

export const CardHeader = (props: CardHeaderProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <header class={cn("flex flex-col gap-1 px-[var(--space-4)] py-[var(--space-4)]", local.class)} {...rest}>
      {local.children}
    </header>
  );
};

type CardTitleProps = JSX.HTMLAttributes<HTMLHeadingElement>;

export const CardTitle = (props: CardTitleProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <h3 class={cn("text-[0.92rem] font-semibold text-[var(--text-strong)]", local.class)} {...rest}>
      {local.children}
    </h3>
  );
};

type CardDescriptionProps = JSX.HTMLAttributes<HTMLParagraphElement>;

export const CardDescription = (props: CardDescriptionProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <p class={cn("text-[0.75rem] text-[var(--text-muted)]", local.class)} {...rest}>
      {local.children}
    </p>
  );
};

type CardContentProps = JSX.HTMLAttributes<HTMLDivElement>;

export const CardContent = (props: CardContentProps) => {
  const [local, rest] = splitProps(props, ["class", "children"]);
  return (
    <div class={cn("px-[var(--space-4)] pb-[var(--space-4)]", local.class)} {...rest}>
      {local.children}
    </div>
  );
};
