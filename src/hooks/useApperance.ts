import { createEffect, createRoot, createSignal, onCleanup, type Accessor, type Setter } from "solid-js";
import { themePresets } from "~/workspace/constants";
import type { ThemeKey, ThemePresetKey, ThemeVars } from "~/workspace/types";

const hexToRgba = (hex: string, alpha: number) => {
  const normalized = hex.replace("#", "");
  if (normalized.length !== 3 && normalized.length !== 6) return `rgba(20, 85, 139, ${alpha})`;

  const expanded = normalized.length === 3
    ? normalized
        .split("")
        .map((char) => char + char)
        .join("")
    : normalized;

  const red = Number.parseInt(expanded.slice(0, 2), 16);
  const green = Number.parseInt(expanded.slice(2, 4), 16);
  const blue = Number.parseInt(expanded.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
};

const resolveSystemThemePreset = (): ThemePresetKey => {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "white";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "black" : "white";
};

type LegacyMediaQueryList = {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

const subscribeMediaQuery = (
  mediaQuery: MediaQueryList,
  listener: (event: MediaQueryListEvent) => void,
) => {
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", listener);
    return () => mediaQuery.removeEventListener("change", listener);
  }

  const legacyMediaQuery = mediaQuery as unknown as LegacyMediaQueryList;
  legacyMediaQuery.addListener?.(listener);
  return () => legacyMediaQuery.removeListener?.(listener);
};

type ApperanceState = {
  activeTheme: Accessor<ThemeKey>;
  setActiveTheme: Setter<ThemeKey>;
  customTheme: Accessor<ThemeVars>;
  setCustomTheme: Setter<ThemeVars>;
  updateCustomTheme: (name: string, value: string) => void;
  resetCustomTheme: () => void;
  customCssText: Accessor<string>;
  setCustomCssText: Setter<string>;
  customCssFileName: Accessor<string>;
  setCustomCssFileName: Setter<string>;
  importCustomCssFile: (file: File | null) => Promise<void>;
  clearCustomCss: () => void;
};

const createApperanceState = (): ApperanceState => {
  const [activeTheme, setActiveTheme] = createSignal<ThemeKey>("system");
  const [systemThemePreset, setSystemThemePreset] = createSignal<ThemePresetKey>(
    resolveSystemThemePreset(),
  );
  const [customTheme, setCustomTheme] = createSignal<ThemeVars>({
    ...themePresets[resolveSystemThemePreset()],
  });
  const [customCssText, setCustomCssText] = createSignal("");
  const [customCssFileName, setCustomCssFileName] = createSignal("");

  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = (matchesDark: boolean) => setSystemThemePreset(matchesDark ? "black" : "white");
    const handleChange = (event: MediaQueryListEvent) => syncSystemTheme(event.matches);

    syncSystemTheme(mediaQuery.matches);
    onCleanup(subscribeMediaQuery(mediaQuery, handleChange));
  }

  createEffect(() => {
    const themeKey = activeTheme();
    const themeVars = themeKey === "custom"
      ? customTheme()
      : themePresets[themeKey === "system" ? systemThemePreset() : themeKey];
    Object.entries(themeVars).forEach(([name, value]) =>
      document.documentElement.style.setProperty(name, value)
    );
  });

  createEffect(() => {
    if (typeof document === "undefined") return;

    const styleId = "keshigomu-custom-theme-style";
    const cssText = customCssText().trim();
    const shouldApply = activeTheme() === "custom" && cssText.length > 0;
    const currentNode = document.getElementById(styleId);

    if (!shouldApply) {
      currentNode?.remove();
      return;
    }

    const styleElement = currentNode instanceof HTMLStyleElement
      ? currentNode
      : document.createElement("style");
    styleElement.id = styleId;
    styleElement.textContent = cssText;

    if (!currentNode) document.head.append(styleElement);
  });

  const updateCustomTheme = (name: string, value: string) => {
    setCustomTheme((prev) => {
      const nextTheme = {
        ...prev,
        [name]: value,
      };

      if (name === "--primary") {
        nextTheme["--primary-soft"] = hexToRgba(value, 0.1);
        nextTheme["--primary-outline"] = hexToRgba(value, 0.36);
      }

      return nextTheme;
    });
  };

  const resetCustomTheme = () => setCustomTheme({ ...themePresets[systemThemePreset()] });

  const importCustomCssFile = async (file: File | null) => {
    if (!file) return;
    const cssText = await file.text();
    setCustomCssText(cssText);
    setCustomCssFileName(file.name);
  };

  const clearCustomCss = () => (setCustomCssText(""), setCustomCssFileName(""));

  return {
    activeTheme,
    setActiveTheme,
    customTheme,
    setCustomTheme,
    updateCustomTheme,
    resetCustomTheme,
    customCssText,
    setCustomCssText,
    customCssFileName,
    setCustomCssFileName,
    importCustomCssFile,
    clearCustomCss,
  };
};

let apperanceState: ApperanceState | null = null;

export const useApperance = () =>
  apperanceState ?? (apperanceState = createRoot(() => createApperanceState()));
