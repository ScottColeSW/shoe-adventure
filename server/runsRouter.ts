// The run-completion and leaderboard API surface, as an Express Router following the
// exact dual-mount pattern server/agent/router.ts already established: server/index.ts
// only runs in production, so this router is also mounted directly into Vite's dev
// middleware chain (see vitePluginRunsApi in vite.config.ts) to work identically in
// `pnpm dev` and `pnpm start`.

import express, { Router } from "express";
import { recordRun, getLeaderboard } from "./runs";
import { markRunWon } from "./agent/history";

export const runsRouter: Router = Router();

runsRouter.use(express.json());

runsRouter.post("/complete", (req, res) => {
  const body = req.body as {
    runId?: unknown;
    mode?: unknown;
    backend?: unknown;
    model?: unknown;
    seconds?: unknown;
    hearts?: unknown;
    buttons?: unknown;
  };
  if (
    typeof body?.runId !== "string" ||
    (body.mode !== "human" && body.mode !== "agent") ||
    typeof body.seconds !== "number" ||
    typeof body.hearts !== "number" ||
    typeof body.buttons !== "number"
  ) {
    res.status(400).json({ error: "runId, mode, seconds, hearts, and buttons are required" });
    return;
  }
  recordRun({
    runId: body.runId,
    mode: body.mode,
    backend: typeof body.backend === "string" ? body.backend : null,
    model: typeof body.model === "string" ? body.model : null,
    seconds: body.seconds,
    hearts: body.hearts,
    buttons: body.buttons,
  });
  // Every POST here already represents a win -- GameWorld.ts's recordRunCompletion (the
  // only caller) fires exclusively from checkRescue()'s win branch, losses never reach
  // this route at all. "agent" only: a human's own win shouldn't reward the agent memory,
  // there's no decisions-table row for a human playthrough to mark in the first place.
  if (body.mode === "agent") markRunWon(body.runId);
  res.json({ ok: true });
});

runsRouter.get("/leaderboard", (req, res) => {
  const limitParam = Number(req.query.limit);
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(50, Math.floor(limitParam)) : 10;
  res.json({ entries: getLeaderboard(limit) });
});
