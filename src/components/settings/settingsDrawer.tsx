import { For, Show, type Component } from "solid-js";
import { ArrowLeft } from "lucide-solid";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Switch, SwitchControl, SwitchThumb } from "~/components/ui/switch";
import {
  inputClass,
  sheetClass,
  sheetHeaderClass,
  sheetLabelClass,
  sheetRowClass,
  sheetValueClass,
  surfaceClass,
} from "~/lib/tailwind";
import { cn } from "~/lib/utils";
import type { DiscoveredProject } from "~/services/cleanupClient";
import type {
  CleanupRiskProfile,
  CleanupRiskProfileKey,
  MonorepoMode,
  RiskLevel,
  ScanRoot,
  SettingsTabItem,
  SettingsTabKey,
  ThemeKey,
  ThemeVars,
} from "~/workspace/types";

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
const resolveRiskFieldsByLevel = (
  fields: CleanupRiskProfileKey[],
  profile: CleanupRiskProfile,
  level: RiskLevel,
) => fields.filter((key) => profile[key] === level);

const paneHeadClass = "flex flex-col gap-[var(--space-1)]";

const paneHeadActionsClass =
  "flex items-start justify-between gap-[var(--space-3)] max-[900px]:flex-col max-[900px]:items-stretch";

const paneHeadTextClass = "min-w-0";

const paneHeadActionListClass = "flex flex-wrap items-center gap-[var(--space-2)]";

const paneHeadingClass = "m-0 text-[0.92rem] font-semibold text-[var(--text-strong)]";

const paneHintClass = "m-0 text-[0.75rem] text-[var(--text-muted)]";

const navItemClass = (active: boolean) =>
  cn(
    "rounded-[var(--radius-sm)] border border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] text-left transition-colors duration-200",
    active
      ? "border-[color:var(--primary-outline)] bg-[var(--primary-soft)]"
      : "bg-transparent hover:border-[color:var(--line-strong)] hover:bg-[var(--panel)]",
  );

const themeOptionClass = (active: boolean) =>
  cn(
    "grid min-h-[86px] items-center gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-3)] text-left transition-colors duration-200 [grid-template-columns:minmax(0,1fr)_auto] max-[900px]:min-h-[78px]",
    active
      ? "border-[color:var(--primary)] bg-[var(--primary-soft)]"
      : "hover:border-[color:var(--line-strong)] hover:bg-[var(--panel-soft)]",
  );

const modeChipClass = (active: boolean) =>
  cn(
    "rounded-full border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[6px] text-[0.74rem] font-semibold text-[var(--text-muted)] transition-colors duration-200",
    active && "border-[color:var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]",
  );

const policyRowClass =
  "flex items-center justify-between gap-[var(--space-4)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-3)] max-[900px]:bg-[var(--panel)]";

const numberFieldClass = "grid gap-[var(--space-1)]";

const numberLabelClass = "text-[0.76rem] text-[var(--text-muted)]";

const projectListClass = `${surfaceClass} overflow-hidden`;

const projectItemClass =
  "px-[var(--space-3)] py-[var(--space-2)] [&+&]:border-t [&+&]:border-[color:var(--line)]";

const detailsClass = "group mt-[var(--space-2)]";

const detailsSummaryClass =
  "flex cursor-pointer list-none items-center gap-1 text-[0.72rem] font-semibold text-[var(--primary)] [&::-webkit-details-marker]:hidden";

