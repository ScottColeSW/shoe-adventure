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
import { decide, warmModel, unloadModel } from "./decide";
import { getStats, recordOutcome, type DecisionRecord } from "./history";
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

/** Called once by the title screen's Agent Run picker right as a run starts (see
 * GameCanvas.tsx's dispatchStartAgent) so the ~12s-on-cold-hardware model-load cost (see
 * warmModel's own docstring) lands during an explicit "starting..." moment instead of
 * silently stalling whatever gameplay decision happens to be first. */
agentRouter.post("/warm", async (req, res) => {
  const backend = req.body?.backend as DecisionRequest["backend"] | undefined;
  const model = req.body?.model as string | undefined;
  if (!backend || !model) {
    res.status(400).json({ error: "backend and model are required" });
    return;
  }
  const result = await warmModel(backend, model);
  res.json(result);
});

/** unloadModel's HTTP surface -- called from the client's quit() and from the Agent Run
 * picker right before switching to a different model, so a model doesn't just sit loaded
 * in RAM/VRAM for its full 30-minute keep_alive after nobody's using it anymore. */
agentRouter.post("/unload", async (req, res) => {
  const backend = req.body?.backend as DecisionRequest["backend"] | undefined;
  const model = req.body?.model as string | undefined;
  if (!backend || !model) {
    res.status(400).json({ error: "backend and model are required" });
    return;
  }
  const result = await unloadModel(backend, model);
  res.json(result);
});

const VALID_OUTCOMES: DecisionRecord["outcome"][] = ["enemy_defeated", "player_damaged", "avoided", "unknown"];

/** Closes the loop on a decision's outcome (see history.ts's recordOutcome / getMemory)
 * -- the client calls this shortly after an enemyResponse decision resolves, so the
 * "unknown" outcome decide.ts writes at decision time gets filled in with what actually
 * happened. Best-effort: a missing/invalid id or outcome is a 400, not a thrown error. */
agentRouter.post("/decide/:id/outcome", (req, res) => {
  const id = Number(req.params.id);
  const outcome = req.body?.outcome as DecisionRecord["outcome"] | undefined;
  if (!Number.isInteger(id) || !outcome || !VALID_OUTCOMES.includes(outcome)) {
    res.status(400).json({ error: "a valid decision id and outcome (enemy_defeated | player_damaged | avoided | unknown) are required" });
    return;
  }
  recordOutcome(id, outcome);
  res.json({ ok: true });
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
