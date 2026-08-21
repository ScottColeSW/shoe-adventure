// The agent-decision API surface, as an Express Router rather than routes
// bolted directly onto server/index.ts. Reason: server/index.ts (the
// Express app) only runs in production (`pnpm start`) -- `pnpm dev` runs
// Vite alone with no Express server at all (see vite.config.ts). An
// Express Router is plain Connect-compatible middleware
// ((req, res, next) => ...), so this same router mounts both into the
// production Express app AND directly into Vite's dev middleware chain
// (see the new vitePluginAgentApi in vite.config.ts) -- one implementation,
// both entry points, no route drift between dev and prod.

import express, { Router } from "express";
import { decide } from "./decide";
import { getStats } from "./history";
import { agentConfig } from "./config";
import type { DecisionRequest } from "./types";

export const agentRouter: Router = Router();

agentRouter.use(express.json());

agentRouter.post("/decide", async (req, res) => {
  const body = req.body as Partial<DecisionRequest>;
  if (!body?.runId || !body.decisionType || !body.backend || !body.model || !body.state) {
    res.status(400).json({ error: "runId, decisionType, backend, model, and state are required" });
    return;
  }
  const response = await decide(body as DecisionRequest);
  res.json(response);
});

agentRouter.get("/stats", (_req, res) => {
  res.json(getStats());
});

agentRouter.get("/models", (_req, res) => {
  // Static roster for now -- Dominion's /api/models does a live reachability
  // check against each backend (see server/model_catalog.py); a fast-follow
  // here, not required to prove the decision round-trip in Phase 1.
  res.json({
    backends: [
      { name: "ollama", url: agentConfig.ollamaUrl, supportsConstrainedOutput: false },
      { name: "llamacpp", url: agentConfig.llamacppUrl, supportsConstrainedOutput: true },
      { name: "hosted", url: agentConfig.hostedApiUrl, supportsConstrainedOutput: true, configured: Boolean(agentConfig.hostedApiKey) },
    ],
  });
});
