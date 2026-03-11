import { beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock();

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const importSettingsClient = () => import(`./settingsClient?test=${Date.now()}`);

describe("settingsClient", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ ok: true });
  });

  test("loads settings without extra payload", async () => {
    const settingsClient = await importSettingsClient();
    await settingsClient.loadSettings();

    expect(invokeMock).toHaveBeenCalledWith("load_settings");
  });

  test("saves a settings patch with patch payload", async () => {
    const settingsClient = await importSettingsClient();
    const patch = { cleanup: { autoPlan: { enabled: false } } };

    await settingsClient.saveSettingsPatch(patch);

    expect(invokeMock).toHaveBeenCalledWith("save_settings_patch", { patch });
  });

  test("resets a settings section with section payload", async () => {
    const settingsClient = await importSettingsClient();
    await settingsClient.resetSettingsSection("cleanup");

    expect(invokeMock).toHaveBeenCalledWith("reset_settings_section", {
      section: "cleanup",
    });
  });
});
