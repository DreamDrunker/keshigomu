import { beforeEach, describe, expect, mock, test } from "bun:test";

const invokeMock = mock();

mock.module("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

const importCleanupClient = () => import(`./cleanupClient?test=${Date.now()}`);

describe("cleanupClient", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockResolvedValue({ ok: true });
  });

  test("calls scan_projects with request payload", async () => {
    const cleanupClient = await importCleanupClient();
    const request = { roots: [{ path: "/tmp/code", depth: 3 }] };

    await cleanupClient.scanProjects(request);

    expect(invokeMock).toHaveBeenCalledWith("scan_projects", { request });
  });

  test("calls build_cleanup_plan with request payload", async () => {
    const cleanupClient = await importCleanupClient();
    const request = { projectIds: ["project-a"] };

    await cleanupClient.buildCleanupPlan(request);

    expect(invokeMock).toHaveBeenCalledWith("build_cleanup_plan", { request });
  });

  test("calls execute_cleanup with request payload", async () => {
    const cleanupClient = await importCleanupClient();
    const request = {
      dryRun: false,
      entries: [{ projectId: "project-a", selectedItemIds: ["dist"], safeMode: true }],
    };

    await cleanupClient.executeCleanup(request);

    expect(invokeMock).toHaveBeenCalledWith("execute_cleanup", { request });
  });

  test("calls run_auto_cleanup with request payload", async () => {
    const cleanupClient = await importCleanupClient();
    const request = { force: true };

    await cleanupClient.runAutoCleanup(request);

    expect(invokeMock).toHaveBeenCalledWith("run_auto_cleanup", { request });
  });

  test("calls list_cleanup_history with request payload", async () => {
    const cleanupClient = await importCleanupClient();
    const request = { limit: 20, offset: 0, status: "success" as const };

    await cleanupClient.listCleanupHistory(request);

    expect(invokeMock).toHaveBeenCalledWith("list_cleanup_history", { request });
  });
});
