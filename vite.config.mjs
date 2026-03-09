import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const tauriHost = process.env.TAURI_DEV_HOST;
const host = tauriHost || "127.0.0.1";
const configDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [tailwindcss(), solid()],
  resolve: {
    alias: {
      "~": resolve(configDir, "src"),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host,
    hmr: tauriHost
      ? {
          protocol: "ws",
          host: tauriHost,
          port: 1421,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
