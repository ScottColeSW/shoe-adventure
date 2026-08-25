import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";

function vitePluginAgentApi(): Plugin {
  // server/index.ts (the production Express app) never runs under
  // `pnpm dev` -- only Vite does. Mounting the same agentRouter here means
  // /api/agent/* works identically in dev and prod instead of only
  // appearing once a real build exists. See server/agent/router.ts's
  // module docstring for why an Express Router can be reused this way.
  //
  // Important: the router is wrapped in its own tiny express() app rather than handed
  // straight to server.middlewares.use(). A bare Router() run as plain Connect middleware
  // never passes through Express's app.handle(), which is the only place res gets
  // patched with res.json/res.status/etc -- so a directly-mounted Router's res.json is
  // undefined and every route 500s. Wrapping it in express() restores that patching.
  return {
    name: "shoe-adventure-agent-api",
    async configureServer(server: ViteDevServer) {
      const express = (await import("express")).default;
      const { agentRouter } = await import("./server/agent/router");
      const app = express();
      app.use("/api/agent", agentRouter);
      server.middlewares.use(app);

      // Best-effort disk hygiene on Ctrl+C during `pnpm dev` -- see closeDb's own comment
      // in history.ts/runs.ts. Deliberately no process.exit() here: Vite's own CLI owns
      // SIGINT and the actual shutdown sequence in dev mode, this just closes the two
      // SQLite handles alongside it rather than racing or short-circuiting that.
      const { closeDb: closeHistoryDb } = await import("./server/agent/history");
      const { closeDb: closeRunsDb } = await import("./server/runs");
      process.on("SIGINT", () => {
        closeHistoryDb();
        closeRunsDb();
      });
    },
  };
}

function vitePluginRunsApi(): Plugin {
  // Same reasoning as vitePluginAgentApi above, including the express()-wrapping fix,
  // for /api/runs/* (see server/runsRouter.ts).
  return {
    name: "shoe-adventure-runs-api",
    async configureServer(server: ViteDevServer) {
      const express = (await import("express")).default;
      const { runsRouter } = await import("./server/runsRouter");
      const app = express();
      app.use("/api/runs", runsRouter);
      server.middlewares.use(app);
    },
  };
}

const plugins = [react(), tailwindcss(), vitePluginAgentApi(), vitePluginRunsApi()];

export default defineConfig({
  plugins,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
    strictPort: false, // Will find next available port if 3000 is busy
    host: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