type SettingsPanelProps = {
  activeSettingsTab: SettingsTabKey;
  settingsTabs: SettingsTabItem[];
  activeSettingsMeta: SettingsTabItem;
  onResetCurrentTab: () => void | Promise<void>;
  resetInProgress: boolean;
  onBack: () => void;
  onTabChange: (key: SettingsTabKey) => void;
  activeTheme: ThemeKey;
  themeOptions: Array<{ key: ThemeKey; label: string; description: string }>;
  themeBadgeLabels: Record<ThemeKey, string>;
  onThemeChange: (key: ThemeKey) => void;
  customTheme: ThemeVars;
  onCustomThemeChange: (name: string, value: string) => void;
  onResetCustomTheme: () => void;
  customCssText: string;
  customCssFileName: string;
  onCustomCssTextChange: (value: string) => void;
  onImportCustomCssFile: (file: File | null) => void | Promise<void>;
  onClearCustomCss: () => void;
  monorepoMode: MonorepoMode;
  monorepoModeOptions: Array<{ value: MonorepoMode; label: string }>;
  onMonorepoModeChange: (mode: MonorepoMode) => void;
  scanRoots: ScanRoot[];
  onAutoScanProjects: () => void | Promise<void>;
  onPickScanRoot: () => void | Promise<void>;
  onRemoveScanRoot: (path: string) => void;
  lastScanProjects: DiscoveredProject[];
  lastScanWarnings: string[];
  lastScanAt: string;
  scanInProgress: boolean;
  scanStatusText: string;
  safeMode: boolean;
  onSafeModeToggle: () => void;
  cleanupThresholdDays: number;
  onCleanupThresholdDaysChange: (value: number) => void;
  autoCleanupEnabled: boolean;
  onAutoCleanupEnabledToggle: () => void;
  autoCleanupIntervalDays: number;
  onAutoCleanupIntervalDaysChange: (value: number) => void;
  cleanupRiskProfile: CleanupRiskProfile;
  cleanupRiskProfileFields: CleanupRiskProfileKey[];
  cleanupRiskProfileFieldLabels: Record<CleanupRiskProfileKey, string>;
  onCleanupRiskProfileChange: (key: CleanupRiskProfileKey, value: RiskLevel) => void;
  onResetCleanupRiskProfile: () => void;
  onRunAutoCleanupNow: () => void | Promise<void>;
  autoCleanupRunInProgress: boolean;
  autoCleanupFeedback: {
    tone: "info" | "success" | "error";
    message: string;
  } | null;
};

const feedbackCalloutClass = (tone: "info" | "success" | "error") =>
  cn(
    "rounded-[var(--radius-sm)] border px-[var(--space-3)] py-[var(--space-3)] text-[0.76rem] leading-[1.5]",
    tone === "success" &&
      "border-[color:color-mix(in_srgb,var(--success)_36%,transparent)] [background-color:color-mix(in_srgb,var(--success)_10%,transparent)] text-[var(--success)]",
    tone === "error" &&
      "border-[color:rgba(166,61,40,0.36)] bg-[rgba(166,61,40,0.08)] text-[#a63d28]",
    tone === "info" &&
      "border-[color:var(--line)] bg-[var(--panel-soft)] text-[var(--text-normal)]",
  );

