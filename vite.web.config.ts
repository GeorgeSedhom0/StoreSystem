import { resolve } from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standalone web build of the renderer (no Electron).
// Produces a plain SPA in server/static that FastAPI serves at "/".
// The app uses HashRouter, so a single index.html handles every route.
//
// In dev (`pnpm dev:web`) it also proxies all API calls to the running backend
// container on https://localhost:8000 so the SPA is fully functional locally
// (used for responsive testing). The proxy strips `Secure`/`SameSite=None` from
// auth cookies so they persist over the http dev origin.
export default defineConfig(({ command }) => ({
  root: resolve("src/renderer"),
  base: "/",
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
    },
  },
  plugins: [react()],
  build: {
    outDir: resolve("server/static"),
    emptyOutDir: true,
  },
  server:
    command === "serve"
      ? {
          port: 5173,
          proxy: {
            // Everything that isn't the root document, a vite-internal path,
            // or a static asset is an API call → proxy to the backend.
            "^/(?!$|@|src/|node_modules/|favicon|assets/).+": {
              target: "https://localhost:8000",
              changeOrigin: true,
              secure: false,
              configure: (proxy) => {
                proxy.on("proxyRes", (proxyRes) => {
                  const sc = proxyRes.headers["set-cookie"];
                  if (sc) {
                    proxyRes.headers["set-cookie"] = sc.map((c) =>
                      c
                        .replace(/;\s*Secure/gi, "")
                        .replace(/SameSite=None/gi, "SameSite=Lax"),
                    );
                  }
                });
              },
            },
          },
        }
      : undefined,
}));
