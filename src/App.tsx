import { Navigate, Route, Router } from "@solidjs/router";
import {
  createEffect,
  createResource,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import {
  buildSettingsSnapshot,
  hydrateStateFromSettings,
  shouldAutoScanProjects,
} from "./appSettings";
import { useApperance } from "./hooks/useApperance";
import { useCleanup } from "./hooks/useCleanup";
import { useProject } from "./hooks/useProject";
import { useScanRoots } from "./hooks/useScanRoots";
import { CleanupPage } from "./routes/cleanup";
import { Layout } from "./routes/layout/index";
import { ManagePage } from "./routes/manage";
import { SettingsPage } from "./routes/settings";
import { loadSettings, saveSettingsPatch } from "./services/settingsClient";

const persistDebounceMs = 900;

const App = () => {
  const appearance = useApperance();
  const project = useProject();
  const scan = useScanRoots();
  const cleanup = useCleanup();
  const [settingsResource] = createResource(loadSettings);
  const [lastPersistedPayload, setLastPersistedPayload] = createSignal<
    string | null
  >(null);

  const settingsSnapshot = () =>
    buildSettingsSnapshot({
      appearance,
      project,
      scan,
      cleanup,
    });

  createEffect(() => {
    const settings = settingsResource();
    if (!settings) return;
    hydrateStateFromSettings(settings, {
      appearance,
      project,
      scan,
      cleanup,
    });
  });

  createEffect(() => {
    if (lastPersistedPayload() !== null) return;
    if (settingsResource.loading) return;
    setLastPersistedPayload(JSON.stringify(settingsSnapshot()));
  });

  createEffect(() => {
    if (!shouldAutoScanProjects(Boolean(settingsResource()), lastPersistedPayload(), scan.lastScanAt()))
      return;
    scan.autoScanProjects();
  });

  createEffect(() => {
    if (settingsResource.loading) return;
    const previousPayload = lastPersistedPayload();
    if (previousPayload === null) return;
    const currentSnapshot = settingsSnapshot();
    const payload = JSON.stringify(currentSnapshot);
    if (payload === previousPayload) return;

    const persistTimer = setTimeout(() => {
      saveSettingsPatch(currentSnapshot).then(() =>
        setLastPersistedPayload(payload),
      );
    }, persistDebounceMs);
    onCleanup(() => clearTimeout(persistTimer));
  });

  onMount(() => {
    const preventContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener("contextmenu", preventContextMenu);
    onCleanup(() => window.removeEventListener("contextmenu", preventContextMenu));
  });

  return (
    <Router>
      <Route path="/" component={() => <Navigate href="/manage" />} />
      <Route component={Layout}>
        <Route path="/manage" component={ManagePage} />
        <Route path="/cleanup" component={CleanupPage} />
      </Route>
      <Route path="/settings" component={SettingsPage} />
      <Route path="*all" component={() => <Navigate href="/manage" />} />
    </Router>
  );
};

export default App;
