import { For, Show, type Component } from "solid-js";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { inputClass } from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import type {
  AppearanceSettingsActions,
  AppearanceSettingsState,
} from "./types";
import {
  paneHeadClass,
  paneHeadingClass,
  paneHintClass,
  themeOptionClass,
} from "./styles";

const customThemeColorFields: Array<{ name: string; label: string }> = [
  { name: "--bg", label: "背景" },
  { name: "--bg-tint", label: "背景渐变" },
  { name: "--panel", label: "面板" },
  { name: "--panel-soft", label: "次级面板" },
  { name: "--line", label: "边框" },
  { name: "--line-strong", label: "强调边框" },
  { name: "--text-strong", label: "主文字" },
  { name: "--text-normal", label: "正文文字" },
  { name: "--text-muted", label: "辅助文字" },
  { name: "--primary", label: "主色" },
  { name: "--primary-hover", label: "主色悬停" },
  { name: "--success", label: "成功色" },
  { name: "--warning", label: "警告色" },
];

const customThemeScaleFields: Array<{
  name: string;
  label: string;
  min: number;
  max: number;
  step: number;
  fallback: number;
}> = [
  { name: "--radius-sm", label: "小圆角", min: 2, max: 14, step: 1, fallback: 6 },
  { name: "--radius-md", label: "中圆角", min: 4, max: 18, step: 1, fallback: 8 },
  { name: "--radius-lg", label: "大圆角", min: 6, max: 24, step: 1, fallback: 10 },
  { name: "--space-2", label: "紧凑间距", min: 4, max: 14, step: 1, fallback: 8 },
  { name: "--space-3", label: "标准间距", min: 8, max: 18, step: 1, fallback: 12 },
  { name: "--space-4", label: "宽松间距", min: 12, max: 24, step: 1, fallback: 16 },
  { name: "--titlebar-height", label: "标题栏高度", min: 30, max: 52, step: 1, fallback: 36 },
];

const customThemeRawFields: Array<{ name: string; label: string; placeholder: string }> = [
  {
    name: "--primary-soft",
    label: "主色柔和层",
    placeholder: "rgba(198, 142, 114, 0.16)",
  },
  {
    name: "--primary-outline",
    label: "主色描边",
    placeholder: "rgba(198, 142, 114, 0.38)",
  },
  { name: "--transition", label: "交互过渡", placeholder: "180ms ease" },
  {
    name: "--shadow",
    label: "面板阴影",
    placeholder: "none 或 0 18px 32px -24px rgba(0, 0, 0, 0.25)",
  },
];

