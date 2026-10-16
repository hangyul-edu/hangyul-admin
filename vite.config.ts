import { defineConfig, loadEnv, type Connect } from "vite";
import react from "@vitejs/plugin-react";

// Vite serves the portal at /admin/ only; send the bare /admin there, as
// every other host of the portal does.
const redirectBareBase: Connect.NextHandleFunction = (req, res, next) => {
  const [path, query] = (req.url ?? "").split("?");
  if (path !== "/admin") return next();
  res.statusCode = 302;
  res.setHeader("Location", `/admin/${query ? `?${query}` : ""}`);
  res.end();
};

// The admin portal is served under /admin (its router's basename) — by this
// dev server, by `vite preview` and by its own Vercel deployment. The build
// lands in dist/admin, so a host that serves dist/ as-is needs no rewrite for
// the portal's files. The API never serves the portal.
//
// The dev server proxies /api → the backend so the browser never makes a
// cross-origin request in development. The portal is reached only through
// its own server; the member app's server does not serve or forward it.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backend = env.VITE_DEV_BACKEND || "http://127.0.0.1:8000";
  requireApiUrlOnVercel(env);
  return {
    base: "/admin/",
    plugins: [
      react(),
      {
        name: "admin-bare-base-redirect",
        configureServer: (server) => void server.middlewares.use(redirectBareBase),
        configurePreviewServer: (server) => void server.middlewares.use(redirectBareBase),
      },
    ],
    server: {
      port: 5174,
      proxy: {
        "/api": {
          target: backend,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api/, ""),
        },
      },
    },
    preview: { port: 5174 },
    build: {
      outDir: "dist/admin",
      emptyOutDir: true,
      sourcemap: mode !== "production",
    },
  };
});

/** On Vercel the API is another domain. Without its address the build would
 * fall back to "/api" on the portal's own domain, where the SPA rewrite
 * answers every API call with index.html — so fail the build instead. */
function requireApiUrlOnVercel(env: Record<string, string>): void {
  if (!env.VERCEL) return;
  const url = (env.VITE_API_BASE_URL ?? "").trim();
  if (!/^https:\/\/[^/]/.test(url)) {
    throw new Error(
      `VITE_API_BASE_URL must be the API's https URL (e.g. https://api.example.com) in the Vercel project's ` +
        `environment variables; got ${url ? JSON.stringify(url) : "nothing"}.`,
    );
  }
}
