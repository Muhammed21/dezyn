import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const ENV_DIR = "../..";

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  envDir: ENV_DIR,
  define: {
    "import.meta.env.VITE_WEB_URL": JSON.stringify(loadEnv(mode, ENV_DIR, "").WEB_URL ?? ""),
  },
  server: { host: "127.0.0.1", port: 5173, strictPort: true },
}));