const parsePixelValue = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value.replace("px", ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

type AppearanceSettingsProps = {
  state: AppearanceSettingsState;
  actions: AppearanceSettingsActions;
};

export const AppearanceSettings: Component<AppearanceSettingsProps> = (props) => (
  <section class="flex flex-col gap-[var(--space-3)]">
    <div class={paneHeadClass}>
      <h3 class={paneHeadingClass}>主题方案</h3>
      <p class={paneHintClass}>选择预设主题，或按自己的习惯调整颜色。</p>
    </div>

    <div class="grid grid-cols-2 items-stretch gap-[var(--space-2)] max-[900px]:grid-cols-1">
      <For each={props.state.themeOptions}>
        {(option) => (
          <button
            class={themeOptionClass(props.state.activeTheme === option.key)}
            onClick={() => props.actions.onThemeChange(option.key)}
            type="button"
          >
            <div class="min-w-0">
              <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">{option.label}</p>
              <span class="mt-[var(--space-1)] block text-[0.73rem] leading-[1.38] text-[var(--text-muted)]">
                {option.description}
              </span>
            </div>
            <Badge class="min-w-[72px]" variant="outline">
              {props.state.themeBadgeLabels[option.key]}
            </Badge>
          </button>
        )}
      </For>
    </div>

    <Show when={props.state.activeTheme === "custom"}>
      <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--primary-outline)] bg-[var(--panel-soft)] p-[var(--space-3)]">
        <div class={paneHeadClass}>
          <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">色彩变量</h3>
          <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">调整主色、背景和文字层级。</p>
        </div>

        <div class="grid grid-cols-3 gap-[var(--space-2)] max-[900px]:grid-cols-1">
          <For each={customThemeColorFields}>
            {(field) => (
              <label class="flex min-h-[46px] items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] even:bg-[var(--panel-soft)] max-[900px]:bg-[var(--panel)]">
                <span class="text-[0.76rem] font-medium text-[var(--text-normal)]">{field.label}</span>
                <input
                  class="h-7 w-[42px] cursor-pointer rounded-[8px] border border-[color:var(--line-strong)] bg-[repeating-conic-gradient(from_45deg,rgba(0,0,0,0.08)_0deg_90deg,rgba(255,255,255,0.42)_90deg_180deg)] bg-[length:8px_8px] p-[2px] [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-[5px] [&::-moz-color-swatch]:border-0"
                  type="color"
                  value={props.state.customTheme[field.name] ?? "#000000"}
                  onInput={(event) =>
                    props.actions.onCustomThemeChange(field.name, event.currentTarget.value)}
                />
              </label>
            )}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel-soft)] p-[var(--space-3)]">
        <div class={paneHeadClass}>
          <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">尺寸与密度</h3>
          <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">调整圆角、间距和标题栏尺寸。</p>
        </div>

        <div class="grid grid-cols-2 gap-[var(--space-2)] max-[900px]:grid-cols-1">
          <For each={customThemeScaleFields}>
            {(field) => {
              const value = () => parsePixelValue(props.state.customTheme[field.name], field.fallback);

              return (
                <label class="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] p-[var(--space-2)]">
                  <div class="flex items-center justify-between gap-[var(--space-2)]">
                    <span class="text-[0.74rem] text-[var(--text-normal)]">{field.label}</span>
                    <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-muted)]">
                      {Math.round(value())} px
                    </strong>
                  </div>

                  <div class="grid items-center gap-[var(--space-2)] [grid-template-columns:1fr_74px]">
                    <input
                      class="w-full accent-[var(--primary)]"
                      type="range"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={String(value())}
                      onInput={(event) =>
                        props.actions.onCustomThemeChange(
                          field.name,
                          `${event.currentTarget.value}px`,
                        )}
                    />
                    <input
                      class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[7px] py-[5px] text-center font-mono text-[0.75rem] text-[var(--text-normal)] outline-none transition-colors focus:border-[var(--primary)] focus:bg-[var(--panel)]"
                      type="number"
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={String(Math.round(value()))}
                      onInput={(event) =>
                        props.actions.onCustomThemeChange(
                          field.name,
                          `${event.currentTarget.value || field.fallback}px`,
                        )}
                    />
                  </div>
                </label>
              );
            }}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel-soft)] p-[var(--space-3)]">
        <div class={paneHeadClass}>
          <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">动效与阴影</h3>
          <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">调整过渡节奏和阴影表现。</p>
        </div>

        <div class="grid gap-[var(--space-2)]">
          <For each={customThemeRawFields}>
            {(field) => (
              <label class="grid gap-[var(--space-1)]">
                <span class="text-[0.72rem] text-[var(--text-muted)]">{field.label}</span>
                <input
                  class={cn(inputClass, "font-mono text-[0.74rem]")}
                  value={props.state.customTheme[field.name] ?? ""}
                  onInput={(event) =>
                    props.actions.onCustomThemeChange(field.name, event.currentTarget.value)}
                  placeholder={field.placeholder}
                />
              </label>
            )}
          </For>
        </div>
      </div>

      <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--primary-outline)] bg-[var(--panel-soft)] p-[var(--space-3)]">
        <div>
          <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">高级自定义</p>
          <span class="mt-[var(--space-1)] block text-[0.73rem] text-[var(--text-muted)]">
            可恢复默认配色，也可用 CSS 做更细的调整。
          </span>
        </div>

        <div class="flex flex-wrap items-center gap-[var(--space-2)]">
          <Button onClick={props.actions.onResetCustomTheme}>恢复默认配色</Button>

          <label class="cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-semibold text-[var(--text-normal)] transition-colors duration-200 hover:border-[color:var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--text-strong)]">
            <input
              class="hidden"
              type="file"
              accept=".css,text/css"
              onChange={(event) => {
                props.actions.onImportCustomCssFile(event.currentTarget.files?.[0] ?? null);
                event.currentTarget.value = "";
              }}
            />
            <span>导入 CSS 文件</span>
          </label>

          <Show when={props.state.customCssFileName}>
            <Badge variant="outline">{props.state.customCssFileName}</Badge>
          </Show>

          <Button
            variant="ghost"
            class="border-[color:var(--line-strong)] bg-[var(--panel)] text-[var(--text-muted)] hover:bg-[var(--panel)] hover:text-[var(--text-strong)]"
            onClick={props.actions.onClearCustomCss}
          >
            清空自定义 CSS
          </Button>
        </div>

        <textarea
          class={cn(
            inputClass,
            "min-h-[164px] resize-y py-[var(--space-3)] font-mono text-[0.74rem] leading-[1.6] focus:ring-2 focus:ring-[var(--primary-soft)]",
          )}
          value={props.state.customCssText}
          onInput={(event) => props.actions.onCustomCssTextChange(event.currentTarget.value)}
          placeholder={"支持写入任何 CSS，例如：\n:root { --radius-md: 10px; }\nbody { letter-spacing: 0.01em; }"}
          spellcheck={false}
        />
      </div>
    </Show>
  </section>
);
