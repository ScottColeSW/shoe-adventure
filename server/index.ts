import express from "express";
import { createServer } from "http";
import path from "path";
import { fileURLToPath } from "url";
import { agentRouter } from "./agent/router";
import { runsRouter } from "./runsRouter";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);

  // Agent-decision API (see server/agent/router.ts) -- registered before
  // the static/catch-all handlers below so /api/agent/* is matched first.
  app.use("/api/agent", agentRouter);
  // Run-completion and leaderboard API (see server/runsRouter.ts) -- same reasoning as
  // agentRouter above, registered before the static/catch-all handlers.
  app.use("/api/runs", runsRouter);

  // Serve static files from dist/public in production
  const staticPath =
    process.env.NODE_ENV === "production"
      ? path.resolve(__dirname, "public")
      : path.resolve(__dirname, "..", "dist", "public");

  app.use(express.static(staticPath));

  // Handle client-side routing - serve index.html for all routes
  app.get("*", (_req, res) => {
    res.sendFile(path.join(staticPath, "index.html"));
  });

  const port = process.env.PORT || 3000;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
