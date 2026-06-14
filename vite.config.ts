import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  // .glb meshes for the cortex node assets (Meshy image-to-3D outputs)
  assetsInclude: ["**/*.glb"],
  build: {
    target: ["es2021", "chrome100", "safari13"],
  },
});
