import { onCleanup, onMount } from "solid-js";

type WorkspaceShortcutHandlers = {
  onOpenCommandPalette: () => void;
  onOpenSettings: () => void;
  onManagePage: () => void;
  onCleanupPage: () => void;
};

export const useWorkspaceShortcuts = (handlers: WorkspaceShortcutHandlers) => {
  onMount(() => {
    const handleGlobalShortcuts = (event: KeyboardEvent) => {
      const isCommandPaletteHotkey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k";
      const isSettingsHotkey = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === ",";
      const isManageHotkey = (event.metaKey || event.ctrlKey) && event.key === "1";
      const isCleanupHotkey = (event.metaKey || event.ctrlKey) && event.key === "2";

      if (isCommandPaletteHotkey) {
        event.preventDefault();
        handlers.onOpenCommandPalette();
        return;
      }

      if (isSettingsHotkey) {
        event.preventDefault();
        handlers.onOpenSettings();
        return;
      }

      if (isManageHotkey) {
        event.preventDefault();
        handlers.onManagePage();
        return;
      }

      if (isCleanupHotkey) {
        event.preventDefault();
        handlers.onCleanupPage();
      }
    };

    window.addEventListener("keydown", handleGlobalShortcuts);
    onCleanup(() => window.removeEventListener("keydown", handleGlobalShortcuts));
  });
};
