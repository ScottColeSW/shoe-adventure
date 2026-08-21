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
import { getModelCatalog } from "./catalog";
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
  // Static roster: which backends this build knows how to talk to at all,
  // regardless of whether anything is actually running right now. See
  // /catalog below for the live, "what's actually installed" version.
  res.json({
    backends: [
      { name: "ollama", url: agentConfig.ollamaUrl, supportsConstrainedOutput: false },
      { name: "llamacpp", url: agentConfig.llamacppUrl, supportsConstrainedOutput: true },
      { name: "hosted", url: agentConfig.hostedApiUrl, supportsConstrainedOutput: true, configured: Boolean(agentConfig.hostedApiKey) },
    ],
  });
});

agentRouter.get("/catalog", async (_req, res) => {
  // Backs the title screen's Agent Run model picker: every Ollama model
  // actually installed on this machine right now, plus enough system
  // memory info to grey out a pick that would not comfortably fit. See
  // catalog.ts's own docstring for how this maps to Dominion's
  // model_catalog.py.
  res.json(await getModelCatalog());
});