export const SettingsPanel: Component<SettingsPanelProps> = (props) => (
  <section class="grid h-full min-h-0 [grid-template-columns:220px_minmax(0,1fr)]">
    <nav
      class="flex min-h-0 flex-col gap-[var(--space-3)] border-r border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-4)]"
      aria-label="设置分类"
    >
      <button
        class="inline-flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-semibold text-[var(--text-normal)] transition-colors duration-200 hover:border-[color:var(--line-strong)] hover:text-[var(--text-strong)]"
        onClick={props.onBack}
        type="button"
      >
        <ArrowLeft size={16} strokeWidth={2.2} />
        <span>返回工作台</span>
      </button>

      <div class="flex min-h-0 flex-col gap-[var(--space-2)] overflow-auto">
        <For each={props.settingsTabs}>
          {(tab) => (
            <button
              class={navItemClass(props.activeSettingsTab === tab.key)}
              onClick={() => props.onTabChange(tab.key)}
              type="button"
            >
              <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">{tab.label}</p>
              <span class="mt-1 block text-[0.72rem] text-[var(--text-muted)]">{tab.description}</span>
            </button>
          )}
        </For>
      </div>
    </nav>

    <section class="flex min-h-0 min-w-0 flex-col">
      <header class="flex items-center justify-between gap-[var(--space-3)] border-b border-[color:var(--line)] px-[var(--space-5)] py-[var(--space-5)]">
        <div>
          <h2 class="m-0 text-[1rem] font-semibold text-[var(--text-strong)]">
            {props.activeSettingsMeta.label}设置
          </h2>
          <p class="mt-[var(--space-2)] text-[0.78rem] text-[var(--text-muted)]">
            {props.activeSettingsMeta.description}
          </p>
        </div>
        <div class="flex items-center gap-[var(--space-2)]">
          <Button
            variant="outline"
            size="sm"
            disabled={props.resetInProgress}
            onClick={props.onResetCurrentTab}
          >
            {props.resetInProgress ? "恢复中..." : "恢复本页默认设置"}
          </Button>
          <Badge variant="outline">全局默认</Badge>
        </div>
      </header>

      <section class="flex min-h-0 flex-col gap-[var(--space-6)] overflow-auto px-[var(--space-5)] pb-[var(--space-5)] pt-[var(--space-4)] max-[900px]:gap-[var(--space-5)] max-[900px]:p-[var(--space-4)]">
        <Show when={props.activeSettingsTab === "appearance"}>
          <section class="flex flex-col gap-[var(--space-3)]">
            <div class={paneHeadClass}>
              <h3 class={paneHeadingClass}>主题方案</h3>
              <p class={paneHintClass}>切换预设主题，或自定义你的配色</p>
            </div>

            <div class="grid grid-cols-2 items-stretch gap-[var(--space-2)] max-[900px]:grid-cols-1">
              <For each={props.themeOptions}>
                {(option) => (
                  <button
                    class={themeOptionClass(props.activeTheme === option.key)}
                    onClick={() => props.onThemeChange(option.key)}
                    type="button"
                  >
                    <div class="min-w-0">
                      <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">{option.label}</p>
                      <span class="mt-[var(--space-1)] block text-[0.73rem] leading-[1.38] text-[var(--text-muted)]">
                        {option.description}
                      </span>
                    </div>
                    <Badge class="min-w-[72px]" variant="outline">
                      {props.themeBadgeLabels[option.key]}
                    </Badge>
                  </button>
                )}
              </For>
            </div>

            <Show when={props.activeTheme === "custom"}>
              <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--primary-outline)] bg-[linear-gradient(180deg,var(--panel-soft),var(--panel))] p-[var(--space-3)] max-[900px]:bg-[var(--panel-soft)]">
                <div class={paneHeadClass}>
                  <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">色彩变量</h3>
                  <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">
                    统一调整界面的主色、背景和文本层级
                  </p>
                </div>

                <div class="grid grid-cols-3 gap-[var(--space-2)] max-[900px]:grid-cols-1">
                  <For each={customThemeColorFields}>
                    {(field) => (
                      <label class="flex min-h-[46px] items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] even:bg-[var(--panel-soft)] max-[900px]:bg-[var(--panel)]">
                        <span class="text-[0.76rem] font-medium text-[var(--text-normal)]">
                          {field.label}
                        </span>
                        <input
                          class="h-7 w-[42px] cursor-pointer rounded-[8px] border border-[color:var(--line-strong)] bg-[repeating-conic-gradient(from_45deg,rgba(0,0,0,0.08)_0deg_90deg,rgba(255,255,255,0.42)_90deg_180deg)] bg-[length:8px_8px] p-[2px] [&::-webkit-color-swatch-wrapper]:p-0 [&::-webkit-color-swatch]:rounded-[5px] [&::-webkit-color-swatch]:border-0 [&::-moz-color-swatch]:rounded-[5px] [&::-moz-color-swatch]:border-0"
                          type="color"
                          value={props.customTheme[field.name] ?? "#000000"}
                          onInput={(event) =>
                            props.onCustomThemeChange(field.name, event.currentTarget.value)}
                        />
                      </label>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,var(--panel-soft),var(--panel))] p-[var(--space-3)] max-[900px]:bg-[var(--panel-soft)]">
                <div class={paneHeadClass}>
                  <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">尺寸与密度</h3>
                  <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">
                    统一控制圆角、间距和窗口栏尺度
                  </p>
                </div>

                <div class="grid grid-cols-2 gap-[var(--space-2)] max-[900px]:grid-cols-1">
                  <For each={customThemeScaleFields}>
                    {(field) => {
                      const value = () =>
                        parsePixelValue(props.customTheme[field.name], field.fallback);

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
                                props.onCustomThemeChange(
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
                                props.onCustomThemeChange(
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

              <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,var(--panel-soft),var(--panel))] p-[var(--space-3)] max-[900px]:bg-[var(--panel-soft)]">
                <div class={paneHeadClass}>
                  <h3 class="m-0 text-[0.84rem] font-semibold text-[var(--text-strong)]">动效与表面质感</h3>
                  <p class="m-0 text-[0.72rem] text-[var(--text-muted)]">覆盖过渡节奏和阴影表达</p>
                </div>

                <div class="grid gap-[var(--space-2)]">
                  <For each={customThemeRawFields}>
                    {(field) => (
                      <label class="grid gap-[var(--space-1)]">
                        <span class="text-[0.72rem] text-[var(--text-muted)]">{field.label}</span>
                        <input
                          class={cn(
                            inputClass,
                            "font-mono text-[0.74rem]",
                          )}
                          value={props.customTheme[field.name] ?? ""}
                          onInput={(event) =>
                            props.onCustomThemeChange(field.name, event.currentTarget.value)}
                          placeholder={field.placeholder}
                        />
                      </label>
                    )}
                  </For>
                </div>
              </div>

              <div class="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-sm)] border border-[color:var(--primary-outline)] bg-[linear-gradient(180deg,var(--primary-soft),var(--panel-soft))] p-[var(--space-3)] shadow-[var(--shadow)]">
                <div>
                  <p class="m-0 text-[0.82rem] font-bold text-[var(--text-strong)]">高级自定义</p>
                  <span class="mt-[var(--space-1)] block text-[0.73rem] text-[var(--text-muted)]">
                    可以恢复默认色板，或导入 CSS 文件进行更细粒度覆盖
                  </span>
                </div>

                <div class="flex flex-wrap items-center gap-[var(--space-2)]">
                  <Button
                    class="border-[color:var(--primary-outline)] text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.16)] [background-image:linear-gradient(180deg,var(--primary),var(--primary-hover))] hover:[background-image:linear-gradient(180deg,var(--primary-hover),var(--primary))]"
                    onClick={props.onResetCustomTheme}
                  >
                    恢复默认自定义色板
                  </Button>

                  <label class="cursor-pointer rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] text-[0.78rem] font-semibold text-[var(--text-normal)] transition-colors duration-200 hover:border-[color:var(--primary)] hover:bg-[var(--primary-soft)] hover:text-[var(--text-strong)]">
                    <input
                      class="hidden"
                      type="file"
                      accept=".css,text/css"
                      onChange={(event) => {
                        props.onImportCustomCssFile(event.currentTarget.files?.[0] ?? null);
                        event.currentTarget.value = "";
                      }}
                    />
                    <span>导入 CSS 文件</span>
                  </label>

                    <Show when={props.customCssFileName}>
                      <Badge variant="outline">{props.customCssFileName}</Badge>
                    </Show>

                  <Button
                    variant="ghost"
                    class="border-[color:var(--line-strong)] bg-[var(--panel)] text-[var(--text-muted)] hover:bg-[var(--panel)] hover:text-[var(--text-strong)]"
                    onClick={props.onClearCustomCss}
                  >
                    清空 CSS
                  </Button>
                </div>

                <textarea
                  class={cn(inputClass, "min-h-[164px] resize-y py-[var(--space-3)] font-mono text-[0.74rem] leading-[1.6] focus:ring-2 focus:ring-[var(--primary-soft)]")}
                  value={props.customCssText}
                  onInput={(event) => props.onCustomCssTextChange(event.currentTarget.value)}
                  placeholder={"支持写入任何 CSS，例如：\n:root { --radius-md: 10px; }\nbody { letter-spacing: 0.01em; }"}
                  spellcheck={false}
                />
              </div>
            </Show>
          </section>
        </Show>

        <Show when={props.activeSettingsTab === "scan"}>
          <section class="flex flex-col gap-[var(--space-3)]">
            <div class={paneHeadActionsClass}>
              <div class={paneHeadTextClass}>
                <h3 class={paneHeadingClass}>项目自动发现</h3>
              </div>
              <div class={paneHeadActionListClass}>
                <Button onClick={props.onPickScanRoot}>添加根目录</Button>
                <Button
                  variant="outline"
                  onClick={props.onAutoScanProjects}
                  disabled={props.scanInProgress || props.scanRoots.length === 0}
                >
                  {props.scanInProgress ? "扫描中..." : "立即刷新"}
                </Button>
              </div>
            </div>

            <Show when={props.scanStatusText}>
              <div class={paneHeadClass}>
                <p class={paneHintClass}>{props.scanStatusText}</p>
              </div>
            </Show>

            <div class={paneHeadClass}>
              <h3 class={paneHeadingClass}>根目录</h3>
            </div>

            <Show when={props.scanRoots.length === 0}>
              <div class={sheetClass}>
                <header class={sheetHeaderClass}>
                  <span>还没有根目录</span>
                </header>
                <div>
                  <div class={sheetRowClass}>
                    <span class={sheetLabelClass}>操作</span>
                    <code class={sheetValueClass}>点击“添加根目录”后会自动扫描</code>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={props.scanRoots.length > 0}>
              <div class="flex flex-col gap-[var(--space-2)]">
                <For each={props.scanRoots}>
                  {(root) => (
                    <div class="grid items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel-soft)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:1fr_auto] max-[900px]:bg-[var(--panel)]">
                      <p class="m-0 font-mono text-[0.74rem] text-[var(--text-normal)]">
                        {root.path}
                        <span> · 深度 {root.depth}</span>
                      </p>
                      <button
                        class="rounded-[8px] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-2)] py-[var(--space-1)] text-[0.72rem] text-[var(--text-muted)] transition-colors duration-200 hover:border-[color:var(--line-strong)] hover:text-[var(--text-normal)]"
                        onClick={() => props.onRemoveScanRoot(root.path)}
                        type="button"
                      >
                        移除
                      </button>
                    </div>
                  )}
                </For>
              </div>
            </Show>

            <div class={paneHeadClass}>
              <h3 class={paneHeadingClass}>项目展示范围</h3>
            </div>

            <div class="inline-flex flex-wrap gap-[var(--space-1)]" role="tablist" aria-label="monorepo 展示范围">
              <For each={props.monorepoModeOptions}>
                {(option) => (
                  <button
                    class={modeChipClass(props.monorepoMode === option.value)}
                    onClick={() => props.onMonorepoModeChange(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                )}
              </For>
            </div>

            <div class={paneHeadClass}>
              <h3 class={paneHeadingClass}>发现的项目</h3>
            </div>

            <Show when={!props.lastScanAt}>
              <div class={sheetClass}>
                <header class={sheetHeaderClass}>
                  <span>暂无扫描结果</span>
                </header>
              </div>
            </Show>

            <Show when={props.lastScanAt && props.lastScanProjects.length > 0}>
              <div class={sheetClass}>
                <header class={sheetHeaderClass}>
                  <span>已发现项目</span>
                  <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                    {props.lastScanProjects.length} 个
                  </strong>
                </header>
                <div>
                  <div class={sheetRowClass}>
                    <span class={sheetLabelClass}>最近扫描</span>
                    <code class={sheetValueClass}>{new Date(props.lastScanAt).toLocaleString()}</code>
                  </div>
                </div>
                <div class={projectListClass}>
                  <For each={props.lastScanProjects}>
                    {(project) => (
                      <div class={projectItemClass}>
                        <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">
                          {project.name}
                        </p>
                        <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                          {project.path}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

            <Show when={props.lastScanAt && props.lastScanProjects.length === 0 && !props.scanInProgress}>
              <div class={sheetClass}>
                <header class={sheetHeaderClass}>
                  <span>没有发现项目</span>
                </header>
                <div>
                  <div class={sheetRowClass}>
                    <span class={sheetLabelClass}>最近扫描</span>
                    <code class={sheetValueClass}>{new Date(props.lastScanAt).toLocaleString()}</code>
                  </div>
                  <div class={sheetRowClass}>
                    <span class={sheetLabelClass}>已检测标记</span>
                    <code class={sheetValueClass}>
                      package.json / pnpm-workspace.yaml / Cargo.toml / pyproject.toml
                    </code>
                  </div>
                </div>
              </div>
            </Show>

            <Show when={props.lastScanWarnings.length > 0}>
              <div class={sheetClass}>
                <header class={sheetHeaderClass}>
                  <span>扫描告警</span>
                  <strong class="font-mono text-[0.72rem] font-medium text-[var(--text-normal)]">
                    {props.lastScanWarnings.length} 条
                  </strong>
                </header>
                <Show when={props.lastScanAt}>
                  <div>
                    <div class={sheetRowClass}>
                      <span class={sheetLabelClass}>最近扫描</span>
                      <code class={sheetValueClass}>{new Date(props.lastScanAt).toLocaleString()}</code>
                    </div>
                  </div>
                </Show>
                <div class={projectListClass}>
                  <For each={props.lastScanWarnings}>
                    {(warning) => (
                      <div class={projectItemClass}>
                        <p class="m-0 text-[0.8rem] font-semibold text-[var(--text-strong)]">告警</p>
                        <span class="mt-[var(--space-1)] block font-mono text-[0.72rem] text-[var(--text-muted)]">
                          {warning}
                        </span>
                      </div>
                    )}
                  </For>
                </div>
              </div>
            </Show>

          </section>
        </Show>

        <Show when={props.activeSettingsTab === "cleanup"}>
          <section class="flex flex-col gap-[var(--space-3)]">
            <div class={paneHeadClass}>
              <h3 class={paneHeadingClass}>全局默认设置</h3>
            </div>

            <div class={policyRowClass}>
              <span class="text-[0.8rem] text-[var(--text-normal)]">安全模式（移入系统回收站）</span>
              <Switch
                checked={props.safeMode}
                onChange={props.onSafeModeToggle}
                aria-label="安全模式"
              >
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </Switch>
            </div>

            <label class={numberFieldClass}>
              <span class={numberLabelClass}>清理阈值（天）</span>
              <input
                class={inputClass}
                value={String(props.cleanupThresholdDays)}
                onInput={(event) =>
                  props.onCleanupThresholdDaysChange(Number(event.currentTarget.value) || 1)}
                type="number"
                min="1"
              />
            </label>

            <div class={paneHeadActionsClass}>
              <div class={paneHeadTextClass}>
                <h3 class={paneHeadingClass}>自动清理</h3>
                <p class={paneHintClass}>按当前自动清理策略立即执行一次，忽略调度间隔。</p>
              </div>
              <div class={paneHeadActionListClass}>
                <Button
                  variant="outline"
                  onClick={props.onRunAutoCleanupNow}
                  disabled={props.autoCleanupRunInProgress}
                >
                  {props.autoCleanupRunInProgress ? "执行中..." : "立即执行一次"}
                </Button>
              </div>
            </div>

            <div class={policyRowClass}>
              <span class="text-[0.8rem] text-[var(--text-normal)]">启用自动清理</span>
              <Switch
                checked={props.autoCleanupEnabled}
                onChange={props.onAutoCleanupEnabledToggle}
                aria-label="启用自动清理"
              >
                <SwitchControl>
                  <SwitchThumb />
                </SwitchControl>
              </Switch>
            </div>

            <label class={numberFieldClass}>
              <span class={numberLabelClass}>自动清理间隔（天）</span>
              <input
                class={inputClass}
                value={String(props.autoCleanupIntervalDays)}
                onInput={(event) =>
                  props.onAutoCleanupIntervalDaysChange(Number(event.currentTarget.value) || 1)}
                type="number"
                min="1"
                disabled={!props.autoCleanupEnabled}
              />
            </label>

            <Show when={props.autoCleanupFeedback}>
              {(feedback) => (
                <div class={feedbackCalloutClass(feedback().tone)}>
                  <p class="m-0">{feedback().message}</p>
                </div>
              )}
            </Show>

            <div class={paneHeadActionsClass}>
              <div class={paneHeadTextClass}>
                <h3 class={paneHeadingClass}>风险方案</h3>
              </div>
              <div class={paneHeadActionListClass}>
                <Button
                  variant="outline"
                  size="sm"
                  class="bg-[var(--panel)] hover:border-[color:var(--primary-outline)] hover:bg-[var(--primary-soft)]"
                  onClick={props.onResetCleanupRiskProfile}
                >
                  恢复默认风险方案
                </Button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-[var(--space-3)] max-[900px]:grid-cols-1">
              <section class="overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--primary-outline)] bg-[linear-gradient(180deg,var(--panel-soft),var(--panel))]">
                <header class="flex items-center justify-between gap-[var(--space-2)] border-b border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)]">
                  <div class="min-w-0">
                    <strong class="text-[0.84rem] text-[var(--text-strong)]">低风险</strong>
                    <span class="mt-[2px] block text-[0.72rem] text-[var(--text-muted)]">自动清理</span>
                  </div>
                  <Badge variant="success">
                    {
                      resolveRiskFieldsByLevel(
                        props.cleanupRiskProfileFields,
                        props.cleanupRiskProfile,
                        "low",
                      ).length
                    }{" "}
                    项
                  </Badge>
                </header>
                <div class="flex flex-col gap-[var(--space-2)] p-[var(--space-3)]">
                  <For
                    each={resolveRiskFieldsByLevel(
                      props.cleanupRiskProfileFields,
                      props.cleanupRiskProfile,
                      "low",
                    )}
                  >
                    {(key) => (
                      <div class="grid min-h-[54px] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:minmax(0,1fr)_auto]">
                        <span class="text-[0.76rem] leading-[1.45] text-[var(--text-normal)]">
                          {props.cleanupRiskProfileFieldLabels[key]}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          class="px-[var(--space-2)] py-[5px] text-[0.72rem]"
                          onClick={() => props.onCleanupRiskProfileChange(key, "medium")}
                        >
                          设为中风险 →
                        </Button>
                      </div>
                    )}
                  </For>
                  <Show
                    when={
                      resolveRiskFieldsByLevel(
                        props.cleanupRiskProfileFields,
                        props.cleanupRiskProfile,
                        "low",
                      ).length === 0
                    }
                  >
                    <p class="rounded-[var(--radius-sm)] border border-dashed border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] text-center text-[0.74rem] text-[var(--text-muted)]">
                      暂无低风险项目
                    </p>
                  </Show>
                </div>
              </section>

              <section class="overflow-hidden rounded-[var(--radius-sm)] border border-[color:var(--line-strong)] bg-[linear-gradient(180deg,var(--panel-soft),var(--panel))]">
                <header class="flex items-center justify-between gap-[var(--space-2)] border-b border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)]">
                  <div class="min-w-0">
                    <strong class="text-[0.84rem] text-[var(--text-strong)]">中风险</strong>
                    <span class="mt-[2px] block text-[0.72rem] text-[var(--text-muted)]">仅手动清理</span>
                  </div>
                  <Badge variant="warning">
                    {
                      resolveRiskFieldsByLevel(
                        props.cleanupRiskProfileFields,
                        props.cleanupRiskProfile,
                        "medium",
                      ).length
                    }{" "}
                    项
                  </Badge>
                </header>
                <div class="flex flex-col gap-[var(--space-2)] p-[var(--space-3)]">
                  <For
                    each={resolveRiskFieldsByLevel(
                      props.cleanupRiskProfileFields,
                      props.cleanupRiskProfile,
                      "medium",
                    )}
                  >
                    {(key) => (
                      <div class="grid min-h-[54px] items-center gap-[var(--space-2)] rounded-[var(--radius-sm)] border border-[color:var(--line)] bg-[var(--panel)] px-[var(--space-3)] py-[var(--space-2)] [grid-template-columns:minmax(0,1fr)_auto]">
                        <span class="text-[0.76rem] leading-[1.45] text-[var(--text-normal)]">
                          {props.cleanupRiskProfileFieldLabels[key]}
                        </span>
                        <Button
                          variant="outline"
                          size="sm"
                          class="px-[var(--space-2)] py-[5px] text-[0.72rem]"
                          onClick={() => props.onCleanupRiskProfileChange(key, "low")}
                        >
                          ← 设为低风险
                        </Button>
                      </div>
                    )}
                  </For>
                  <Show
                    when={
                      resolveRiskFieldsByLevel(
                        props.cleanupRiskProfileFields,
                        props.cleanupRiskProfile,
                        "medium",
                      ).length === 0
                    }
                  >
                    <p class="rounded-[var(--radius-sm)] border border-dashed border-[color:var(--line)] px-[var(--space-3)] py-[var(--space-3)] text-center text-[0.74rem] text-[var(--text-muted)]">
                      暂无中风险项目
                    </p>
                  </Show>
                </div>
              </section>
            </div>
          </section>
        </Show>
      </section>
    </section>
  </section>
);
