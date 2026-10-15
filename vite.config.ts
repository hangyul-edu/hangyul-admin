import { defineConfig, type Connect } from "vite";
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
// dev server, by `vite preview`, by the API's single-server hosting and by a
// static host. The build lands in dist/admin, so a host that serves dist/
// as-is needs no rewrite for the portal's files.
//
// The dev server proxies /api → the backend so the browser never makes a
// cross-origin request in development. The member app's dev server
// (hangyul-learn-app, :5173) forwards its /admin here, so the portal also
// opens at http://localhost:5173/admin.
export default defineConfig(({ mode }) => {
  const backend = process.env.VITE_DEV_BACKEND || "http://127.0.0.1:8000";
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
