// Сборка UI (Task 21): `vite build` → `web/dist`, его отдаёт сервер (`@fastify/static`).
// В `--dev` Vite работает middleware внутри Fastify на том же порту 8790 (Q7, `dev-vite.ts`):
// своего dev-сервера и порта нет. JSX — встроенным oxc (без плагина React: без fast refresh,
// HMR перезагружает страницу).
import { defineConfig } from "vite";

export default defineConfig({
  root: import.meta.dirname,
  oxc: { jsx: { runtime: "automatic" } },
  build: { outDir: "dist", emptyOutDir: true, sourcemap: false },
  server: {
    // только свои имена: защита HMR-сокета от DNS rebinding (F4, CVE-2025-24010)
    allowedHosts: ["127.0.0.1", "localhost"],
  },
});
